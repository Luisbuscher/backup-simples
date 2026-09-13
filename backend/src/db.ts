import pg from "pg";
import type { AppConfig } from "./config.js";

const { Pool } = pg;

export function createPool(config: AppConfig) {
  return new Pool({
    ...config.appDb,
    ssl: config.appDb.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export async function initializeSchema(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id uuid PRIMARY KEY,
      first_name text NOT NULL,
      last_name text NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      email_verified_at timestamptz,
      confirmation_token_hash text,
      confirmation_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_idx
      ON app_users (lower(email));
    CREATE UNIQUE INDEX IF NOT EXISTS app_users_confirmation_token_idx
      ON app_users (confirmation_token_hash)
      WHERE confirmation_token_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS backup_databases (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
      name text NOT NULL,
      host text NOT NULL,
      port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
      database_name text NOT NULL,
      username text NOT NULL,
      password text NOT NULL,
      drive_folder_id text,
      schedule_enabled boolean NOT NULL DEFAULT false,
      schedule_days text[] NOT NULL DEFAULT '{}',
      schedule_time time,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT valid_schedule CHECK (
        schedule_enabled = false
        OR (cardinality(schedule_days) > 0 AND schedule_time IS NOT NULL)
      )
    );

    ALTER TABLE backup_databases ADD COLUMN IF NOT EXISTS user_id uuid;
    ALTER TABLE backup_databases DROP CONSTRAINT IF EXISTS backup_databases_name_key;

    DO $$ BEGIN
      ALTER TABLE backup_databases
        ADD CONSTRAINT backup_databases_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS backup_databases_user_name_idx
      ON backup_databases (user_id, lower(name))
      WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS backup_databases_user_id_idx
      ON backup_databases (user_id);

    CREATE TABLE IF NOT EXISTS backup_history (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
      database_id uuid REFERENCES backup_databases(id) ON DELETE SET NULL,
      database_name text NOT NULL,
      trigger_type text NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
      status text NOT NULL CHECK (status IN ('running', 'success', 'error')),
      scheduled_for timestamptz,
      file_name text NOT NULL,
      drive_folder_id text NOT NULL,
      drive_file_id text,
      error_message text,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    );

    ALTER TABLE backup_history ADD COLUMN IF NOT EXISTS user_id uuid;
    DO $$ BEGIN
      ALTER TABLE backup_history
        ADD CONSTRAINT backup_history_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS backup_history_started_at_idx
      ON backup_history (started_at DESC);
    CREATE INDEX IF NOT EXISTS backup_history_database_id_idx
      ON backup_history (database_id);
    CREATE INDEX IF NOT EXISTS backup_history_user_started_at_idx
      ON backup_history (user_id, started_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS backup_history_scheduled_slot_idx
      ON backup_history (database_id, scheduled_for)
      WHERE trigger_type = 'scheduled' AND scheduled_for IS NOT NULL;

    CREATE TABLE IF NOT EXISTS user_google_drive (
      user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      refresh_token text NOT NULL,
      root_folder_id text NOT NULL,
      google_email text,
      connected_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
