import { createReadStream } from "node:fs";
import { google } from "googleapis";
import type { AppConfig } from "../config.js";

export type DriveUploader = (
  filePath: string,
  fileName: string,
  folderId: string,
) => Promise<string>;

export function createDriveUploader(config: AppConfig): DriveUploader {
  const auth = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
  );
  auth.setCredentials({ refresh_token: config.google.refreshToken });
  const drive = google.drive({ version: "v3", auth });

  return async (filePath, fileName, folderId) => {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: "application/octet-stream",
        body: createReadStream(filePath),
      },
      fields: "id",
      supportsAllDrives: true,
    });

    if (!response.data.id) {
      throw new Error("O Google Drive não retornou o ID do arquivo");
    }
    return response.data.id;
  };
}

