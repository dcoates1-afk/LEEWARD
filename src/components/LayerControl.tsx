import type { ReactNode } from 'react';
import type { BaseLayerId, ChartPreferences } from '../lib/chartPreferences';
import type { GpsMode } from '../lib/gpsPreference';
import type { GeoStatus } from '../hooks/useGeolocation';
import type { StationTab } from '../lib/station';
import { STATION_LABELS } from '../lib/station';

export interface MarkStats {
  shown: number;
  total: number;
  live: boolean;
  cached: boolean;
}

export interface DbInfo {
  version: string;
  builtAt: string;
  count: number;
  duplicates: number;
  sources: string[];
  checkedAt: number | null;
}

interface LayerControlProps {
  open: boolean;
  onOpen: (open: boolean) => void;
  preferences: ChartPreferences;
  onChange: (next: ChartPreferences) => void;
  gpsMode: GpsMode;
  onGpsMode: (mode: GpsMode) => void;
  geoStatus: GeoStatus;
  geoError: string | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCentre: () => void;
  markStats: MarkStats;
  dbInfo: DbInfo | null;
  onCheckUpdates: () => void;
  checking: boolean;
  checkMessage: string | null;
  station: StationTab | null;
  onStation: (tab: StationTab | null) => void;
  noaaCovered: boolean;
  hidden?: boolean;
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="menu-section">
      <h3 className="section-title">{title}</h3>
      {hint && <p className="section-hint">{hint}</p>}
      <div className="menu-rows">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="menu-row"
      onClick={() => onChange(!checked)}
    >
      <span className="row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={`switch ${checked ? 'on' : ''}`} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

function RadioRow({
  label,
  hint,
  active,
  onSelect,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`menu-row ${active ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className="row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={`radio-dot ${active ? 'on' : ''}`} aria-hidden="true" />
    </button>
  );
}

const STATUS_TEXT: Record<GeoStatus, string> = {
  off: 'GPS is off',
  idle: 'GPS starting',
  requesting: 'Waiting for permission / fix',
  active: 'Receiving position',
  error: 'Location error',
  unsupported: 'Not supported on this device',
};

export function LayerControl({
  open,
  onOpen,
  preferences,
  onChange,
  gpsMode,
  onGpsMode,
  geoStatus,
  geoError,
  onZoomIn,
  onZoomOut,
  onCentre,
  markStats,
  dbInfo,
  onCheckUpdates,
  checking,
  checkMessage,
  station,
  onStation,
  noaaCovered,
  hidden = false,
}: LayerControlProps) {
  const setBase = (base: BaseLayerId) => onChange({ ...preferences, base });
  const setOverlay = (key: keyof ChartPreferences['overlays'], value: boolean) =>
    onChange({ ...preferences, overlays: { ...preferences.overlays, [key]: value } });

  return (
    <>
      <button
        type="button"
        className={`menu-button ${open ? 'open' : ''} ${hidden || open ? 'is-hidden' : ''}`}
        aria-label={open ? 'Close chart menu' : 'Open chart menu'}
        aria-expanded={open}
        onClick={() => onOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          {open ? (
            <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <path
              d="M4 7 H20 M4 12 H20 M4 17 H20"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
        </svg>
        <span className="menu-button-label">Chart</span>
      </button>

      {open && (
        <>
          <div className="scrim" onClick={() => onOpen(false)} role="presentation" />
          <section className="menu-panel" role="dialog" aria-modal="true" aria-label="Chart menu">
            <header className="menu-head">
              <div>
                <p className="eyebrow">MARNAV</p>
                <h2>Chart menu</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => onOpen(false)} aria-label="Close menu">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="menu-body">
              <Section title="Base chart">
                <RadioRow
                  label="Standard chart"
                  hint="OpenStreetMap raster"
                  active={preferences.base === 'osm'}
                  onSelect={() => setBase('osm')}
                />
                <RadioRow
                  label="Satellite"
                  hint="Esri World Imagery"
                  active={preferences.base === 'satellite'}
                  onSelect={() => setBase('satellite')}
                />
                <RadioRow
                  label="NOAA ENC"
                  hint="US waters · ArcGIS chart display"
                  active={preferences.base === 'noaa'}
                  onSelect={() => setBase('noaa')}
                />
                {preferences.base === 'noaa' && !noaaCovered && (
                  <p className="inline-warning">
                    This position is outside US chart coverage. Pan to US waters or pick another base chart.
                  </p>
                )}
              </Section>

              <Section title="Overlays">
                <ToggleRow
                  label="OpenSeaMap seamarks"
                  hint="Transparent raster over any base chart"
                  checked={preferences.overlays.openseamap}
                  onChange={(value) => setOverlay('openseamap', value)}
                />
                <ToggleRow
                  label="NAVAIDs from database"
                  hint="Buoys, beacons, lights, ranges, hazards"
                  checked={preferences.overlays.navaids}
                  onChange={(value) => setOverlay('navaids', value)}
                />
                <ToggleRow
                  label="Ferry lanes"
                  hint="Charted ferry routes"
                  checked={preferences.overlays.ferries}
                  onChange={(value) => setOverlay('ferries', value)}
                />
                <ToggleRow
                  label="TSS lanes"
                  hint="Traffic separation schemes"
                  checked={preferences.overlays.tss}
                  onChange={(value) => setOverlay('tss', value)}
                />
                <ToggleRow
                  label="AIS targets"
                  hint="Live vessel positions on the chart"
                  checked={preferences.overlays.ais}
                  onChange={(value) => setOverlay('ais', value)}
                />
              </Section>

              <Section title="Chart detail">
                <ToggleRow
                  label="Show all marks"
                  hint="Ignore zoom declutter (can look crowded)"
                  checked={preferences.showAllMarks}
                  onChange={(value) => onChange({ ...preferences, showAllMarks: value })}
                />
                <p className="menu-note" data-testid="mark-stats">
                  {markStats.shown} of {markStats.total} aids in view ·{' '}
                  {markStats.live ? 'live Overpass query' : markStats.cached ? 'device cache' : 'mark database'}
                </p>
              </Section>

              <Section title="Chart actions">
                <div className="action-grid">
                  <button type="button" className="secondary-button" onClick={onZoomIn}>
                    Zoom in
                  </button>
                  <button type="button" className="secondary-button" onClick={onZoomOut}>
                    Zoom out
                  </button>
                  <button type="button" className="secondary-button" onClick={onCentre} disabled={geoStatus !== 'active'}>
                    Centre on vessel
                  </button>
                  <button type="button" className="secondary-button" onClick={() => onOpen(false)}>
                    Back to chart
                  </button>
                </div>
              </Section>

              <Section
                title="Vessel position"
                hint={gpsMode === 'off' ? 'Device GPS is disabled. Nothing is requested.' : geoError ?? undefined}
              >
                <div className="segmented" role="radiogroup" aria-label="GPS mode">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={gpsMode === 'on'}
                    className={gpsMode === 'on' ? 'active' : ''}
                    onClick={() => onGpsMode('on')}
                  >
                    Always on
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={gpsMode === 'off'}
                    className={gpsMode === 'off' ? 'active' : ''}
                    onClick={() => onGpsMode('off')}
                  >
                    Always off
                  </button>
                </div>
                <p className="menu-note" data-testid="gps-status">
                  {STATUS_TEXT[geoStatus]}
                </p>
                <ToggleRow
                  label="Show position panel"
                  hint="Coordinates, SOG and compass rose"
                  checked={preferences.showPosition}
                  onChange={(value) => onChange({ ...preferences, showPosition: value })}
                />
              </Section>

              <Section title="Stations">
                {(['ais', 'colregs', 'weather'] as StationTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`menu-row nav-row ${station === tab ? 'selected' : ''}`}
                    onClick={() => {
                      onStation(station === tab ? null : tab);
                      onOpen(false);
                    }}
                  >
                    <span className="row-label">{STATION_LABELS[tab]}</span>
                    <span className="chevron" aria-hidden="true">›</span>
                  </button>
                ))}
              </Section>

              <Section title="Mark database" hint={checkMessage ?? undefined}>
                {dbInfo ? (
                  <>
                    <dl className="db-grid">
                      <div>
                        <dt>Aids</dt>
                        <dd>{dbInfo.count.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Duplicates merged</dt>
                        <dd>{dbInfo.duplicates}</dd>
                      </div>
                      <div>
                        <dt>Built</dt>
                        <dd>{new Date(dbInfo.builtAt).toLocaleDateString()}</dd>
                      </div>
                      <div>
                        <dt>Sources</dt>
                        <dd>{dbInfo.sources.length}</dd>
                      </div>
                    </dl>
                    <p className="menu-note">Version {dbInfo.version}</p>
                    <p className="menu-note">
                      {dbInfo.checkedAt
                        ? `Last checked ${new Date(dbInfo.checkedAt).toLocaleDateString()} · rechecked weekly`
                        : 'Weekly update check pending'}
                    </p>
                  </>
                ) : (
                  <p className="menu-note">Loading database status…</p>
                )}
                <button
                  type="button"
                  className="secondary-button wide"
                  onClick={onCheckUpdates}
                  disabled={checking}
                >
                  {checking ? 'Checking for updates…' : 'Check for updates'}
                </button>
              </Section>
            </div>
          </section>
        </>
      )}
    </>
  );
}
