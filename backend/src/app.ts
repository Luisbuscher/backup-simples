import type { NextFunction, Request, Response } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ZodError, z } from "zod";
import type { AppConfig } from "./config.js";
import {
  authenticatedUser,
  clearSessionCookie,
  createGoogleOAuthState,
  createSessionToken,
  readGoogleOAuthState,
  requireAuth,
  setSessionCookie,
} from "./auth.js";
import {
  confirmationSchema,
  createDatabaseSchema,
  loginSchema,
  registrationSchema,
  updateDatabaseSchema,
  uuidSchema,
} from "./validation.js";
import {
  AppRepository,
  RepositoryConflictError,
  toPublicBackup,
  toPublicDatabase,
} from "./repository.js";
import {
  BackupAlreadyRunningError,
  BackupService,
  DatabaseNotFoundError,
} from "./backup/service.js";
import {
  createGoogleAuthorizationUrl,
  exchangeGoogleAuthorization,
  GoogleDriveNotConnectedError,
  revokeGoogleAuthorization,
} from "./backup/googleDrive.js";
import { createEmailSender, type EmailSender } from "./email.js";
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./security.js";

interface AppDependencies {
  config: AppConfig;
  repository: AppRepository;
  backupService: BackupService;
  emailSender?: EmailSender;
}

