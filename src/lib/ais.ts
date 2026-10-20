export interface AisVessel {
  mmsi: number;
  name: string | null;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  shipType: string | null;
  typeCode: number | null;
  destination: string | null;
  navStatus: number | null;
  callSign: string | null;
  imo: number | null;
  draught: number | null;
  length: number | null;
  beam: number | null;
  eta: string | null;
  transponder: 'A' | 'B' | null;
  lastSeen: number;
  staticAt: number | null;
  simulated: boolean;
}

export type AisState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'demo' | 'error' | 'closed';

export type AisScope = [[number, number], [number, number]];

export interface AisStatusMessage {
  type: 'status';
  state: AisState;
  note: string | null;
  scope?: AisScope | null;
}

export interface AisSnapshotMessage {
  type: 'snapshot';
  state: AisState;
  note: string | null;
  scope?: AisScope | null;
  vessels: AisVessel[];
}

export function aisSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/ais`;
}

export function vesselLabel(vessel: AisVessel): string {
  if (vessel.name) return vessel.name;
  return `MMSI ${vessel.mmsi}`;
}

export function scopeLabel(scope: AisScope | null): string | null {
  if (!scope) return null;
  const latSpan = Math.abs(scope[1][0] - scope[0][0]);
  const lonSpan = Math.abs(scope[1][1] - scope[0][1]);
  return `${latSpan.toFixed(1)}° × ${lonSpan.toFixed(1)}°`;
}

export function relativeAge(lastSeen: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - lastSeen) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
