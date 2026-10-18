import { useMemo } from 'react';
import { distanceMeters } from '../../shared/navaid-core.mjs';
import type { AisState, AisVessel } from '../lib/ais';
import { relativeAge, vesselLabel } from '../lib/ais';

interface AisPanelProps {
  state: AisState;
  vessels: AisVessel[];
  note: string | null;
  center: [number, number];
  showOnChart: boolean;
  onToggleChart: (value: boolean) => void;
  onFocusVessel: (vessel: AisVessel) => void;
}

const STATE_LABEL: Record<AisState, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  demo: 'Simulated',
  error: 'Unavailable',
  closed: 'Closed',
};

export function AisPanel({ state, vessels, note, center, showOnChart, onToggleChart, onFocusVessel }: AisPanelProps) {
  const sorted = useMemo(() => {
    return [...vessels]
      .map((vessel) => ({
        vessel,
        metres: distanceMeters(center[0], center[1], vessel.lat, vessel.lon),
      }))
      .sort((a, b) => a.metres - b.metres)
      .slice(0, 60);
  }, [vessels, center]);

  return (
    <div className="station-body">
      <div className="station-status">
        <span className={`pill state-${state}`}>{STATE_LABEL[state]}</span>
        <span className="status-count">{vessels.length} vessels tracked</span>
      </div>

      {state === 'demo' && (
        <p className="inline-warning">
          Simulated traffic: the relay has no AISStream feed right now, so these positions are illustrative only.
        </p>
      )}
      {state === 'reconnecting' && (
        <p className="inline-warning">
          AISStream drops its upstream connection periodically. The relay reconnects automatically; the last snapshot stays on screen.
        </p>
      )}
      {note && state !== 'live' && <p className="menu-note">{note}</p>}

      <button
        type="button"
        role="switch"
        aria-checked={showOnChart}
        className="menu-row"
        onClick={() => onToggleChart(!showOnChart)}
      >
        <span className="row-label">
          Show targets on chart
          <small>Colour-coded by vessel type</small>
        </span>
        <span className={`switch ${showOnChart ? 'on' : ''}`} aria-hidden="true">
          <span />
        </span>
      </button>

      <ul className="vessel-list">
        {sorted.map(({ vessel, metres }) => (
          <li key={vessel.mmsi}>
            <button type="button" className="vessel-row" onClick={() => onFocusVessel(vessel)}>
              <span className="vessel-name">
                {vesselLabel(vessel)}
                {vessel.simulated && <em>simulated</em>}
              </span>
              <span className="vessel-meta">
                {vessel.shipType ?? 'Unknown type'} · MMSI {vessel.mmsi}
              </span>
              <span className="vessel-numbers">
                <span>{(metres / 1852).toFixed(1)} NM</span>
                <span>{vessel.sog !== null ? `${vessel.sog.toFixed(1)} kn` : '—'}</span>
                <span>{vessel.cog !== null ? `${Math.round(vessel.cog)}°` : '—'}</span>
                <span>{relativeAge(vessel.lastSeen)}</span>
              </span>
            </button>
          </li>
        ))}
        {sorted.length === 0 && <li className="empty-state">No AIS targets received yet.</li>}
      </ul>
    </div>
  );
}
