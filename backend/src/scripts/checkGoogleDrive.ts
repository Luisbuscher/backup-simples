import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDriveUploader } from "../backup/googleDrive.js";
import { loadConfig } from "../config.js";

const localEnvPath = resolve(process.cwd(), "../.env");
if (!process.env.GOOGLE_CLIENT_ID && existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

try {
  const uploader = createDriveUploader(loadConfig());
  await uploader.verifyAccess();
  console.log("Autorização do Google Drive válida.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
