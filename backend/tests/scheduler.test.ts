import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BackupScheduler } from "../src/scheduler.js";
import type { AppRepository } from "../src/repository.js";
import type { BackupService } from "../src/backup/service.js";
import type { DatabaseTarget } from "../src/types.js";

function scheduledTarget(): DatabaseTarget {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    name: "Produção",
    host: "db.example.com",
    port: 5432,
    databaseName: "app",
    username: "postgres",
    password: "secret",
    driveFolderId: null,
    schedule: { enabled: true, days: ["mon"], time: "02:00" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("BackupScheduler", () => {
  it("executa somente o banco devido no minuto atual", async () => {
    const target = scheduledTarget();
    const repository = {
      listScheduledDatabases: vi.fn(async () => [target]),
    } as unknown as AppRepository;
    const start = vi.fn(async () => null);
    const service = { start } as unknown as BackupService;
    const scheduler = new BackupScheduler(
      repository,
      service,
      "America/Sao_Paulo",
    );

    await scheduler.runDueBackups(new Date("2026-07-27T05:00:30.000Z"));

    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(
      target.id,
      target.userId,
      "scheduled",
      new Date("2026-07-27T05:00:00.000Z"),
    );
  });

  it("não compensa um horário que já passou", async () => {
    const target = scheduledTarget();
    const repository = {
      listScheduledDatabases: vi.fn(async () => [target]),
    } as unknown as AppRepository;
    const start = vi.fn(async () => null);
    const service = { start } as unknown as BackupService;
    const scheduler = new BackupScheduler(
      repository,
      service,
      "America/Sao_Paulo",
    );

    await scheduler.runDueBackups(new Date("2026-07-27T05:01:00.000Z"));

    expect(start).not.toHaveBeenCalled();
  });
});