export function createApp({
  config,
  repository,
  backupService,
  emailSender = createEmailSender(config),
}: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());

  app.get("/api/health", async (_request, response) => {
    try {
      await repository.healthCheck();
      response.json({ status: "ok" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  });

  app.post("/api/auth/register", async (request, response) => {
    const input = registrationSchema.parse(request.body);
    const token = createOpaqueToken();
    const user = await repository.createUser({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      confirmationTokenHash: hashToken(token),
      confirmationExpiresAt: confirmationExpiry(),
    });
    let delivered = true;
    try {
      await emailSender.sendConfirmation(
        user.email,
        user.firstName,
        confirmationUrl(config, token),
      );
    } catch (error) {
      delivered = false;
      console.error(
        "Não foi possível enviar o e-mail de confirmação:",
        error instanceof Error ? error.message : "erro desconhecido",
      );
    }
    response.status(201).json({
      message: delivered
        ? "Conta criada. Verifique seu e-mail para liberar o acesso."
        : "Conta criada, mas o e-mail não pôde ser enviado. Tente reenviar pela tela de login.",
    });
  });

  app.post("/api/auth/resend-confirmation", async (request, response) => {
    const email = z.string().trim().toLowerCase().email().max(255).parse(request.body?.email);
    const token = createOpaqueToken();
    const user = await repository.refreshConfirmation(
      email,
      hashToken(token),
      confirmationExpiry(),
    );
    if (user) {
      await emailSender.sendConfirmation(
        user.email,
        user.firstName,
        confirmationUrl(config, token),
      );
    }
    response.json({
      message: "Se a conta estiver pendente, um novo e-mail será enviado.",
    });
  });

  app.get("/api/auth/confirm", async (request, response) => {
    const { token } = confirmationSchema.parse(request.query);
    const user = await repository.confirmUser(hashToken(token));
    response.redirect(
      303,
      `${config.appBaseUrl}/?email-confirmed=${user ? "1" : "error"}`,
    );
  });

  app.post("/api/auth/confirm", async (request, response) => {
    const { token } = confirmationSchema.parse(request.body);
    const user = await repository.confirmUser(hashToken(token));
    if (!user) {
      response.status(400).json({ error: "Link inválido ou expirado" });
      return;
    }
    response.json({ message: "E-mail confirmado. Você já pode entrar." });
  });

  app.post("/api/auth/login", async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = await repository.findUserByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      response.status(401).json({ error: "E-mail ou senha inválidos" });
      return;
    }
    if (!user.emailVerifiedAt) {
      response.status(403).json({ error: "Confirme seu e-mail antes de entrar" });
      return;
    }
    const sessionUser = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    };
    setSessionCookie(response, createSessionToken(sessionUser, config), config);
    response.json({ user: sessionUser });
  });

  app.post("/api/auth/logout", (_request, response) => {
    clearSessionCookie(response, config);
    response.status(204).end();
  });

  // O callback valida o state assinado; ele não depende do cookie SameSite após
  // o redirecionamento externo do Google.
  app.get("/api/google/callback", async (request, response) => {
    try {
      const code = z.string().min(1).parse(request.query.code);
      const state = z.string().min(1).parse(request.query.state);
      const userId = readGoogleOAuthState(state, config);
      const authorization = await exchangeGoogleAuthorization(config, code);
      await repository.saveGoogleDriveConnection(
        userId,
        authorization.refreshToken,
        authorization.rootFolderId,
        authorization.googleEmail,
      );
      response.redirect(303, `${config.appBaseUrl}/?google=connected`);
    } catch {
      response.redirect(303, `${config.appBaseUrl}/?google=error`);
    }
  });

  app.use("/api", requireAuth(config));

  app.get("/api/auth/me", (_request, response) => {
    response.json({ user: authenticatedUser(response) });
  });

  app.get("/api/google/status", async (_request, response) => {
    const user = authenticatedUser(response);
    const connection = await repository.getGoogleDriveConnection(user.id);
    response.json({
      connected: Boolean(connection),
      email: connection?.googleEmail ?? null,
      connectedAt: connection?.connectedAt ?? null,
    });
  });

  app.post("/api/google/connect", (_request, response) => {
    const user = authenticatedUser(response);
    const state = createGoogleOAuthState(user.id, config);
    response.json({ url: createGoogleAuthorizationUrl(config, state) });
  });

  app.delete("/api/google/connection", async (_request, response) => {
    const user = authenticatedUser(response);
    const connection = await repository.getGoogleDriveConnection(user.id);
    if (connection) {
      await revokeGoogleAuthorization(config, connection.refreshToken).catch(() => undefined);
    }
    await repository.deleteGoogleDriveConnection(user.id);
    response.status(204).end();
  });

  app.get("/api/databases", async (_request, response) => {
    const user = authenticatedUser(response);
    const databases = await repository.listDatabases(user.id);
    response.json(databases.map(toPublicDatabase));
  });

  app.post("/api/databases", async (request, response) => {
    const user = authenticatedUser(response);
    const input = createDatabaseSchema.parse(request.body);
    const database = await repository.createDatabase(user.id, input);
    response.status(201).json(toPublicDatabase(database));
  });

  app.put("/api/databases/:id", async (request, response) => {
    const user = authenticatedUser(response);
    const id = uuidSchema.parse(request.params.id);
    const input = updateDatabaseSchema.parse(request.body);
    const database = await repository.updateDatabase(user.id, id, input);
    if (!database) {
      response.status(404).json({ error: "Banco não encontrado" });
      return;
    }
    response.json(toPublicDatabase(database));
  });

  app.delete("/api/databases/:id", async (request, response) => {
    const user = authenticatedUser(response);
    const id = uuidSchema.parse(request.params.id);
    const database = await repository.getDatabase(id, user.id);
    if (!database) {
      response.status(404).json({ error: "Banco não encontrado" });
      return;
    }
    if (backupService.isRunning(id)) {
      response.status(409).json({ error: "Aguarde o backup em andamento terminar" });
      return;
    }
    const deleted = await repository.deleteDatabase(user.id, id);
    if (!deleted) {
      response.status(404).json({ error: "Banco não encontrado" });
      return;
    }
    response.status(204).end();
  });

  app.post("/api/databases/:id/backups", async (request, response) => {
    const user = authenticatedUser(response);
    const id = uuidSchema.parse(request.params.id);
    const run = await backupService.start(id, user.id, "manual");
    response.status(202).json(run ? toPublicBackup(run) : null);
  });

  app.get("/api/backups", async (request, response) => {
    const user = authenticatedUser(response);
    const limit = z.coerce.number().int().min(1).max(100).default(10).parse(request.query.limit);
    const databaseId = uuidSchema.optional().parse(request.query.databaseId);
    const backups = await repository.listBackups(user.id, limit, databaseId);
    response.json(backups.map(toPublicBackup));
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Rota não encontrada" });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        error: "Dados inválidos",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    if (error instanceof RepositoryConflictError) {
      response.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof BackupAlreadyRunningError) {
      response.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof GoogleDriveNotConnectedError) {
      response.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof DatabaseNotFoundError) {
      response.status(404).json({ error: error.message });
      return;
    }

    console.error("Erro interno não tratado", error instanceof Error ? error.message : "");
    response.status(500).json({ error: "Erro interno do servidor" });
  });

  return app;
}

function confirmationExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function confirmationUrl(config: AppConfig, token: string) {
  return `${config.appBaseUrl}/api/auth/confirm?token=${encodeURIComponent(token)}`;
}
