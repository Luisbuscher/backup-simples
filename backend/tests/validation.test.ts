import { describe, expect, it } from "vitest";
import {
  createDatabaseSchema,
  updateDatabaseSchema,
} from "../src/validation.js";

const validInput = {
  name: "Produção",
  host: "db.example.com",
  port: 5432,
  database: "app",
  username: "postgres",
  password: "secret",
  driveFolderId: "",
  schedule: { enabled: true, days: ["mon"], time: "02:00" },
};

describe("database validation", () => {
  it("aceita uma agenda completa e converte pasta vazia em null", () => {
    const result = createDatabaseSchema.parse(validInput);
    expect(result.driveFolderId).toBeNull();
    expect(result.schedule.time).toBe("02:00");
  });

  it("rejeita uma agenda ativa sem dias", () => {
    const result = createDatabaseSchema.safeParse({
      ...validInput,
      schedule: { enabled: true, days: [], time: "02:00" },
    });
    expect(result.success).toBe(false);
  });

  it("permite editar sem enviar uma nova senha", () => {
    const { password: _password, ...input } = validInput;
    expect(updateDatabaseSchema.safeParse(input).success).toBe(true);
  });
});

