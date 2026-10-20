/**
 * NOAA ENC Direct raster tiles, cached on the device.
 *
 * The export service renders each 256 px tile on demand, which is why the chart
 * crawls on a cold view. Tiles are public-domain and CORS-enabled, so the app
 * fetches them once, stores the bytes in Cache Storage and serves the layer from
 * there; the update check tops the cache up for the area on screen.
 */

// Kept from earlier builds so an existing offline chart pack survives the rename.
export const NOAA_CACHE = 'marnav-noaa-v1';
export const NOAA_TILE_SIZE = 256;
export const NOAA_TILE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const NOAA_EXPORT_BASE =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/encdirect';

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface NoaaPrefetchStats {
  saved: number;
  cached: number;
  failed: number;
  bytes: number;
}

export interface NoaaCacheInfo {
  tiles: number;
  bytes: number;
}

export type Bounds4 = [number, number, number, number];

/** Usage band that matches the current scale. */
export function noaaServiceFor(zoom: number): 'enc_harbour' | 'enc_coastal' | 'enc_general' {
  if (zoom >= 12) return 'enc_harbour';
  if (zoom >= 9) return 'enc_coastal';
  return 'enc_general';
}

const MAX_LAT = 85.0511287798066;

function clampLat(lat: number): number {
  return Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
}

export function tileForPoint(lat: number, lon: number, zoom: number): TileCoord {
  const z = Math.max(0, Math.min(22, Math.round(zoom)));
  const scale = 2 ** z;
  const clamped = clampLat(lat);
  const x = Math.floor(((lon + 180) / 360) * scale);
  const rad = (clamped * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale);
  return { z, x: Math.min(scale - 1, Math.max(0, x)), y: Math.min(scale - 1, Math.max(0, y)) };
}

/** [south, west, north, east] of one slippy tile, in degrees. */
export function tileBounds({ z, x, y }: TileCoord): Bounds4 {
  const scale = 2 ** z;
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / scale))) * 180) / Math.PI;
  return [south, (x / scale) * 360 - 180, north, ((x + 1) / scale) * 360 - 180];
}

function bboxOf(tile: TileCoord): string {
  const [south, west, north, east] = tileBounds(tile);
  const round = (value: number) => Number(value.toFixed(5));
  return [round(west), round(south), round(east), round(north)].join(',');
}

/**
 * The one place a NOAA tile URL is built. The layer and the prefetcher must
 * agree byte for byte or the cached tile would never be found again.
 */
export function noaaTileUrl(tile: TileCoord): string {
  const service = noaaServiceFor(tile.z);
  return (
    `${NOAA_EXPORT_BASE}/${service}/MapServer/export` +
    `?bbox=${bboxOf(tile)}&bboxSR=4326&imageSR=3857&size=${NOAA_TILE_SIZE},${NOAA_TILE_SIZE}` +
    `&format=png32&transparent=false&f=image`
  );
}

export interface PlanOptions {
  max?: number;
  isCovered?: (lat: number, lon: number) => boolean;
}

/**
 * Tiles covering a view at the given zooms, covered waters only, capped so one
 * update check cannot turn into a thousand-tile download.
 */
export function planNoaaTiles(bounds: Bounds4, zooms: number[], options: PlanOptions = {}): TileCoord[] {
  const { max = 48, isCovered = () => true } = options;
  if (!Array.isArray(bounds) || bounds.length !== 4) return [];
  const values = bounds.map(Number);
  if (!values.every(Number.isFinite)) return [];
  const [south, west, north, east] = values as Bounds4;
  if (south >= north || west >= east) return [];

  const seen = new Set<string>();
  const planned: TileCoord[] = [];
  for (const zoom of zooms) {
    const z = Math.max(0, Math.min(18, Math.round(zoom)));
    const topLeft = tileForPoint(north, west, z);
    const bottomRight = tileForPoint(south, east, z);
    for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
      for (let y = topLeft.y; y <= bottomRight.y; y += 1) {
        const key = `${z}/${x}/${y}`;
        if (seen.has(key)) continue;
        const [tileSouth, tileWest, tileNorth, tileEast] = tileBounds({ z, x, y });
        if (!isCovered((tileSouth + tileNorth) / 2, (tileWest + tileEast) / 2)) continue;
        seen.add(key);
        planned.push({ z, x, y });
        if (planned.length >= max) return planned;
      }
    }
  }
  return planned;
}

