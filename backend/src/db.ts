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
    CREATE TABLE IF NOT EXISTS backup_databases (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE,
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
        OR (
          cardinality(schedule_days) > 0
          AND schedule_time IS NOT NULL
        )
      )
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id uuid PRIMARY KEY,
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

    CREATE INDEX IF NOT EXISTS backup_history_started_at_idx
      ON backup_history (started_at DESC);

    CREATE INDEX IF NOT EXISTS backup_history_database_id_idx
      ON backup_history (database_id);

    CREATE UNIQUE INDEX IF NOT EXISTS backup_history_scheduled_slot_idx
      ON backup_history (database_id, scheduled_for)
      WHERE trigger_type = 'scheduled' AND scheduled_for IS NOT NULL;
  `);
}

