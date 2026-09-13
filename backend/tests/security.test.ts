import { describe, expect, it } from "vitest";
import { SecretCipher, hashPassword, verifyPassword } from "../src/security.js";

describe("security", () => {
  it("armazena senhas de acesso com salt e valida sem recuperar o original", async () => {
    const first = await hashPassword("uma-senha-segura");
    const second = await hashPassword("uma-senha-segura");
    expect(first).not.toBe(second);
    expect(first).not.toContain("uma-senha-segura");
    await expect(verifyPassword("uma-senha-segura", first)).resolves.toBe(true);
    await expect(verifyPassword("outra-senha", first)).resolves.toBe(false);
  });

  it("protege e autentica segredos em repouso", () => {
    const cipher = new SecretCipher("abcdefghijklmnopqrstuvwxyz123456");
    const encrypted = cipher.encrypt("segredo-do-banco");
    expect(encrypted).not.toContain("segredo-do-banco");
    expect(cipher.decrypt(encrypted)).toBe("segredo-do-banco");
    expect(() => cipher.decrypt(`${encrypted}alterado`)).toThrow();
  });
});
