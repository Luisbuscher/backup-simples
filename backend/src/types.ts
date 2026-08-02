export const WEEK_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];
export type BackupTrigger = "manual" | "scheduled";
export type BackupStatus = "running" | "success" | "error";

export interface Schedule {
  enabled: boolean;
  days: WeekDay[];
  time: string | null;
}

export interface DatabaseTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  driveFolderId: string | null;
  schedule: Schedule;
  createdAt: Date;
  updatedAt: Date;
}

export type DatabaseTargetPublic = Omit<DatabaseTarget, "password"> & {
  hasPassword: boolean;
};

export interface DatabaseInput {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  driveFolderId: string | null;
  schedule: Schedule;
}

export interface BackupRun {
  id: string;
  databaseId: string | null;
  databaseName: string;
  trigger: BackupTrigger;
  status: BackupStatus;
  scheduledFor: Date | null;
  fileName: string;
  driveFolderId: string;
  driveFileId: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