export function cachedAtOf(response: Response | undefined | null): number | null {
  const header = response?.headers?.get?.('x-marnav-cached-at');
  const stamp = Number(header);
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
}

export function isFresh(
  cachedAt: number | null,
  now = Date.now(),
  maxAge = NOAA_TILE_MAX_AGE_MS,
): boolean {
  return typeof cachedAt === 'number' && cachedAt <= now && now - cachedAt <= maxAge;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(NOAA_CACHE);
  } catch {
    return null;
  }
}

async function storeTile(cache: Cache, url: string, blob: Blob): Promise<void> {
  try {
    const headers = new Headers();
    headers.set('content-type', blob.type || 'image/png');
    headers.set('x-marnav-cached-at', String(Date.now()));
    await cache.put(url, new Response(blob, { headers }));
  } catch {
    // Quota or private-mode failure: the tile still draws.
  }
}

/**
 * Cache-first tile load. Returns a blob URL for the image element; the caller
 * revokes it once the bitmap is in hand.
 */
export async function loadNoaaTile(
  url: string,
  options: { signal?: AbortSignal; maxAge?: number } = {},
): Promise<string> {
  const { signal, maxAge = NOAA_TILE_MAX_AGE_MS } = options;
  const cache = await openCache();
  let stale: Blob | null = null;

  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        if (isFresh(cachedAtOf(hit), Date.now(), maxAge)) {
          return URL.createObjectURL(await hit.blob());
        }
        stale = await hit.blob();
      }
    } catch {
      // A broken cache entry must never stop the chart from drawing.
    }
  }

  try {
    const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`NOAA tile HTTP ${response.status}`);
    const blob = await response.blob();
    if (cache) await storeTile(cache, url, blob);
    return URL.createObjectURL(blob);
  } catch (error) {
    if (stale) return URL.createObjectURL(stale);
    throw error;
  }
}

export interface PrefetchOptions {
  concurrency?: number;
  signal?: AbortSignal;
  maxAge?: number;
  onProgress?: (done: number, total: number, stats: NoaaPrefetchStats) => void;
}

/**
 * Download missing or stale tiles for a plan, a few at a time so the export
 * service is not hammered and the UI keeps breathing.
 */
export async function prefetchNoaaTiles(
  tiles: TileCoord[],
  options: PrefetchOptions = {},
): Promise<NoaaPrefetchStats> {
  const {
    concurrency = 4,
    signal,
    onProgress,
    maxAge = NOAA_TILE_MAX_AGE_MS,
  } = options;
  const cache = await openCache();
  const stats: NoaaPrefetchStats = { saved: 0, cached: 0, failed: 0, bytes: 0 };
  let done = 0;
  const queue = [...tiles];

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return;
      const tile = queue.shift();
      if (!tile) return;
      const url = noaaTileUrl(tile);
      done += 1;
      try {
        const existing = cache ? await cache.match(url) : undefined;
        if (existing && isFresh(cachedAtOf(existing), Date.now(), maxAge)) {
          stats.cached += 1;
        } else {
          const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
          if (!response.ok) throw new Error(`NOAA tile HTTP ${response.status}`);
          const blob = await response.blob();
          if (cache) await storeTile(cache, url, blob);
          stats.saved += 1;
          stats.bytes += blob.size;
        }
      } catch {
        stats.failed += 1;
      }
      onProgress?.(done, tiles.length, stats);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, tiles.length)) }, () => worker()),
  );
  return stats;
}

export async function noaaCacheStats(): Promise<NoaaCacheInfo> {
  const cache = await openCache();
  if (!cache) return { tiles: 0, bytes: 0 };
  try {
    const keys = await cache.keys();
    let bytes = 0;
    for (const request of keys.slice(0, 400)) {
      const response = await cache.match(request);
      if (!response) continue;
      try {
        bytes += (await response.clone().blob()).size;
      } catch {
        // Ignore one unreadable entry.
      }
    }
    return { tiles: keys.length, bytes };
  } catch {
    return { tiles: 0, bytes: 0 };
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 kB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
