import { z } from "zod";

const booleanValue = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z.object({
  APP_DB_HOST: z.string().min(1),
  APP_DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  APP_DB_NAME: z.string().min(1),
  APP_DB_USER: z.string().min(1),
  APP_DB_PASSWORD: z.string(),
  APP_DB_SSL: booleanValue,
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(1),
  ADMIN_USER: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
  TZ: z.string().default("America/Sao_Paulo"),
  JWT_COOKIE_SECURE: booleanValue,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuração inválida: ${details}`);
  }

  return {
    appDb: {
      host: parsed.data.APP_DB_HOST,
      port: parsed.data.APP_DB_PORT,
      database: parsed.data.APP_DB_NAME,
      user: parsed.data.APP_DB_USER,
      password: parsed.data.APP_DB_PASSWORD,
      ssl: parsed.data.APP_DB_SSL,
    },
    google: {
      clientId: parsed.data.GOOGLE_CLIENT_ID,
      clientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
      refreshToken: parsed.data.GOOGLE_REFRESH_TOKEN,
      rootFolderId: parsed.data.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    },
    admin: {
      user: parsed.data.ADMIN_USER,
      password: parsed.data.ADMIN_PASSWORD,
    },
    jwtSecret: parsed.data.JWT_SECRET,
    jwtCookieSecure: parsed.data.JWT_COOKIE_SECURE,
    timeZone: parsed.data.TZ,
    port: parsed.data.PORT,
  };
}

