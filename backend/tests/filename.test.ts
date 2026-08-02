import { describe, expect, it } from "vitest";
import {
  createBackupFileName,
  normalizeFileSegment,
} from "../src/backup/filename.js";

describe("backup filename", () => {
  it("normaliza o nome e usa o horário configurado", () => {
    const date = new Date("2026-07-26T05:00:00.000Z");
    expect(
      createBackupFileName(
        "Produção / Financeiro",
        date,
        "America/Sao_Paulo",
      ),
    ).toBe("producao-financeiro_2026-07-26_02-00.dump");
  });

  it("fornece um nome seguro quando não há caracteres válidos", () => {
    expect(normalizeFileSegment("***")).toBe("banco");
  });
});

