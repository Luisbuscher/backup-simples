export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DatabaseTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  schedule: {
    enabled: boolean;
    days: WeekDay[];
    time: string | null;
  };
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupRun {
  id: string;
  databaseId: string | null;
  databaseName: string;
  trigger: "manual" | "scheduled";
  status: "running" | "success" | "error";
  scheduledFor: string | null;
  fileName: string;
  driveFolderId: string;
  driveFileId: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface DatabasePayload {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  schedule: {
    enabled: boolean;
    days: WeekDay[];
    time: string | null;
  };
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface GoogleDriveStatus {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}
