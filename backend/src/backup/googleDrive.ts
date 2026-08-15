import { createReadStream } from "node:fs";
import { google } from "googleapis";
import type { AppConfig } from "../config.js";

export interface DriveUploader {
  (filePath: string, fileName: string, folderId: string): Promise<string>;
  verifyAccess?: () => Promise<void>;
}

export type DriveUploaderWithVerification = DriveUploader & {
  verifyAccess: () => Promise<void>;
};

export const GOOGLE_DRIVE_AUTHORIZATION_ERROR =
  "A autorização do Google Drive expirou ou foi revogada. No Google Auth Platform, confirme o status 'Em produção', gere um novo refresh token e atualize GOOGLE_REFRESH_TOKEN.";

export class GoogleDriveAuthorizationError extends Error {
  constructor() {
    super(GOOGLE_DRIVE_AUTHORIZATION_ERROR);
    this.name = "GoogleDriveAuthorizationError";
  }
}

export function createDriveUploader(
  config: AppConfig,
): DriveUploaderWithVerification {
  const auth = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
  );
  auth.setCredentials({ refresh_token: config.google.refreshToken });
  const drive = google.drive({ version: "v3", auth });

  const upload: DriveUploaderWithVerification = async (
    filePath,
    fileName,
    folderId,
  ) => {
    try {
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
    } catch (error) {
      throw normalizeGoogleDriveError(error);
    }
  };

  upload.verifyAccess = async () => {
    try {
      await auth.getAccessToken();
    } catch (error) {
      throw normalizeGoogleDriveError(error);
    }
  };

  return upload;
}

export function normalizeGoogleDriveError(error: unknown): Error {
  if (isInvalidGrant(error)) return new GoogleDriveAuthorizationError();
  return error instanceof Error ? error : new Error(String(error));
}

function isInvalidGrant(error: unknown) {
  if (error instanceof Error && error.message === "invalid_grant") return true;
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }

  const response = error.response;
  if (
    typeof response !== "object" ||
    response === null ||
    !("data" in response)
  ) {
    return false;
  }

  const data = response.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    data.error === "invalid_grant"
  );
}
