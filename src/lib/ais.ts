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

export type AisState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'demo' | 'error' | 'closed';

export interface AisStatusMessage {
  type: 'status';
  state: AisState;
  note: string | null;
}

export interface AisSnapshotMessage {
  type: 'snapshot';
  state: AisState;
  note: string | null;
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

export function relativeAge(lastSeen: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - lastSeen) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
