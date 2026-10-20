/** Both NOAA and Open-Meteo publish UTC without a zone suffix. */

export function parseNoaaTime(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return Number.NaN;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `YYYY-MM-DD HH:mm` in UTC, the shape NOAA prints. */
export function formatUtc(epoch: number): string {
  const date = new Date(epoch);
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}
