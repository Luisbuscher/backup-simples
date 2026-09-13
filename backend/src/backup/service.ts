import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AppConfig } from "../config.js";
import type {
  BackupRepository,
  BackupRunCreate,
} from "../repository.js";
import type { BackupRun, BackupTrigger, DatabaseTarget } from "../types.js";
import { createBackupFileName } from "./filename.js";
import {
  GoogleDriveNotConnectedError,
  type DriveUploader,
} from "./googleDrive.js";
import type { DumpRunner } from "./pgDump.js";

export class BackupAlreadyRunningError extends Error {}
export class DatabaseNotFoundError extends Error {}

interface BackupServiceOptions {
  repository: BackupRepository;
  dumpRunner: DumpRunner;
  driveUploaderFactory: (refreshToken: string) => DriveUploader;
  config: Pick<AppConfig, "timeZone">;
  tempRoot?: string;
  logger?: Pick<Console, "error">;
}

export class BackupService {
  private readonly runningTargets = new Set<string>();
  private readonly tempRoot: string;
  private readonly logger: Pick<Console, "error">;

  constructor(private readonly options: BackupServiceOptions) {
    this.tempRoot = options.tempRoot ?? join(tmpdir(), "backup-simples");
    this.logger = options.logger ?? console;
  }

  isRunning(databaseId: string) {
    return this.runningTargets.has(databaseId);
  }

  async start(
    databaseId: string,
    userId: string,
    trigger: BackupTrigger,
    scheduledFor: Date | null = null,
  ): Promise<BackupRun | null> {
    if (this.runningTargets.has(databaseId)) {
      if (trigger === "scheduled") return null;
      throw new BackupAlreadyRunningError(
        "Já existe um backup em andamento para este banco",
      );
    }

    this.runningTargets.add(databaseId);
    try {
      const target = await this.options.repository.getDatabase(databaseId, userId);
      if (!target) throw new DatabaseNotFoundError("Banco não encontrado");
      const driveConnection =
        await this.options.repository.getGoogleDriveConnection(userId);
      if (!driveConnection) throw new GoogleDriveNotConnectedError();

      const startedAt = new Date();
      const fileName = createBackupFileName(
        target.name,
        startedAt,
        this.options.config.timeZone,
      );
      const driveFolderId = driveConnection.rootFolderId;
      const runInput: BackupRunCreate = {
        userId,
        databaseId: target.id,
        databaseName: target.name,
        trigger,
        scheduledFor,
        fileName,
        driveFolderId,
      };

      const run = await this.options.repository.createBackupRun(runInput);
      if (!run) {
        this.runningTargets.delete(databaseId);
        return null;
      }

      const driveUploader = this.options.driveUploaderFactory(
        driveConnection.refreshToken,
      );
      void this.execute(run, target, driveUploader).catch((error) => {
        this.logger.error(
          `Falha inesperada ao finalizar o backup ${run.id}:`,
          sanitizeError(error, target.password),
        );
      });
      return run;
    } catch (error) {
      this.runningTargets.delete(databaseId);
      throw error;
    }
  }

  private async execute(
    run: BackupRun,
    target: DatabaseTarget,
    driveUploader: DriveUploader,
  ) {
    let runDirectory: string | null = null;

    try {
      await driveUploader.verifyAccess?.();
      await mkdir(this.tempRoot, { recursive: true });
      runDirectory = await mkdtemp(join(this.tempRoot, `${run.id}-`));
      const outputPath = join(runDirectory, run.fileName);
      await this.options.dumpRunner(target, outputPath);
      const driveFileId = await driveUploader(
        outputPath,
        run.fileName,
        run.driveFolderId,
      );
      await this.options.repository.finishBackupRun(run.id, "success", {
        driveFileId,
      });
    } catch (error) {
      const message = sanitizeError(error, target.password);
      await this.options.repository.finishBackupRun(run.id, "error", {
        errorMessage: message,
      });
      this.logger.error(`Backup ${run.id} falhou: ${message}`);
    } finally {
      if (runDirectory) {
        await rm(runDirectory, { recursive: true, force: true }).catch((error) => {
          this.logger.error(
            `Não foi possível remover o temporário do backup ${run.id}:`,
            sanitizeError(error),
          );
        });
      }
      this.runningTargets.delete(target.id);
    }
  }
}

export function sanitizeError(error: unknown, secret?: string) {
  let message = error instanceof Error ? error.message : String(error);
  if (secret) message = message.split(secret).join("[REDACTED]");
  message = message.replace(
    /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi,
    "$1[REDACTED]@",
  );
  return message.replace(/\s+/g, " ").trim().slice(0, 2_000);
}

export async function cleanTemporaryFiles(
  tempRoot = join(tmpdir(), "backup-simples"),
) {
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
}
