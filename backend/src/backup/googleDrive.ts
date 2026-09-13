import { createReadStream } from "node:fs";
import { google } from "googleapis";
import type { AppConfig } from "../config.js";

export interface DriveUploader {
  (filePath: string, fileName: string, folderId: string): Promise<string>;
  verifyAccess?: () => Promise<void>;
  verifyFolderAccess?: (folderId: string) => Promise<void>;
}

export type DriveUploaderWithVerification = DriveUploader & {
  verifyAccess: () => Promise<void>;
};

export interface GoogleAuthorizationResult {
  refreshToken: string;
  rootFolderId: string;
  googleEmail: string | null;
}

export const GOOGLE_DRIVE_AUTHORIZATION_ERROR =
  "A autorização do Google Drive expirou ou foi revogada. Reconecte sua conta do Google Drive no painel.";

export class GoogleDriveAuthorizationError extends Error {
  constructor() {
    super(GOOGLE_DRIVE_AUTHORIZATION_ERROR);
    this.name = "GoogleDriveAuthorizationError";
  }
}

export class GoogleDriveNotConnectedError extends Error {
  constructor() {
    super("Conecte sua conta do Google Drive antes de executar backups");
    this.name = "GoogleDriveNotConnectedError";
  }
}

function createOAuthClient(config: AppConfig) {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    `${config.appBaseUrl}/api/google/callback`,
  );
}

export function createGoogleAuthorizationUrl(config: AppConfig, state: string) {
  return createOAuthClient(config).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    state,
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
}

export async function exchangeGoogleAuthorization(
  config: AppConfig,
  code: string,
): Promise<GoogleAuthorizationResult> {
  const auth = createOAuthClient(config);
  try {
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("O Google não forneceu autorização para acesso offline. Tente conectar novamente.");
    }
    auth.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth });
    const rootFolderId = await findOrCreateRootFolder(drive);
    let googleEmail: string | null = null;
    try {
      const oauth = google.oauth2({ version: "v2", auth });
      googleEmail = (await oauth.userinfo.get()).data.email ?? null;
    } catch {
      // O e-mail é apenas informativo; a autorização do Drive continua válida.
    }
    return { refreshToken: tokens.refresh_token, rootFolderId, googleEmail };
  } catch (error) {
    throw normalizeGoogleDriveError(error);
  }
}

async function findOrCreateRootFolder(
  drive: ReturnType<typeof google.drive>,
) {
  const existing = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='backupSimplesRoot' and value='true' }",
    spaces: "drive",
    fields: "files(id)",
    pageSize: 1,
  });
  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name: "Backup Simples",
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { backupSimplesRoot: "true" },
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("O Google Drive não retornou o ID da pasta criada");
  return created.data.id;
}

export function createDriveUploader(
  config: AppConfig,
  refreshToken: string,
): DriveUploaderWithVerification {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: "v3", auth });

  const upload: DriveUploaderWithVerification = async (filePath, fileName, folderId) => {
    try {
      const response = await drive.files.create({
        requestBody: { name: fileName, parents: [folderId] },
        media: {
          mimeType: "application/octet-stream",
          body: createReadStream(filePath),
        },
        fields: "id",
        supportsAllDrives: true,
      });
      if (!response.data.id) throw new Error("O Google Drive não retornou o ID do arquivo");
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

  upload.verifyFolderAccess = async (folderId) => {
    try {
      const response = await drive.files.get({
        fileId: folderId,
        fields: "id,mimeType,trashed,capabilities(canAddChildren)",
        supportsAllDrives: true,
      });
      if (
        response.data.trashed ||
        response.data.mimeType !== "application/vnd.google-apps.folder" ||
        response.data.capabilities?.canAddChildren === false
      ) {
        throw new Error(
          "A pasta configurada no Google Drive não existe ou não permite novos arquivos",
        );
      }
    } catch (error) {
      throw normalizeGoogleDriveError(error);
    }
  };

  return upload;
}

export async function revokeGoogleAuthorization(
  config: AppConfig,
  refreshToken: string,
) {
  await createOAuthClient(config).revokeToken(refreshToken);
}

export function normalizeGoogleDriveError(error: unknown): Error {
  if (isInvalidGrant(error)) return new GoogleDriveAuthorizationError();
  return error instanceof Error ? error : new Error(String(error));
}

function isInvalidGrant(error: unknown) {
  if (error instanceof Error && error.message === "invalid_grant") return true;
  if (typeof error !== "object" || error === null || !("response" in error)) return false;
  const response = error.response;
  if (typeof response !== "object" || response === null || !("data" in response)) return false;
  const data = response.data;
  return typeof data === "object" && data !== null && "error" in data && data.error === "invalid_grant";
}
