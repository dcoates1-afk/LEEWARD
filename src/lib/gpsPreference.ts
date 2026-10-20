export type GpsMode = 'on' | 'off';

export const GPS_STORAGE_KEY = 'leeward:gps-mode';
const LEGACY_GPS_STORAGE_KEY = 'marnav:gps-mode';
export const GPS_DEFAULT: GpsMode = 'on';

export function parseGpsMode(value: unknown): GpsMode {
  return value === 'off' ? 'off' : 'on';
}

export function readGpsMode(storage: Pick<Storage, 'getItem'> | null | undefined): GpsMode {
  if (!storage) return GPS_DEFAULT;
  try {
    return parseGpsMode(storage.getItem(GPS_STORAGE_KEY) ?? storage.getItem(LEGACY_GPS_STORAGE_KEY));
  } catch {
    return GPS_DEFAULT;
  }
}

export function writeGpsMode(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  mode: GpsMode,
): void {
  if (!storage) return;
  try {
    storage.setItem(GPS_STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the in-memory setting still applies.
  }
}
