/**
 * AIS relay.
 *
 * The browser never sees the AISStream key: one server-side upstream feeds every
 * connected client. The relay reconnects with backoff, keeps a rolling vessel
 * table, and falls back to clearly-labelled simulated traffic when no key is
 * configured so the station still demonstrates its layout offline.
 */
import { WebSocket } from 'ws';

export interface AisVessel {
  mmsi: number;
  name: string | null;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  shipType: string | null;
  destination: string | null;
  lastSeen: number;
  simulated: boolean;
}

export type RelayState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'demo' | 'error';

export interface RelayStatus {
  type: 'status';
  state: RelayState;
  note: string | null;
}

export interface RelaySnapshot {
  type: 'snapshot';
  state: RelayState;
  note: string | null;
  vessels: AisVessel[];
}

const UPSTREAM = 'wss://stream.aisstream.io/v0/stream';
const SNAPSHOT_MS = 2500;
const DEMO_MS = 4000;
const MAX_VESSELS = 800;
const IDLE_CLOSE_MS = 90_000;

const DEMO_SEED = [
  { mmsi: 232001234, name: 'RED JET 6', lat: 50.795, lon: -1.29, cog: 205, sog: 21.4, shipType: 'Passenger' },
  { mmsi: 232004321, name: 'WIGHT RYDER 1', lat: 50.732, lon: -1.16, cog: 12, sog: 9.8, shipType: 'Passenger' },
  { mmsi: 235098765, name: 'NAUTI YETI', lat: 50.842, lon: -1.32, cog: 88, sog: 5.2, shipType: 'Sailing' },
  { mmsi: 235011223, name: 'LIDA SUZANNA', lat: 50.881, lon: -1.1, cog: 274, sog: 7.6, shipType: 'Cargo' },
  { mmsi: 232556677, name: 'SOLENT GUARDIAN', lat: 50.78, lon: -1.02, cog: 145, sog: 11.9, shipType: 'Tug' },
  { mmsi: 235445566, name: 'ARABESQUE', lat: 50.708, lon: -1.42, cog: 332, sog: 4.1, shipType: 'Pleasure' },
];

function shipTypeLabel(type: unknown): string | null {
  const code = typeof type === 'number' ? type : Number(type);
  if (!Number.isFinite(code)) return null;
  if (code >= 60 && code <= 69) return 'Passenger';
  if (code >= 70 && code <= 79) return 'Cargo';
  if (code >= 80 && code <= 89) return 'Tanker';
  if (code === 30) return 'Fishing';
  if (code === 31 || code === 32) return 'Towing';
  if (code === 36) return 'Sailing';
  if (code === 37) return 'Pleasure';
  if (code === 52) return 'Tug';
  if (code === 55) return 'Law enforcement';
  return `Type ${code}`;
}

