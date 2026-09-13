import { randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  BackupRun,
  BackupStatus,
  BackupTrigger,
  DatabaseInput,
  DatabaseTarget,
  DatabaseTargetPublic,
  GoogleDriveConnection,
  User,
} from "./types.js";
import { SecretCipher } from "./security.js";

type DatabaseRow = {
  id: string;
  user_id: string;
  name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  drive_folder_id: string | null;
  schedule_enabled: boolean;
  schedule_days: DatabaseTarget["schedule"]["days"];
  schedule_time: string | null;
  created_at: Date;
  updated_at: Date;
};

type BackupRow = {
  id: string;
  user_id: string;
  database_id: string | null;
  database_name: string;
  trigger_type: BackupTrigger;
  status: BackupStatus;
  scheduled_for: Date | null;
  file_name: string;
  drive_folder_id: string;
  drive_file_id: string | null;
  error_message: string | null;
  started_at: Date;
  finished_at: Date | null;
};

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type DriveRow = {
  user_id: string;
  refresh_token: string;
  root_folder_id: string;
  google_email: string | null;
  connected_at: Date;
  updated_at: Date;
};

export class RepositoryConflictError extends Error {}

export interface UserCreate {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  confirmationTokenHash: string;
  confirmationExpiresAt: Date;
}

export interface BackupRunCreate {
  userId: string;
  databaseId: string;
  databaseName: string;
  trigger: BackupTrigger;
  scheduledFor: Date | null;
  fileName: string;
  driveFolderId: string;
}

export interface BackupRepository {
  getDatabase(id: string, userId: string): Promise<DatabaseTarget | null>;
  getGoogleDriveConnection(userId: string): Promise<GoogleDriveConnection | null>;
  createBackupRun(input: BackupRunCreate): Promise<BackupRun | null>;
  finishBackupRun(
    id: string,
    status: Exclude<BackupStatus, "running">,
    values: { driveFileId?: string; errorMessage?: string },
  ): Promise<void>;
}

