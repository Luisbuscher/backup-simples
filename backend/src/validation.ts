import { z } from "zod";
import { WEEK_DAYS } from "./types.js";

const scheduleSchema = z
  .object({
    enabled: z.boolean(),
    days: z.array(z.enum(WEEK_DAYS)).max(7),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
  })
  .superRefine((schedule, context) => {
    if (schedule.enabled && schedule.days.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["days"],
        message: "Selecione ao menos um dia",
      });
    }
    if (schedule.enabled && !schedule.time) {
      context.addIssue({
        code: "custom",
        path: ["time"],
        message: "Informe o horário",
      });
    }
  })
  .transform((schedule) => ({
    enabled: schedule.enabled,
    days: [...new Set(schedule.days)],
    time: schedule.enabled ? schedule.time : null,
  }));

const baseDatabaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  database: z.string().trim().min(1).max(120),
  username: z.string().trim().min(1).max(120),
  driveFolderId: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    .transform((value) => value || null),
  schedule: scheduleSchema,
});

export const createDatabaseSchema = baseDatabaseSchema.extend({
  password: z.string().min(1).max(1024),
});

export const updateDatabaseSchema = baseDatabaseSchema.extend({
  password: z.string().max(1024).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(1024),
});

export const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres").max(1024),
});

export const confirmationSchema = z.object({
  token: z.string().min(32).max(512),
});

export const uuidSchema = z.string().uuid();
