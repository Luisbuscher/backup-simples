import { randomUUID } from "node:crypto";
import type pg from "pg";
import type {
  BackupRun,
  BackupStatus,
  DatabaseInput,
  DatabaseTarget,
  DatabaseTargetPublic,
  BackupTrigger,
} from "./types.js";

type DatabaseRow = {
  id: string;
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

export class RepositoryConflictError extends Error {}

function mapDatabase(row: DatabaseRow): DatabaseTarget {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    databaseName: row.database_name,
    username: row.username,
    password: row.password,
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

export function toPublicDatabase(
  database: DatabaseTarget,
): DatabaseTargetPublic {
  const { password: _password, ...safe } = database;
  return { ...safe, hasPassword: true };
}

function mapBackup(row: BackupRow): BackupRun {
  return {
    id: row.id,
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

export interface BackupRunCreate {
  databaseId: string;
  databaseName: string;
  trigger: BackupTrigger;
  scheduledFor: Date | null;
  fileName: string;
  driveFolderId: string;
}

export interface BackupRepository {
  getDatabase(id: string): Promise<DatabaseTarget | null>;
  createBackupRun(input: BackupRunCreate): Promise<BackupRun | null>;
  finishBackupRun(
    id: string,
    status: Exclude<BackupStatus, "running">,
    values: { driveFileId?: string; errorMessage?: string },
  ): Promise<void>;
}

export class AppRepository implements BackupRepository {
  constructor(private readonly pool: pg.Pool) {}

  async healthCheck() {
    await this.pool.query("SELECT 1");
  }

  async listDatabases() {
    const result = await this.pool.query<DatabaseRow>(
      "SELECT * FROM backup_databases ORDER BY name",
    );
    return result.rows.map(mapDatabase);
  }

  async listScheduledDatabases() {
    const result = await this.pool.query<DatabaseRow>(
      "SELECT * FROM backup_databases WHERE schedule_enabled = true ORDER BY name",
    );
    return result.rows.map(mapDatabase);
  }

  async getDatabase(id: string) {
    const result = await this.pool.query<DatabaseRow>(
      "SELECT * FROM backup_databases WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapDatabase(result.rows[0]) : null;
  }

  async createDatabase(input: DatabaseInput & { password: string }) {
    try {
      const result = await this.pool.query<DatabaseRow>(
        `INSERT INTO backup_databases (
          id, name, host, port, database_name, username, password,
          drive_folder_id, schedule_enabled, schedule_days, schedule_time
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [
          randomUUID(),
          input.name,
          input.host,
          input.port,
          input.database,
          input.username,
          input.password,
          input.driveFolderId,
          input.schedule.enabled,
          input.schedule.days,
          input.schedule.time,
        ],
      );
      return mapDatabase(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryConflictError("Já existe um banco com esse nome");
      }
      throw error;
    }
  }

  async updateDatabase(id: string, input: DatabaseInput) {
    try {
      const result = await this.pool.query<DatabaseRow>(
        `UPDATE backup_databases SET
          name = $2,
          host = $3,
          port = $4,
          database_name = $5,
          username = $6,
          password = CASE WHEN $7::text IS NULL OR $7 = '' THEN password ELSE $7 END,
          drive_folder_id = $8,
          schedule_enabled = $9,
          schedule_days = $10,
          schedule_time = $11,
          updated_at = now()
        WHERE id = $1
        RETURNING *`,
        [
          id,
          input.name,
          input.host,
          input.port,
          input.database,
          input.username,
          input.password ?? null,
          input.driveFolderId,
          input.schedule.enabled,
          input.schedule.days,
          input.schedule.time,
        ],
      );
      return result.rows[0] ? mapDatabase(result.rows[0]) : null;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryConflictError("Já existe um banco com esse nome");
      }
      throw error;
    }
  }

  async deleteDatabase(id: string) {
    const result = await this.pool.query(
      "DELETE FROM backup_databases WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listBackups(limit: number) {
    const result = await this.pool.query<BackupRow>(
      "SELECT * FROM backup_history ORDER BY started_at DESC LIMIT $1",
      [limit],
    );
    return result.rows.map(mapBackup);
  }

  async createBackupRun(input: BackupRunCreate) {
    const result = await this.pool.query<BackupRow>(
      `INSERT INTO backup_history (
        id, database_id, database_name, trigger_type, status,
        scheduled_for, file_name, drive_folder_id
      ) VALUES ($1,$2,$3,$4,'running',$5,$6,$7)
      ON CONFLICT DO NOTHING
      RETURNING *`,
      [
        randomUUID(),
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
      `UPDATE backup_history SET
        status = $2,
        drive_file_id = $3,
        error_message = $4,
        finished_at = now()
      WHERE id = $1`,
      [
        id,
        status,
        values.driveFileId ?? null,
        values.errorMessage ?? null,
      ],
    );
  }

  async markInterruptedBackups() {
    await this.pool.query(
      `UPDATE backup_history SET
        status = 'error',
        error_message = 'Execução interrompida pelo reinício do serviço.',
        finished_at = now()
      WHERE status = 'running'`,
    );
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

