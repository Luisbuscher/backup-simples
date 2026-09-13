import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackupService,
  sanitizeError,
} from "../src/backup/service.js";
import type {
  BackupRepository,
  BackupRunCreate,
} from "../src/repository.js";
import type {
  BackupRun,
  BackupStatus,
  DatabaseTarget,
} from "../src/types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class FakeRepository implements BackupRepository {
  runs: BackupRun[] = [];

  constructor(private readonly target: DatabaseTarget) {}

  async getDatabase(id: string) {
    return id === this.target.id ? this.target : null;
  }

  async getGoogleDriveConnection(userId: string) {
    return userId === this.target.userId
      ? {
          userId,
          refreshToken: "refresh-token",
          rootFolderId: "root-folder",
          googleEmail: "user@example.com",
          connectedAt: new Date(),
          updatedAt: new Date(),
        }
      : null;
  }

  async createBackupRun(input: BackupRunCreate) {
    const run: BackupRun = {
      id: randomUUID(),
      userId: input.userId,
      databaseId: input.databaseId,
      databaseName: input.databaseName,
      trigger: input.trigger,
      status: "running",
      scheduledFor: input.scheduledFor,
      fileName: input.fileName,
      driveFolderId: input.driveFolderId,
      driveFileId: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    this.runs.push(run);
    return run;
  }

  async finishBackupRun(
    id: string,
    status: Exclude<BackupStatus, "running">,
    values: { driveFileId?: string; errorMessage?: string },
  ) {
    const run = this.runs.find((item) => item.id === id)!;
    run.status = status;
    run.driveFileId = values.driveFileId ?? null;
    run.errorMessage = values.errorMessage ?? null;
    run.finishedAt = new Date();
  }
}

function target(): DatabaseTarget {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    name: "Produção",
    host: "db.example.com",
    port: 5432,
    databaseName: "app",
    username: "postgres",
    password: "top-secret",
    driveFolderId: null,
    schedule: { enabled: false, days: [], time: null },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timeout");
}

describe("BackupService", () => {
  it("executa, envia, registra sucesso e limpa o temporário", async () => {
    const database = target();
    const repository = new FakeRepository(database);
    const root = await mkdtemp(join(tmpdir(), "backup-service-test-"));
    roots.push(root);
    const upload = vi.fn(async () => "drive-file-id");
    const service = new BackupService({
      repository,
      dumpRunner: async (_target, output) => writeFile(output, "dump"),
      driveUploaderFactory: () => upload,
      config: {
        timeZone: "America/Sao_Paulo",
      },
      tempRoot: root,
      logger: { error: vi.fn() },
    });

    const run = await service.start(database.id, database.userId, "manual");
    expect(run?.driveFolderId).toBe("root-folder");
    await waitUntil(
      () =>
        repository.runs[0].status !== "running" &&
        !service.isRunning(database.id),
    );

    expect(repository.runs[0].status).toBe("success");
    expect(repository.runs[0].driveFileId).toBe("drive-file-id");
    expect(upload).toHaveBeenCalledOnce();
    expect(await readdir(root)).toEqual([]);
  });

  it("prioriza a pasta específica configurada no banco", async () => {
    const database = target();
    database.driveFolderId = "custom-folder";
    const repository = new FakeRepository(database);
    const root = await mkdtemp(join(tmpdir(), "backup-service-test-"));
    roots.push(root);
    const upload = vi.fn(async () => "drive-file-id");
    const service = new BackupService({
      repository,
      dumpRunner: async (_target, output) => writeFile(output, "dump"),
      driveUploaderFactory: () => upload,
      config: { timeZone: "America/Sao_Paulo" },
      tempRoot: root,
      logger: { error: vi.fn() },
    });

    const run = await service.start(database.id, database.userId, "manual");
    expect(run?.driveFolderId).toBe("custom-folder");
    await waitUntil(() => repository.runs[0].status !== "running");
    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "custom-folder",
    );
  });

  it("registra erro sanitizado e também limpa o temporário", async () => {
    const database = target();
    const repository = new FakeRepository(database);
    const root = await mkdtemp(join(tmpdir(), "backup-service-test-"));
    roots.push(root);
    const service = new BackupService({
      repository,
      dumpRunner: async () => {
        throw new Error(`falha usando ${database.password}`);
      },
      driveUploaderFactory: () => vi.fn(),
      config: {
        timeZone: "America/Sao_Paulo",
      },
      tempRoot: root,
      logger: { error: vi.fn() },
    });

    await service.start(database.id, database.userId, "manual");
    await waitUntil(
      () =>
        repository.runs[0].status !== "running" &&
        !service.isRunning(database.id),
    );

    expect(repository.runs[0].status).toBe("error");
    expect(repository.runs[0].errorMessage).not.toContain(database.password);
    expect(await readdir(root)).toEqual([]);
  });

  it("não executa o dump quando a autorização do Drive está inválida", async () => {
    const database = target();
    const repository = new FakeRepository(database);
    const root = await mkdtemp(join(tmpdir(), "backup-service-test-"));
    roots.push(root);
    const dumpRunner = vi.fn();
    const driveUploader = vi.fn() as ReturnType<typeof vi.fn> & {
      verifyAccess: () => Promise<void>;
    };
    driveUploader.verifyAccess = vi.fn(async () => {
      throw new Error("autorização inválida");
    });
    const service = new BackupService({
      repository,
      dumpRunner,
      driveUploaderFactory: () => driveUploader,
      config: {
        timeZone: "America/Sao_Paulo",
      },
      tempRoot: root,
      logger: { error: vi.fn() },
    });

    await service.start(database.id, database.userId, "manual");
    await waitUntil(
      () =>
        repository.runs[0].status !== "running" &&
        !service.isRunning(database.id),
    );

    expect(driveUploader.verifyAccess).toHaveBeenCalledOnce();
    expect(dumpRunner).not.toHaveBeenCalled();
    expect(driveUploader).not.toHaveBeenCalled();
    expect(repository.runs[0].errorMessage).toBe("autorização inválida");
    expect(await readdir(root)).toEqual([]);
  });

  it("remove senhas de mensagens de erro", () => {
    expect(
      sanitizeError(
        new Error("postgresql://user:secret@db.example.com/app"),
        "secret",
      ),
    ).not.toContain("secret");
  });
});
