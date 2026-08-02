import { spawn } from "node:child_process";
import type { DatabaseTarget } from "../types.js";

export type DumpRunner = (
  target: DatabaseTarget,
  outputPath: string,
) => Promise<void>;

export const runPgDump: DumpRunner = (target, outputPath) =>
  new Promise((resolve, reject) => {
    const args = [
      "--format=custom",
      "--file",
      outputPath,
      "--host",
      target.host,
      "--port",
      String(target.port),
      "--username",
      target.username,
      "--dbname",
      target.databaseName,
      "--no-password",
    ];

    const child = spawn("pg_dump", args, {
      env: {
        ...process.env,
        PGPASSWORD: target.password,
        PGCONNECT_TIMEOUT: "15",
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_000) {
        stderr += chunk.toString("utf8");
      }
    });

    child.once("error", (error) => {
      reject(new Error(`Não foi possível iniciar o pg_dump: ${error.message}`));
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim() || `código ${code ?? "desconhecido"}`;
      reject(
        new Error(
          `pg_dump terminou com erro${signal ? ` (${signal})` : ""}: ${detail}`,
        ),
      );
    });
  });

