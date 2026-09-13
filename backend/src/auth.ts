import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AppConfig } from "./config.js";

export const SESSION_COOKIE = "backup_session";
const ISSUER = "backup-simples";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function createSessionToken(user: SessionUser, config: AppConfig) {
  return jwt.sign(
    {
      type: "session",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    config.jwtSecret,
    { subject: user.id, issuer: ISSUER, expiresIn: "8h" },
  );
}

export function createGoogleOAuthState(userId: string, config: AppConfig) {
  return jwt.sign({ type: "google_oauth" }, config.jwtSecret, {
    subject: userId,
    issuer: ISSUER,
    expiresIn: "10m",
  });
}

export function readGoogleOAuthState(state: string, config: AppConfig) {
  const payload = jwt.verify(state, config.jwtSecret, { issuer: ISSUER });
  if (typeof payload === "string" || payload.type !== "google_oauth" || !payload.sub) {
    throw new Error("Estado OAuth inválido");
  }
  return payload.sub;
}

export function setSessionCookie(response: Response, token: string, config: AppConfig) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.jwtCookieSecure,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(response: Response, config: AppConfig) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.jwtCookieSecure,
    path: "/",
  });
}

export function requireAuth(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) {
      response.status(401).json({ error: "Não autenticado" });
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret, { issuer: ISSUER });
      if (
        typeof payload === "string" ||
        payload.type !== "session" ||
        !payload.sub ||
        typeof payload.email !== "string" ||
        typeof payload.firstName !== "string" ||
        typeof payload.lastName !== "string"
      ) {
        throw new Error("Sessão inválida");
      }
      response.locals.user = {
        id: payload.sub,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
      } satisfies SessionUser;
      next();
    } catch {
      clearSessionCookie(response, config);
      response.status(401).json({ error: "Sessão inválida ou expirada" });
    }
  };
}

export function authenticatedUser(response: Response): SessionUser {
  return response.locals.user as SessionUser;
}
