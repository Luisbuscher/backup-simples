import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { AppRepository } from "../src/repository.js";
import type { BackupService } from "../src/backup/service.js";
import type { DatabaseTarget } from "../src/types.js";

function config(): AppConfig {
  return {
    appDb: {
      host: "db",
      port: 5432,
      database: "app",
      user: "app",
      password: "db-secret",
      ssl: false,
    },
    google: {
      clientId: "client",
      clientSecret: "client-secret",
      refreshToken: "refresh",
      rootFolderId: "root",
    },
    admin: { user: "admin", password: "admin-secret" },
    jwtSecret: "12345678901234567890123456789012",
    jwtCookieSecure: false,
    timeZone: "America/Sao_Paulo",
    port: 3000,
  };
}

function testApp() {
  const repository = {
    healthCheck: vi.fn(async () => undefined),
    listDatabases: vi.fn(async () => []),
  } as unknown as AppRepository;
  const backupService = {
    isRunning: vi.fn(() => false),
  } as unknown as BackupService;
  return createApp({ config: config(), repository, backupService });
}

function target(): DatabaseTarget {
  return {
    id: "625c730e-bfee-4333-8c84-03c8faf5cf50",
    name: "Produção",
    host: "db.example.com",
    port: 5432,
    databaseName: "app",
    username: "postgres",
    password: "database-secret",
    driveFolderId: null,
    schedule: { enabled: false, days: [], time: null },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("authentication", () => {
  it("protege as rotas da aplicação", async () => {
    const response = await request(testApp()).get("/api/databases");
    expect(response.status).toBe(401);
  });

  it("não autentica com senha incorreta", async () => {
    const response = await request(testApp())
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" });
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("cria cookie HttpOnly e não retorna a senha", async () => {
    const response = await request(testApp())
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin-secret" });
    const cookie = response.headers["set-cookie"]?.[0] ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(JSON.stringify(response.body)).not.toContain("admin-secret");
  });

  it("nunca devolve a senha do banco cadastrado", async () => {
    const database = target();
    const repository = {
      healthCheck: vi.fn(async () => undefined),
      listDatabases: vi.fn(async () => [database]),
    } as unknown as AppRepository;
    const backupService = {
      isRunning: vi.fn(() => false),
    } as unknown as BackupService;
    const app = createApp({
      config: config(),
      repository,
      backupService,
    });
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin-secret" });

    const response = await agent.get("/api/databases");

    expect(response.status).toBe(200);
    expect(response.body[0].hasPassword).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(database.password);
  });
});
