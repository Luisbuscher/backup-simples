import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const PASSWORD_PREFIX = "scrypt";
const ENCRYPTION_PREFIX = "enc:v1";

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${PASSWORD_PREFIX}:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [prefix, saltValue, hashValue] = stored.split(":");
  if (prefix !== PASSWORD_PREFIX || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64");
  const actual = (await scrypt(password, Buffer.from(saltValue, "base64"), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class SecretCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest();
  }

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
  }

  decrypt(value: string) {
    if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) {
      throw new Error("Dado sensível legado ainda não foi migrado");
    }
    const [, , ivValue, tagValue, encryptedValue] = value.split(":");
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new Error("Dado criptografado inválido");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  isEncrypted(value: string) {
    return value.startsWith(`${ENCRYPTION_PREFIX}:`);
  }
}
