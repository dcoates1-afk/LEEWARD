import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { selectVisibleNavaids } from '../shared/navaid-core.mjs';
import type { Navaid } from './lib/navaidTypes';
import { MapCanvas } from './components/MapCanvas';
import type { MapHandle } from './components/MapCanvas';
import { LayerControl } from './components/LayerControl';
import type { DbInfo } from './components/LayerControl';
import { GpsWidget } from './components/GpsWidget';
import { NavaidSheet } from './components/NavaidSheet';
import { StationDrawer } from './components/StationDrawer';
import { useAis } from './hooks/useAis';
import { useGeolocation } from './hooks/useGeolocation';
import {
  readChartPreferences,
  writeChartPreferences,
} from './lib/chartPreferences';
import type { ChartPreferences } from './lib/chartPreferences';
import { readGpsMode, writeGpsMode } from './lib/gpsPreference';
import type { GpsMode } from './lib/gpsPreference';
import { navaidDatabase, regionForPoint } from './lib/navaidDb';
import type { NavaidManifest } from './lib/navaidDb';
import { queryNavaids } from './lib/overpass';
import type { StationTab } from './lib/station';

interface ViewState {
  bounds: [number, number, number, number];
  zoom: number;
  center: [number, number];
}

interface DbReport {
  manifest: NavaidManifest | null;
  checkedAt: number | null;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function App() {
  const storage = useMemo(safeStorage, []);
  const mapRef = useRef<MapHandle | null>(null);

  const [preferences, setPreferences] = useState<ChartPreferences>(() =>
    readChartPreferences(typeof window === 'undefined' ? null : safeStorage()),
  );
  const [gpsMode, setGpsMode] = useState<GpsMode>(() =>
    readGpsMode(typeof window === 'undefined' ? null : safeStorage()),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [station, setStation] = useState<StationTab | null>(null);
  const [selectedMark, setSelectedMark] = useState<Navaid | null>(null);
  const initialView = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = Number.parseFloat(params.get('lat') ?? '');
    const lon = Number.parseFloat(params.get('lon') ?? '');
    const zoomParam = Number.parseFloat(params.get('z') ?? '');
    const center: [number, number] =
      Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : [50.76, -1.2];
    const zoom = Number.isFinite(zoomParam) ? Math.min(18, Math.max(2, zoomParam)) : 11;
    const span = 360 / 2 ** zoom;
    return {
      center,
      zoom,
      bounds: [center[0] - span / 2, center[1] - span / 2, center[0] + span / 2, center[1] + span / 2] as [
        number,
        number,
        number,
        number,
      ],
    };
  }, []);

  const [view, setView] = useState<ViewState>(initialView);
  const [weatherAt, setWeatherAt] = useState<[number, number]>([50.76, -1.2]);
  const [noaaCovered, setNoaaCovered] = useState(false);
  const [marks, setMarks] = useState<Navaid[]>(() => navaidDatabase.seed());
  const [markSource, setMarkSource] = useState<{ live: boolean; cached: boolean }>({ live: false, cached: true });
  const [db, setDb] = useState<DbReport>({ manifest: null, checkedAt: null });
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const geo = useGeolocation(gpsMode);
  const aisEnabled = station === 'ais' || preferences.overlays.ais;
  const ais = useAis(aisEnabled);

  useEffect(() => {
    writeChartPreferences(storage, preferences);
  }, [preferences, storage]);

  useEffect(() => {
    writeGpsMode(storage, gpsMode);
  }, [gpsMode, storage]);