export class AppRepository implements BackupRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly cipher: SecretCipher,
  ) {}

  async healthCheck() {
    await this.pool.query("SELECT 1");
  }

  async createUser(input: UserCreate) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('backup-simples-first-user'))");
      const count = await client.query<{ count: string }>("SELECT count(*) FROM app_users");
      const userId = randomUUID();
      const result = await client.query<UserRow>(
        `INSERT INTO app_users (
          id, first_name, last_name, email, password_hash,
          confirmation_token_hash, confirmation_expires_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          userId,
          input.firstName,
          input.lastName,
          input.email,
          input.passwordHash,
          input.confirmationTokenHash,
          input.confirmationExpiresAt,
        ],
      );

      if (count.rows[0]?.count === "0") {
        const legacy = await client.query<{ id: string; password: string }>(
          "SELECT id, password FROM backup_databases WHERE user_id IS NULL FOR UPDATE",
        );
        for (const database of legacy.rows) {
          const encrypted = this.cipher.isEncrypted(database.password)
            ? database.password
            : this.cipher.encrypt(database.password);
          await client.query(
            "UPDATE backup_databases SET user_id = $1, password = $2 WHERE id = $3",
            [userId, encrypted, database.id],
          );
        }
        await client.query(
          `UPDATE backup_history history SET user_id = $1
           WHERE history.user_id IS NULL`,
          [userId],
        );
      }

      await client.query("COMMIT");
      return mapUser(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        throw new RepositoryConflictError("Já existe uma conta com este e-mail");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email: string) {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM app_users WHERE lower(email) = lower($1)",
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async refreshConfirmation(email: string, tokenHash: string, expiresAt: Date) {
    const result = await this.pool.query<UserRow>(
      `UPDATE app_users SET confirmation_token_hash = $2,
        confirmation_expires_at = $3, updated_at = now()
       WHERE lower(email) = lower($1) AND email_verified_at IS NULL
       RETURNING *`,
      [email, tokenHash, expiresAt],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async confirmUser(tokenHash: string) {
    const result = await this.pool.query<UserRow>(
      `UPDATE app_users SET email_verified_at = now(),
        confirmation_token_hash = NULL, confirmation_expires_at = NULL,
        updated_at = now()
       WHERE confirmation_token_hash = $1
         AND confirmation_expires_at > now()
         AND email_verified_at IS NULL
       RETURNING *`,
      [tokenHash],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async listDatabases(userId: string) {
    const result = await this.pool.query<DatabaseRow>(
      "SELECT * FROM backup_databases WHERE user_id = $1 ORDER BY lower(name)",
      [userId],
    );
    return result.rows.map((row) => mapDatabase(row, this.cipher));
  }

  async listScheduledDatabases() {
    const result = await this.pool.query<DatabaseRow>(
      `SELECT * FROM backup_databases
       WHERE user_id IS NOT NULL AND schedule_enabled = true
       ORDER BY lower(name)`,
    );
    return result.rows.map((row) => mapDatabase(row, this.cipher));
  }

  async getDatabase(id: string, userId: string) {
    const result = await this.pool.query<DatabaseRow>(
      "SELECT * FROM backup_databases WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return result.rows[0] ? mapDatabase(result.rows[0], this.cipher) : null;
  }

  async createDatabase(userId: string, input: DatabaseInput & { password: string }) {
    try {
      const result = await this.pool.query<DatabaseRow>(
        `INSERT INTO backup_databases (
          id, user_id, name, host, port, database_name, username, password,
          drive_folder_id, schedule_enabled, schedule_days, schedule_time
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11)
        RETURNING *`,
        [
          randomUUID(),
          userId,
          input.name,
          input.host,
          input.port,
          input.database,
          input.username,
          this.cipher.encrypt(input.password),
          input.schedule.enabled,
          input.schedule.days,
          input.schedule.time,
        ],
      );
      return mapDatabase(result.rows[0], this.cipher);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryConflictError("Já existe um banco com esse nome");
      }
      throw error;
    }
  }

  async updateDatabase(userId: string, id: string, input: DatabaseInput) {
    try {
      const password = input.password ? this.cipher.encrypt(input.password) : null;
      const result = await this.pool.query<DatabaseRow>(
        `UPDATE backup_databases SET
          name = $3, host = $4, port = $5, database_name = $6,
          username = $7,
          password = COALESCE($8::text, password),
          schedule_enabled = $9, schedule_days = $10, schedule_time = $11,
          updated_at = now()
        WHERE id = $2 AND user_id = $1
        RETURNING *`,
        [
          userId,
          id,
          input.name,
          input.host,
          input.port,
          input.database,
          input.username,
          password,
          input.schedule.enabled,
          input.schedule.days,
          input.schedule.time,
        ],
      );
      return result.rows[0] ? mapDatabase(result.rows[0], this.cipher) : null;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryConflictError("Já existe um banco com esse nome");
      }
      throw error;
    }
  }

  async deleteDatabase(userId: string, id: string) {
    const result = await this.pool.query(
      "DELETE FROM backup_databases WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listBackups(userId: string, limit: number) {
    const result = await this.pool.query<BackupRow>(
      `SELECT * FROM backup_history
       WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(mapBackup);
  }

  async createBackupRun(input: BackupRunCreate) {
    const result = await this.pool.query<BackupRow>(
      `INSERT INTO backup_history (
        id, user_id, database_id, database_name, trigger_type, status,
        scheduled_for, file_name, drive_folder_id
      ) VALUES ($1,$2,$3,$4,$5,'running',$6,$7,$8)
      ON CONFLICT DO NOTHING RETURNING *`,
      [
        randomUUID(),
        input.userId,
        input.databaseId,
        input.databaseName,
        input.trigger,
        input.scheduledFor,
        input.fileName,
        input.driveFolderId,
      ],
    );
    return result.rows[0] ? mapBackup(result.rows[0]) : null;
  }

  async finishBackupRun(
    id: string,
    status: Exclude<BackupStatus, "running">,
    values: { driveFileId?: string; errorMessage?: string },
  ) {
    await this.pool.query(
      `UPDATE backup_history SET status = $2, drive_file_id = $3,
        error_message = $4, finished_at = now() WHERE id = $1`,
      [id, status, values.driveFileId ?? null, values.errorMessage ?? null],
    );
  }

  async saveGoogleDriveConnection(
    userId: string,
    refreshToken: string,
    rootFolderId: string,
    googleEmail: string | null,
  ) {
    await this.pool.query(
      `INSERT INTO user_google_drive (
        user_id, refresh_token, root_folder_id, google_email
      ) VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id) DO UPDATE SET
        refresh_token = EXCLUDED.refresh_token,
        root_folder_id = EXCLUDED.root_folder_id,
        google_email = EXCLUDED.google_email,
        connected_at = now(), updated_at = now()`,
      [userId, this.cipher.encrypt(refreshToken), rootFolderId, googleEmail],
    );
  }

  async getGoogleDriveConnection(userId: string) {
    const result = await this.pool.query<DriveRow>(
      "SELECT * FROM user_google_drive WHERE user_id = $1",
      [userId],
    );
    return result.rows[0] ? mapDrive(result.rows[0], this.cipher) : null;
  }

  async deleteGoogleDriveConnection(userId: string) {
    const result = await this.pool.query(
      "DELETE FROM user_google_drive WHERE user_id = $1",
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markInterruptedBackups() {
    await this.pool.query(
      `UPDATE backup_history SET status = 'error',
        error_message = 'Execução interrompida pelo reinício do serviço.',
        finished_at = now() WHERE status = 'running'`,
    );
  }
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDatabase(row: DatabaseRow, cipher: SecretCipher): DatabaseTarget {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    host: row.host,
    port: row.port,
    databaseName: row.database_name,
    username: row.username,
    password: cipher.decrypt(row.password),
    driveFolderId: row.drive_folder_id,
    schedule: {
      enabled: row.schedule_enabled,
      days: row.schedule_days,
      time: row.schedule_time?.slice(0, 5) ?? null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicDatabase(database: DatabaseTarget): DatabaseTargetPublic {
  const { password: _password, userId: _userId, ...safe } = database;
  return { ...safe, hasPassword: true };
}

export function toPublicBackup(backup: BackupRun) {
  const { userId: _userId, ...safe } = backup;
  return safe;
}

function mapBackup(row: BackupRow): BackupRun {
  return {
    id: row.id,
    userId: row.user_id,
    databaseId: row.database_id,
    databaseName: row.database_name,
    trigger: row.trigger_type,
    status: row.status,
    scheduledFor: row.scheduled_for,
    fileName: row.file_name,
    driveFolderId: row.drive_folder_id,
    driveFileId: row.drive_file_id,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapDrive(row: DriveRow, cipher: SecretCipher): GoogleDriveConnection {
  return {
    userId: row.user_id,
    refreshToken: cipher.decrypt(row.refresh_token),
    rootFolderId: row.root_folder_id,
    googleEmail: row.google_email,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