export function createAisRelay(options: { apiKey: string; log?: (message: string) => void }) {
  const log = options.log ?? (() => {});
  const vessels = new Map<number, AisVessel>();
  const clients = new Set<WebSocket>();

  let upstream: WebSocket | null = null;
  let state: RelayState = 'idle';
  let note: string | null = null;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshotTimer: ReturnType<typeof setInterval> | null = null;
  let demoTimer: ReturnType<typeof setInterval> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  const status = (): RelayStatus => ({ type: 'status', state, note });
  const snapshot = (): RelaySnapshot => ({
    type: 'snapshot',
    state,
    note,
    vessels: [...vessels.values()].sort((a, b) => b.lastSeen - a.lastSeen),
  });

  function send(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function broadcast(payload: unknown) {
    for (const client of clients) send(client, payload);
  }

  function setState(next: RelayState, message: string | null = null) {
    state = next;
    note = message;
    if (clients.size > 0) broadcast(status());
  }

  function ensureSnapshotTimer() {
    if (snapshotTimer) return;
    snapshotTimer = setInterval(() => {
      if (clients.size > 0) broadcast(snapshot());
    }, SNAPSHOT_MS);
    snapshotTimer.unref?.();
  }

  function prune() {
    const cutoff = Date.now() - 12 * 60_000;
    for (const [mmsi, vessel] of vessels) {
      if (vessel.lastSeen < cutoff) vessels.delete(mmsi);
    }
    if (vessels.size > MAX_VESSELS) {
      const oldest = [...vessels.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (const [mmsi] of oldest.slice(0, vessels.size - MAX_VESSELS)) vessels.delete(mmsi);
    }
  }

  function handleMessage(raw: WebSocket.RawData) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const message = (payload.Message ?? {}) as Record<string, Record<string, unknown>>;
    const meta = (payload.MetaData ?? {}) as Record<string, unknown>;

    if (payload.MessageType === 'PositionReport') {
      const report = message.PositionReport ?? {};
      const mmsi = Number(report.UserID ?? meta.MMSI);
      const lat = Number(report.Latitude);
      const lon = Number(report.Longitude);
      if (!Number.isFinite(mmsi) || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const existing = vessels.get(mmsi);
      vessels.set(mmsi, {
        mmsi,
        name: existing?.name ?? null,
        lat,
        lon,
        sog: Number.isFinite(Number(report.Sog)) ? Number(report.Sog) : null,
        cog: Number.isFinite(Number(report.Cog)) ? Number(report.Cog) : null,
        heading: Number.isFinite(Number(report.TrueHeading)) && Number(report.TrueHeading) < 360
          ? Number(report.TrueHeading)
          : existing?.heading ?? null,
        shipType: existing?.shipType ?? null,
        destination: existing?.destination ?? null,
        lastSeen: Date.now(),
        simulated: false,
      });
      prune();
      return;
    }

    if (payload.MessageType === 'ShipStaticData') {
      const data = message.ShipStaticData ?? {};
      const mmsi = Number(data.UserID ?? meta.MMSI);
      if (!Number.isFinite(mmsi)) return;
      const name = typeof data.Name === 'string' ? data.Name.trim() : null;
      const existing = vessels.get(mmsi);
      if (existing) {
        existing.name = name || existing.name;
        existing.shipType = shipTypeLabel(data.Type) ?? existing.shipType;
        existing.destination = typeof data.Destination === 'string' ? data.Destination.trim() : existing.destination;
      } else {
        vessels.set(mmsi, {
          mmsi,
          name,
          lat: Number.NaN,
          lon: Number.NaN,
          sog: null,
          cog: null,
          heading: null,
          shipType: shipTypeLabel(data.Type),
          destination: typeof data.Destination === 'string' ? data.Destination.trim() : null,
          lastSeen: Date.now(),
          simulated: false,
        });
      }
    }
  }

  function stopDemo() {
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
  }

  function startDemo(reason: string) {
    stopDemo();
    vessels.clear();
    const t = Date.now();
    for (const seed of DEMO_SEED) {
      vessels.set(seed.mmsi, {
        ...seed,
        heading: seed.cog,
        destination: null,
        shipType: seed.shipType,
        lastSeen: t,
        simulated: true,
      });
    }
    setState('demo', reason);
    demoTimer = setInterval(() => {
      const now = Date.now();
      for (const vessel of vessels.values()) {
        const rad = ((vessel.cog ?? 0) * Math.PI) / 180;
        const step = (vessel.sog ?? 5) * 0.00018;
        vessel.lat += Math.cos(rad) * step;
        vessel.lon += Math.sin(rad) * step * 1.6;
        vessel.lastSeen = now;
      }
      if (clients.size > 0) broadcast(snapshot());
    }, DEMO_MS);
    demoTimer.unref?.();
  }

  function scheduleReconnect() {
    if (reconnectTimer || clients.size === 0) return;
    attempts += 1;
    if (attempts > 6) {
      setState('error', 'AISStream unreachable — showing simulated traffic');
      startDemo('AISStream unreachable — simulated traffic');
      return;
    }
    const delay = Math.min(30_000, 1000 * 2 ** attempts) + Math.random() * 400;
    setState('reconnecting', `Upstream dropped — retry ${attempts} in ${Math.round(delay / 1000)} s`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (!options.apiKey) {
      startDemo('No AISStream key configured — simulated traffic');
      return;
    }
    if (upstream) return;

    setState('connecting');
    const socket = new WebSocket(UPSTREAM, { handshakeTimeout: 15_000 });
    upstream = socket;

    socket.on('open', () => {
      attempts = 0;
      socket.send(
        JSON.stringify({
          APIKey: options.apiKey,
          BoundingBoxes: [[[-85, -180], [85, 180]]],
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }),
      );
      log('AIS upstream connected');
      setState('live');
    });

    socket.on('message', handleMessage);

    socket.on('close', (code) => {
      upstream = null;
      if (clients.size === 0) {
        setState('idle');
        return;
      }
      log(`AIS upstream closed (${code})`);
      scheduleReconnect();
    });

    socket.on('error', (error) => {
      log(`AIS upstream error: ${error.message}`);
    });
  }

  function attach(ws: WebSocket) {
    clients.add(ws);
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    ensureSnapshotTimer();
    send(ws, status());
    send(ws, snapshot());

    if (!upstream && state !== 'demo') connect();
    else if (state === 'live' && upstream) setState('live');

    ws.on('close', () => {
      clients.delete(ws);
      if (clients.size === 0) {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          upstream?.close();
          upstream = null;
          setState('idle');
        }, IDLE_CLOSE_MS);
        idleTimer.unref?.();
      }
    });
    ws.on('error', () => clients.delete(ws));
  }

  function start() {
    if (started) return;
    started = true;
    ensureSnapshotTimer();
    if (!options.apiKey) startDemo('No AISStream key configured — simulated traffic');
  }

  function stop() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (snapshotTimer) clearInterval(snapshotTimer);
    if (idleTimer) clearTimeout(idleTimer);
    stopDemo();
    reconnectTimer = null;
    snapshotTimer = null;
    idleTimer = null;
    upstream?.close();
    upstream = null;
    for (const client of clients) client.close();
    clients.clear();
    started = false;
  }

  return { attach, start, stop };
}
