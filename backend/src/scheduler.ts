import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { AppRepository } from "./repository.js";
import type { BackupService } from "./backup/service.js";
import type { WeekDay } from "./types.js";

function zonedScheduleParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    day: values.weekday.toLowerCase() as WeekDay,
    time: `${values.hour}:${values.minute}`,
  };
}

export class BackupScheduler {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly repository: AppRepository,
    private readonly backupService: BackupService,
    private readonly timeZone: string,
  ) {}

  start() {
    if (this.task) return;
    this.task = cron.schedule("* * * * *", () => {
      void this.runDueBackups().catch(() => {
        console.error("Não foi possível verificar os backups agendados");
      });
    });
  }

  stop() {
    this.task?.stop();
    this.task = null;
  }

  async runDueBackups(now = new Date()) {
    const { day, time } = zonedScheduleParts(now, this.timeZone);
    const scheduledFor = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const targets = await this.repository.listScheduledDatabases();
    const due = targets.filter(
      (target) =>
        target.schedule.time === time && target.schedule.days.includes(day),
    );

    await Promise.allSettled(
      due.map((target) =>
        this.backupService.start(target.id, "scheduled", scheduledFor),
      ),
    );
  }
}

export { zonedScheduleParts };
