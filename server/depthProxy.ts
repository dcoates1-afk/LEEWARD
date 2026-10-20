/**
 * EMODnet depth-sample proxy.
 *
 * The EMODnet REST endpoint answers a browser from some origins but not from
 * the app's own origin, so the numeric depth overlay cannot call it directly
 * without filling the console with CORS failures. Sampling server-side also
 * lets one viewport use a single request instead of dozens.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';

const EMODNET_SAMPLE = 'https://rest.emodnet-bathymetry.eu/depth_sample';
const MAX_POINTS = 48;
const CACHE_TTL_MS = 30 * 60 * 1000;

interface Point {
  lat: number;
  lon: number;
}

interface Sample extends Point {
  depth: number | null;
}

const memory = new Map<string, { at: number; samples: Sample[] }>();

function parsePoints(value: string | null): Point[] | null {
  if (!value) return null;
  const points: Point[] = [];
  for (const pair of value.split(';').slice(0, MAX_POINTS)) {
    const [lat, lon] = pair.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -85 || lat > 85 || lon < -180 || lon > 180) continue;
    points.push({ lat, lon });
  }
  return points.length > 0 ? points : null;
}

async function samplePoint(point: Point): Promise<Sample | undefined> {
  const geom = encodeURIComponent(`POINT(${point.lon.toFixed(5)} ${point.lat.toFixed(5)})`);
  try {
    const response = await fetch(`${EMODNET_SAMPLE}?geom=${geom}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { avg?: unknown; smoothed?: unknown; min?: unknown };
    const raw = Number(body.avg ?? body.smoothed ?? body.min);
    if (!Number.isFinite(raw)) return undefined;
    // EMODnet stores elevation: negative is water, positive is land.
    return { ...point, depth: raw < 0 ? Math.abs(raw) : null };
  } catch {
    return undefined;
  }
}

async function sampleAll(points: Point[]): Promise<Sample[]> {
  const out: Sample[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(4, points.length) }, async () => {
    while (next < points.length) {
      const point = points[next];
      next += 1;
      const sample = await samplePoint(point);
      if (sample) out.push(sample);
    }
  });
  await Promise.all(workers);
  return out;
}

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  const acceptsGzip = String(req.headers['accept-encoding'] ?? '').includes('gzip');
  const payload = acceptsGzip ? gzipSync(json) : Buffer.from(json);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (acceptsGzip) res.setHeader('Content-Encoding', 'gzip');
  res.end(payload);
}

export function createDepthHandler(log: (message: string) => void = () => {}) {
  return async function depthHandler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const points = parsePoints(url.searchParams.get('points'));
    if (!points) {
      sendJson(req, res, 400, { error: 'points=lat,lon;lat,lon is required' });
      return;
    }

    const key = points
      .map((point) => `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`)
      .sort()
      .join(';');
    const cached = memory.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      sendJson(req, res, 200, { samples: cached.samples, cached: true });
      return;
    }

    const samples = await sampleAll(points);
    if (samples.length === 0) {
      log('depth proxy: no EMODnet samples returned');
      sendJson(req, res, 502, { error: 'depth service unavailable' });
      return;
    }
    memory.set(key, { at: Date.now(), samples });
    sendJson(req, res, 200, { samples, cached: false });
  };
}
