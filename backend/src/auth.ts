import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AppConfig } from "./config.js";

export const SESSION_COOKIE = "backup_session";

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function credentialsAreValid(
  username: string,
  password: string,
  config: AppConfig,
) {
  return (
    safeEqual(username, config.admin.user) &&
    safeEqual(password, config.admin.password)
  );
}

export function createSessionToken(config: AppConfig) {
  return jwt.sign({ role: "admin" }, config.jwtSecret, {
    subject: config.admin.user,
    issuer: "backup-simples",
    expiresIn: "8h",
  });
}

export function setSessionCookie(
  response: Response,
  token: string,
  config: AppConfig,
) {
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
      jwt.verify(token, config.jwtSecret, {
        issuer: "backup-simples",
        subject: config.admin.user,
      });
      next();
    } catch {
      clearSessionCookie(response, config);
      response.status(401).json({ error: "Sessão inválida ou expirada" });
    }
  };
}

