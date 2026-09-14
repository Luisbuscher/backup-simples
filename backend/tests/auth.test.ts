import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { AppRepository } from "../src/repository.js";
import type { BackupService } from "../src/backup/service.js";
import type { DatabaseTarget, User } from "../src/types.js";
import { hashPassword } from "../src/security.js";

const USER_ID = "260d6131-eaa7-4702-a46b-66d65853012f";
const PASSWORD_HASH = await hashPassword("admin-secret");

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
    appBaseUrl: "http://localhost",
    google: { clientId: "client", clientSecret: "client-secret" },
    email: { deliveryMode: "log", apiKey: "", from: "Backup <backup@example.com>" },
    jwtSecret: "12345678901234567890123456789012",
    dataEncryptionKey: "abcdefghijklmnopqrstuvwxyz123456",
    jwtCookieSecure: false,
    timeZone: "America/Sao_Paulo",
    port: 3000,
  };
}

function user(): User {
  return {
    id: USER_ID,
    firstName: "Ana",
    lastName: "Silva",
    email: "ana@example.com",
    passwordHash: PASSWORD_HASH,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function testApp(overrides: Partial<AppRepository> = {}) {
  const repository = {
    healthCheck: vi.fn(async () => undefined),
    findUserByEmail: vi.fn(async (email: string) => email === user().email ? user() : null),
    listDatabases: vi.fn(async () => []),
    getGoogleDriveConnection: vi.fn(async () => null),
    ...overrides,
  } as unknown as AppRepository;
  const backupService = { isRunning: vi.fn(() => false) } as unknown as BackupService;
  return createApp({ config: config(), repository, backupService });
}

function target(): DatabaseTarget {
  return {
    id: "625c730e-bfee-4333-8c84-03c8faf5cf50",
    userId: USER_ID,
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

async function authenticatedAgent(app = testApp()) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({
    email: "ana@example.com",
    password: "admin-secret",
  });
  return agent;
}

describe("authentication", () => {
  it("protege as rotas da aplicação", async () => {
    const response = await request(testApp()).get("/api/databases");
    expect(response.status).toBe(401);
  });

  it("não autentica com senha incorreta", async () => {
    const response = await request(testApp())
      .post("/api/auth/login")
      .send({ email: "ana@example.com", password: "wrong" });
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("exige confirmação de e-mail", async () => {
    const pending = { ...user(), emailVerifiedAt: null };
    const response = await request(testApp({
      findUserByEmail: vi.fn(async () => pending),
    })).post("/api/auth/login").send({
      email: pending.email,
      password: "admin-secret",
    });
    expect(response.status).toBe(403);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("cria cookie HttpOnly e não retorna a senha", async () => {
    const response = await request(testApp())
      .post("/api/auth/login")
      .send({ email: "ana@example.com", password: "admin-secret" });
    const cookie = response.headers["set-cookie"]?.[0] ?? "";
    expect(response.status).toBe(200);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(JSON.stringify(response.body)).not.toContain("admin-secret");
  });

  it("filtra bancos pelo usuário e nunca devolve sua senha", async () => {
    const database = target();
    const listDatabases = vi.fn(async () => [database]);
    const app = testApp({ listDatabases });
    const agent = await authenticatedAgent(app);
    const response = await agent.get("/api/databases");

    expect(response.status).toBe(200);
    expect(listDatabases).toHaveBeenCalledWith(USER_ID);
    expect(response.body[0].hasPassword).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(database.password);
    expect(JSON.stringify(response.body)).not.toContain(database.userId);
  });

  it("lista 10 backups por padrão e aceita filtros de quantidade e banco", async () => {
    const listBackups = vi.fn(async () => []);
    const app = testApp({ listBackups });
    const agent = await authenticatedAgent(app);

    expect((await agent.get("/api/backups")).status).toBe(200);
    expect(listBackups).toHaveBeenLastCalledWith(USER_ID, 10, undefined);

    const databaseId = target().id;
    expect(
      (await agent.get(`/api/backups?limit=25&databaseId=${databaseId}`)).status,
    ).toBe(200);
    expect(listBackups).toHaveBeenLastCalledWith(USER_ID, 25, databaseId);
  });
});
