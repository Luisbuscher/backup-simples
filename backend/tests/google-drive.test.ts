import { describe, expect, it } from "vitest";
import {
  GOOGLE_DRIVE_AUTHORIZATION_ERROR,
  GoogleDriveAuthorizationError,
  normalizeGoogleDriveError,
} from "../src/backup/googleDrive.js";

describe("normalizeGoogleDriveError", () => {
  it("traduz invalid_grant retornado pelo endpoint OAuth", () => {
    const error = {
      response: {
        data: {
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        },
      },
    };

    const normalized = normalizeGoogleDriveError(error);

    expect(normalized).toBeInstanceOf(GoogleDriveAuthorizationError);
    expect(normalized.message).toBe(GOOGLE_DRIVE_AUTHORIZATION_ERROR);
  });

  it("preserva outros erros", () => {
    const error = new Error("Pasta não encontrada");
    expect(normalizeGoogleDriveError(error)).toBe(error);
  });
});
