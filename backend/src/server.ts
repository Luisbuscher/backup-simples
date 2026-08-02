import { createApp } from "./app.js";
import { cleanTemporaryFiles, BackupService } from "./backup/service.js";
import { createDriveUploader } from "./backup/googleDrive.js";
import { runPgDump } from "./backup/pgDump.js";
import { loadConfig } from "./config.js";
import { createPool, initializeSchema } from "./db.js";
import { AppRepository } from "./repository.js";
import { BackupScheduler } from "./scheduler.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  await initializeSchema(pool);

  const repository = new AppRepository(pool);
  await repository.markInterruptedBackups();
  await cleanTemporaryFiles();

  const backupService = new BackupService({
    repository,
    dumpRunner: runPgDump,
    driveUploader: createDriveUploader(config),
    config,
  });
  const scheduler = new BackupScheduler(
    repository,
    backupService,
    config.timeZone,
  );
  const app = createApp({ config, repository, backupService });
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Backend disponível na porta ${config.port}`);
    scheduler.start();
  });

  const shutdown = () => {
    scheduler.stop();
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(
    "Não foi possível iniciar o backend:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});

