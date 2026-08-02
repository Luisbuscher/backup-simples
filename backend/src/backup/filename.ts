function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function normalizeFileSegment(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "banco"
  );
}

export function createBackupFileName(
  databaseName: string,
  date: Date,
  timeZone: string,
) {
  const parts = dateParts(date, timeZone);
  return `${normalizeFileSegment(databaseName)}_${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}.dump`;
}

