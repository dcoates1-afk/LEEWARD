import { useCallback, useEffect, useState } from 'react';
import {
  fetchTideEvents,
  fetchWeather,
  nearestTideStation,
} from '../lib/weather';
import type { SeriesPoint, TideEvent, TideStation, WeatherReport } from '../lib/weather';
import { formatPosition } from '../lib/navaids';

interface WeatherPanelProps {
  lat: number;
  lon: number;
}

function Sparkline({ points, colour }: { points: SeriesPoint[]; colour: string }) {
  const sample = points.slice(0, 24);
  if (sample.length < 2) return null;
  const values = sample.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = sample
    .map((point, index) => {
      const x = (index / (sample.length - 1)) * 100;
      const y = 32 - ((point.value - min) / span) * 28;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${path} L100 36 L0 36 Z`} fill={colour} opacity="0.16" />
      <path d={path} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function arrowFor(direction: number | undefined): string {
  if (direction === undefined) return '—';
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return compass[Math.round(direction / 22.5) % 16];
}

export function WeatherPanel({ lat, lon }: WeatherPanelProps) {
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [tide, setTide] = useState<{ station: TideStation; distanceKm: number; events: TideEvent[] } | null>(null);
  const [tideMessage, setTideMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      setTideMessage(null);
      try {
        const next = await fetchWeather(lat, lon, signal);
        setReport(next);
      } catch (weatherError) {
        if (!(weatherError instanceof DOMException && weatherError.name === 'AbortError')) {
          setError(weatherError instanceof Error ? weatherError.message : 'Weather unavailable');
        }
      }

      const nearest = nearestTideStation(lat, lon);
      if (!nearest) {
        setTide(null);
        setTideMessage('No NOAA tide station within 350 km. NOAA predictions cover US waters only.');
      } else {
        try {
          const events = await fetchTideEvents(nearest.station.id, 3, signal);
          setTide({ ...nearest, events });
        } catch {
          setTide(null);
          setTideMessage(`Predictions unavailable for ${nearest.station.name}.`);
        }
      }
      setLoading(false);
    },
    [lat, lon],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const now = report?.wind[0];
  const gust = report?.gusts[0];
  const direction = report?.windDirection[0]?.value;
  const wave = report?.waves[0];
  const wavePeriod = report?.wavePeriod[0];
  const seaTemperature = report?.seaTemperature[0];
  const airTemperature = report?.temperature[0];
  const nextTides = tide?.events.slice(0, 4) ?? [];

  return (
    <div className="station-body">
      <div className="station-status">
        <span className="pill">Open-Meteo</span>
        <span className="status-count">{formatPosition(lat, lon)}</span>
      </div>

      {loading && <p className="menu-note">Loading marine forecast…</p>}
      {error && <p className="inline-warning">{error}</p>}

      {report && (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <p className="eyebrow">Wind</p>
              <p className="metric-value">{now ? Math.round(now.value) : '—'}<small> kn</small></p>
              <p className="metric-sub">
                gusts {gust ? Math.round(gust.value) : '—'} kn · from {arrowFor(direction)}
              </p>
              <Sparkline points={report.wind} colour="#5cc9f0" />
            </div>
            <div className="metric-card">
              <p className="eyebrow">Sea state</p>
              <p className="metric-value">
                {wave ? wave.value.toFixed(1) : '—'}
                <small> m</small>
              </p>
              <p className="metric-sub">
                {report.marineAvailable
                  ? `period ${wavePeriod ? Math.round(wavePeriod.value) : '—'} s · SST ${
                      seaTemperature ? `${seaTemperature.value.toFixed(1)}°C` : '—'
                    }`
                  : 'marine model has no data at this position'}
              </p>
              <Sparkline points={report.waves} colour="#f4c531" />
            </div>
            <div className="metric-card">
              <p className="eyebrow">Air temperature</p>
              <p className="metric-value">
                {airTemperature ? Math.round(airTemperature.value) : '—'}
                <small> °C</small>
              </p>
              <p className="metric-sub">next 24 h</p>
              <Sparkline points={report.temperature} colour="#57d2a0" />
            </div>
          </div>

          <h3 className="section-title">Next tides</h3>
          {tide ? (
            <>
              <p className="menu-note">
                {tide.station.name} · {tide.distanceKm.toFixed(0)} km away · MLLW
              </p>
              <ul className="tide-list">
                {nextTides.map((event) => (
                  <li key={`${event.time}-${event.type}`}>
                    <span className={`tide-type ${event.type === 'H' ? 'high' : 'low'}`}>
                      {event.type === 'H' ? 'High' : 'Low'}
                    </span>
                    <span>{event.time} UTC</span>
                    <span>{event.value.toFixed(2)} m</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="menu-note">{tideMessage ?? 'Tide predictions unavailable.'}</p>
          )}
        </>
      )}

      <p className="menu-note disclaimer">
        Forecast data from Open-Meteo; tide predictions from NOAA CO-OPS. Always cross-check against official sources
        before passage planning.
      </p>
    </div>
  );
}
