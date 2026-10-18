export type BaseLayerId = 'osm' | 'satellite' | 'noaa';

export interface OverlayPreferences {
  openseamap: boolean;
  navaids: boolean;
  ferries: boolean;
  tss: boolean;
  ais: boolean;
}

export interface ChartPreferences {
  base: BaseLayerId;
  overlays: OverlayPreferences;
  showAllMarks: boolean;
  showPosition: boolean;
}

export const CHART_STORAGE_KEY = 'marnav:chart-prefs';

export const DEFAULT_PREFERENCES: ChartPreferences = {
  base: 'osm',
  overlays: { openseamap: true, navaids: true, ferries: false, tss: false, ais: true },
  showAllMarks: false,
  showPosition: false,
};

const BASE_IDS: BaseLayerId[] = ['osm', 'satellite', 'noaa'];

export function sanitizePreferences(value: unknown): ChartPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES, overlays: { ...DEFAULT_PREFERENCES.overlays } };
  const input = value as Partial<ChartPreferences>;
  const base = BASE_IDS.includes(input.base as BaseLayerId) ? (input.base as BaseLayerId) : DEFAULT_PREFERENCES.base;
  const overlays = { ...DEFAULT_PREFERENCES.overlays };
  if (input.overlays && typeof input.overlays === 'object') {
    for (const key of Object.keys(overlays) as (keyof OverlayPreferences)[]) {
      const candidate = (input.overlays as unknown as Record<string, unknown>)[key];
      if (typeof candidate === 'boolean') overlays[key] = candidate;
    }
  }
  return {
    base,
    overlays,
    showAllMarks: input.showAllMarks === true,
    showPosition: input.showPosition === true,
  };
}

export function readChartPreferences(storage: Pick<Storage, 'getItem'> | null | undefined): ChartPreferences {
  if (!storage) return sanitizePreferences(null);
  try {
    const raw = storage.getItem(CHART_STORAGE_KEY);
    if (!raw) return sanitizePreferences(null);
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return sanitizePreferences(null);
  }
}

export function writeChartPreferences(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  preferences: ChartPreferences,
): void {
  if (!storage) return;
  try {
    storage.setItem(CHART_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage blocked: preferences still apply for this session.
  }
}