  // Manifest + weekly revalidation, once per session.
  useEffect(() => {
    let cancelled = false;
    void navaidDatabase.init().then((report) => {
      if (cancelled) return;
      setDb({
        manifest: report.manifest,
        checkedAt: report.checked ? Date.now() : navaidDatabase.getCheckedAt(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load marks for the current view: built shards first, live query otherwise.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    const manifest = db.manifest;
    const region = manifest ? regionForPoint(manifest, view.center[0], view.center[1]) : null;

    const timer = setTimeout(() => {
      void (async () => {
        if (region) {
          const result = await navaidDatabase.load(view.bounds);
          if (cancelled || id !== requestId.current) return;
          if (result.navaids.length > 0) {
            setMarks(result.navaids);
            setMarkSource({ live: false, cached: result.fetched === 0 });
            return;
          }
        }

        const [south, west, north, east] = view.bounds;
        const span = Math.max(north - south, east - west);
        if (view.zoom < 8 || span > 3) {
          if (!cancelled && id === requestId.current) setMarks([]);
          return;
        }

        try {
          const live = await queryNavaids(view.bounds);
          if (cancelled || id !== requestId.current) return;
          setMarks(live.navaids);
          setMarkSource({ live: true, cached: live.cached });
        } catch {
          if (!cancelled && id === requestId.current) setMarks([]);
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, db.manifest, reloadKey]);

  // Warm the active region once the first shard load settles.
  useEffect(() => {
    if (!db.manifest) return;
    const region = regionForPoint(db.manifest, view.center[0], view.center[1]);
    if (!region) return;
    const timer = setTimeout(() => {
      void navaidDatabase.prefetchRegion(region.id);
    }, 1500);
    return () => clearTimeout(timer);
  }, [db.manifest, view.center, reloadKey]);

  const marksInView = useMemo(() => {
    const [south, west, north, east] = view.bounds;
    return marks.filter((mark) => mark.lat >= south && mark.lat <= north && mark.lon >= west && mark.lon <= east);
  }, [marks, view.bounds]);

  const visibleMarks = useMemo(
    () =>
      selectVisibleNavaids(marks, {
        zoom: view.zoom,
        bounds: view.bounds,
        showAll: preferences.showAllMarks,
        center: view.center,
      }),
    [marks, view, preferences.showAllMarks],
  );

  const dbInfo: DbInfo | null = useMemo(() => {
    const manifest = db.manifest;
    if (!manifest) return null;
    return {
      version: manifest.version,
      builtAt: manifest.generatedAt,
      count: manifest.stats.uniqueAids,
      duplicates: manifest.stats.duplicatesRemoved,
      sources: manifest.sources.map((source) => source.name),
      checkedAt: db.checkedAt,
    };
  }, [db]);

  const configure = useCallback((next: ChartPreferences) => {
    setPreferences(next);
  }, []);

  const changeGpsMode = useCallback((mode: GpsMode) => {
    setGpsMode(mode);
  }, []);

  const centreOn = useCallback((lat: number, lon: number, zoom = 14) => {
    mapRef.current?.flyTo(lat, lon, zoom);
  }, []);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setCheckMessage(null);
    const result = await navaidDatabase.ensureFresh(true);
    setChecking(false);
    setDb({
      manifest: navaidDatabase.getManifest(),
      checkedAt: navaidDatabase.getCheckedAt(),
    });
    if (result.updated) {
      setCheckMessage('New database version downloaded — chart marks refreshed.');
      setReloadKey((key) => key + 1);
    } else {
      setCheckMessage(result.checked ? 'Database is up to date.' : 'Update check could not reach the server.');
    }
  }, []);

  const onViewChange = useCallback(
    (bounds: [number, number, number, number], zoom: number, center: [number, number]) => {
      setView({ bounds, zoom, center });
    },
    [],
  );

  return (
    <div className="app">
      <MapCanvas
        ref={mapRef}
        initialCenter={initialView.center}
        initialZoom={initialView.zoom}
        preferences={preferences}
        marks={visibleMarks}
        zoom={view.zoom}
        onSelectMark={setSelectedMark}
        onViewChange={onViewChange}
        onNoaaCoverageChange={setNoaaCovered}
        onMapClick={(lat, lon) => setWeatherAt([lat, lon])}
        fix={geo.fix}
        aisVessels={ais.vessels}
      />

      <LayerControl
        open={menuOpen}
        onOpen={setMenuOpen}
        preferences={preferences}
        onChange={configure}
        gpsMode={gpsMode}
        onGpsMode={changeGpsMode}
        geoStatus={geo.status}
        geoError={geo.error}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onCentre={() => {
          if (geo.fix) centreOn(geo.fix.lat, geo.fix.lon, 14);
        }}
        markStats={{
          shown: visibleMarks.length,
          total: marksInView.length,
          live: markSource.live,
          cached: markSource.cached,
        }}
        dbInfo={dbInfo}
        onCheckUpdates={() => void checkForUpdates()}
        checking={checking}
        checkMessage={checkMessage}
        station={station}
        onStation={setStation}
        noaaCovered={noaaCovered}
        hidden={Boolean(station || selectedMark)}
      />

      {preferences.showPosition && (
        <GpsWidget
          fix={geo.fix}
          status={geo.status}
          error={geo.error}
          gpsMode={gpsMode}
          onCentre={() => {
            if (geo.fix) centreOn(geo.fix.lat, geo.fix.lon, 14);
          }}
          onEnable={() => changeGpsMode('on')}
          onClose={() => configure({ ...preferences, showPosition: false })}
        />
      )}

      {station && (
        <StationDrawer
          station={station}
          onStation={setStation}
          onClose={() => setStation(null)}
          aisState={ais.state}
          aisVessels={ais.vessels}
          aisNote={ais.note}
          center={view.center}
          showAisOnChart={preferences.overlays.ais}
          onToggleAisChart={(value) =>
            configure({ ...preferences, overlays: { ...preferences.overlays, ais: value } })
          }
          onFocusVessel={(vessel) => centreOn(vessel.lat, vessel.lon, 13)}
          weatherAt={weatherAt}
        />
      )}

      {selectedMark && (
        <NavaidSheet
          mark={selectedMark}
          onCentre={(mark) => {
            centreOn(mark.lat, mark.lon, 15);
            setSelectedMark(null);
          }}
          onClose={() => setSelectedMark(null)}
        />
      )}
    </div>
  );
}
