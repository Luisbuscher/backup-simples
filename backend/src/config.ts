import { z } from "zod";

const booleanValue = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    APP_DB_HOST: z.string().min(1),
    APP_DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    APP_DB_NAME: z.string().min(1),
    APP_DB_USER: z.string().min(1),
    APP_DB_PASSWORD: z.string(),
    APP_DB_SSL: booleanValue,
    APP_BASE_URL: z.string().url().default("http://localhost"),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    EMAIL_DELIVERY_MODE: z.enum(["log", "resend"]).default("log"),
    RESEND_API_KEY: z.string().default(""),
    RESEND_FROM_EMAIL: z
      .string()
      .min(1)
      .default("Backup Simples <contato@seudominio.com>"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
    DATA_ENCRYPTION_KEY: z
      .string()
      .min(32, "DATA_ENCRYPTION_KEY deve ter pelo menos 32 caracteres"),
    TZ: z.string().default("America/Sao_Paulo"),
    JWT_COOKIE_SECURE: booleanValue,
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .superRefine((value, context) => {
    if (value.EMAIL_DELIVERY_MODE === "resend" && !value.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "é obrigatória quando EMAIL_DELIVERY_MODE=resend",
      });
    }
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

  const data = parsed.data;
  return {
    appDb: {
      host: data.APP_DB_HOST,
      port: data.APP_DB_PORT,
      database: data.APP_DB_NAME,
      user: data.APP_DB_USER,
      password: data.APP_DB_PASSWORD,
      ssl: data.APP_DB_SSL,
    },
    appBaseUrl: data.APP_BASE_URL.replace(/\/$/, ""),
    google: {
      clientId: data.GOOGLE_CLIENT_ID,
      clientSecret: data.GOOGLE_CLIENT_SECRET,
    },
    email: {
      deliveryMode: data.EMAIL_DELIVERY_MODE,
      apiKey: data.RESEND_API_KEY,
      from: data.RESEND_FROM_EMAIL,
    },
    jwtSecret: data.JWT_SECRET,
    dataEncryptionKey: data.DATA_ENCRYPTION_KEY,
    jwtCookieSecure: data.JWT_COOKIE_SECURE,
    timeZone: data.TZ,
    port: data.PORT,
  };
}
