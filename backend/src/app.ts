import type { NextFunction, Request, Response } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ZodError, z } from "zod";
import type { AppConfig } from "./config.js";
import {
  clearSessionCookie,
  createSessionToken,
  credentialsAreValid,
  requireAuth,
  setSessionCookie,
} from "./auth.js";
import {
  createDatabaseSchema,
  loginSchema,
  updateDatabaseSchema,
  uuidSchema,
} from "./validation.js";
import {
  AppRepository,
  RepositoryConflictError,
  toPublicDatabase,
} from "./repository.js";
import {
  BackupAlreadyRunningError,
  BackupService,
  DatabaseNotFoundError,
} from "./backup/service.js";

interface AppDependencies {
  config: AppConfig;
  repository: AppRepository;
  backupService: BackupService;
}

export function createApp({
  config,
  repository,
  backupService,
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

  app.post("/api/auth/login", (request, response) => {
    const input = loginSchema.parse(request.body);
    if (!credentialsAreValid(input.username, input.password, config)) {
      response.status(401).json({ error: "Usuário ou senha inválidos" });
      return;
    }
    setSessionCookie(response, createSessionToken(config), config);
    response.json({ user: config.admin.user });
  });

  app.post("/api/auth/logout", (_request, response) => {
    clearSessionCookie(response, config);
    response.status(204).end();
  });

  app.use("/api", requireAuth(config));

  app.get("/api/auth/me", (_request, response) => {
    response.json({ user: config.admin.user });
  });

  app.get("/api/databases", async (_request, response) => {
    const databases = await repository.listDatabases();
    response.json(databases.map(toPublicDatabase));
  });

  app.post("/api/databases", async (request, response) => {
    const input = createDatabaseSchema.parse(request.body);
    const database = await repository.createDatabase(input);
    response.status(201).json(toPublicDatabase(database));
  });

  app.put("/api/databases/:id", async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const input = updateDatabaseSchema.parse(request.body);
    const database = await repository.updateDatabase(id, input);
    if (!database) {
      response.status(404).json({ error: "Banco não encontrado" });
      return;
    }
    response.json(toPublicDatabase(database));
  });

  app.delete("/api/databases/:id", async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    if (backupService.isRunning(id)) {
      response
        .status(409)
        .json({ error: "Aguarde o backup em andamento terminar" });
      return;
    }
    const deleted = await repository.deleteDatabase(id);
    if (!deleted) {
      response.status(404).json({ error: "Banco não encontrado" });
      return;
    }
    response.status(204).end();
  });

  app.post("/api/databases/:id/backups", async (request, response) => {
    const id = uuidSchema.parse(request.params.id);
    const run = await backupService.start(id, "manual");
    response.status(202).json(run);
  });

  app.get("/api/backups", async (request, response) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .parse(request.query.limit);
    response.json(await repository.listBackups(limit));
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Rota não encontrada" });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
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
      if (error instanceof DatabaseNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }

      console.error("Erro interno não tratado");
      response.status(500).json({ error: "Erro interno do servidor" });
    },
  );

  return app;
}

