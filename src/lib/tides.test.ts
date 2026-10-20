import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTideCache,
  fetchNoaaTideEvents,
  findTideForecast,
  heightAt,
  loadTideStations,
  modelTideForecast,
  nearestTideStation,
  tideEventsFromSeries,
} from './tides';
import type { SeriesPoint } from './weather';

function sineTide(hours = 24, period = 12, amplitude = 2, mean = 0.3): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let hour = 0; hour <= hours; hour += 1) {
    const value = mean + amplitude * Math.sin((2 * Math.PI * hour) / period);
    const day = 18 + Math.floor(hour / 24);
    const hourOfDay = hour % 24;
    points.push({
      time: `2026-10-${String(day).padStart(2, '0')}T${String(hourOfDay).padStart(2, '0')}:00`,
      value: Number(value.toFixed(3)),
    });
  }
  return points;
}

describe('nearest tide station', () => {
  it('picks the closest station inside the search radius', async () => {
    const stations = await loadTideStations();
    const result = nearestTideStation(40.71, -74.02, stations);
    expect(result?.station.id).toBe('8518750');
    expect(result?.distanceKm).toBeLessThan(10);
  });

  it('returns null outside NOAA coverage so the global model is used', async () => {
    const stations = await loadTideStations();
    expect(nearestTideStation(50.76, -1.2, stations)).toBeNull();
  });

  it('bundles thousands of stations with unique ids and plausible coordinates', async () => {
    const stations = await loadTideStations();
    expect(stations.length).toBeGreaterThan(3000);
    expect(new Set(stations.map((station) => station.id)).size).toBe(stations.length);
    expect(
      stations.every(
        (station) =>
          Number.isFinite(station.lat) &&
          Number.isFinite(station.lon) &&
          Math.abs(station.lat) <= 90 &&
          Math.abs(station.lon) <= 180,
      ),
    ).toBe(true);
  });
});

describe('tideEventsFromSeries', () => {
  it('recovers highs and lows from an hourly curve, refined off the hour', () => {
    const events = tideEventsFromSeries(sineTide());
    expect(events.map((event) => [event.type, event.time])).toEqual([
      ['H', '2026-10-18 03:00'],
      ['L', '2026-10-18 09:00'],
      ['H', '2026-10-18 15:00'],
      ['L', '2026-10-18 21:00'],
    ]);
    expect(events[0].value).toBeCloseTo(2.3, 1);
    expect(events[1].value).toBeCloseTo(-1.7, 1);
  });

  it('refines a turning point that falls between samples', () => {
    const points: SeriesPoint[] = [
      { time: '2026-10-18T00:00', value: 0 },
      { time: '2026-10-18T01:00', value: 0.6 },
      { time: '2026-10-18T02:00', value: 0.9 },
      { time: '2026-10-18T03:00', value: 0.7 },
      { time: '2026-10-18T04:00', value: 0 },
    ];
    const events = tideEventsFromSeries(points);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('H');
    // Parabola through 0.6, 0.9, 0.7 peaks 0.1 h after the centre sample.
    expect(events[0].time).toBe('2026-10-18 02:06');
    expect(events[0].value).toBeCloseTo(0.9, 2);
  });

  it('returns nothing for a flat or too-short curve', () => {
    expect(tideEventsFromSeries([])).toEqual([]);
    expect(tideEventsFromSeries([{ time: '2026-10-18T00:00', value: 1 }])).toEqual([]);
    expect(
      tideEventsFromSeries([
        { time: '2026-10-18T00:00', value: 1 },
        { time: '2026-10-18T01:00', value: 1 },
        { time: '2026-10-18T02:00', value: 1 },
      ]),
    ).toEqual([]);
  });
});

describe('heightAt', () => {
  const points: SeriesPoint[] = [
    { time: '2026-10-18T00:00', value: 0 },
    { time: '2026-10-18T01:00', value: 2 },
    { time: '2026-10-18T02:00', value: 1 },
  ];

  it('interpolates between hourly heights', () => {
    expect(heightAt(points, Date.UTC(2026, 9, 18, 0, 30))).toBeCloseTo(1, 2);
    expect(heightAt(points, Date.UTC(2026, 9, 18, 1, 15))).toBeCloseTo(1.75, 2);
  });

  it('clamps to the ends of the curve', () => {
    expect(heightAt(points, Date.UTC(2026, 9, 17, 22))).toBeCloseTo(0, 2);
    expect(heightAt(points, Date.UTC(2026, 9, 18, 6))).toBeCloseTo(1, 2);
    expect(heightAt([], Date.now())).toBeNull();
  });
});

describe('modelTideForecast', () => {
  it('labels model tides as mean sea level rather than a chart datum', () => {
    const forecast = modelTideForecast(sineTide(), Date.UTC(2026, 9, 18, 3, 0));
    expect(forecast.source).toBe('model');
    expect(forecast.datum).toBe('mean sea level');
    expect(forecast.distanceKm).toBeNull();
    expect(forecast.heightNow).toBeCloseTo(2.3, 1);
    expect(forecast.events.length).toBeGreaterThanOrEqual(4);
  });
});

describe('findTideForecast', () => {
  const payload = {
    predictions: [
      { t: '2026-10-18 06:00', v: '1.20', type: 'H' },
      { t: '2026-10-18 12:00', v: '0.10', type: 'L' },
      { t: '2026-10-18 18:00', v: '1.30', type: 'H' },
    ],
  };

  function respond(body: unknown, ok = true) {
    return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
  }

  beforeEach(() => {
    clearTideCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTideCache();
  });

  it('prefers NOAA predictions when a station is close', async () => {
    const fetchMock = vi.fn(async (_url: string) => respond(payload));
    vi.stubGlobal('fetch', fetchMock);

    const lookup = await findTideForecast(40.7, -74.014);
    expect(lookup.status).toBe('ok');
    if (lookup.status !== 'ok') throw new Error('expected a tide forecast');
    expect(lookup.forecast.source).toBe('noaa');
    expect(lookup.forecast.datum).toBe('MLLW');
    expect(lookup.forecast.distanceKm).toBeLessThan(5);
    expect(lookup.forecast.events).toHaveLength(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain('datum=MLLW');
  });

  it('reports no station outside US waters so the model can take over', async () => {
    const lookup = await findTideForecast(50.76, -1.2);
    expect(lookup.status).toBe('no-station');
  });

  it('falls through a station without predictions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ error: { message: 'not available' } }))
      .mockImplementation(async () => respond(payload));
    vi.stubGlobal('fetch', fetchMock);

    const lookup = await findTideForecast(40.7, -74.014);
    expect(lookup.status).toBe('ok');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('reports unavailable when every nearby station fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ error: { message: 'down' } })));
    const lookup = await findTideForecast(40.7, -74.014);
    expect(lookup.status).toBe('unavailable');
  });

  it('parses NOAA predictions and keeps high/low types', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => respond(payload)));
    const events = await fetchNoaaTideEvents('8518750', 2);
    expect(events[0]).toEqual({ time: '2026-10-18 06:00', value: 1.2, type: 'H' });
    expect(events[1].type).toBe('L');
  });

  it('rejects a payload with no usable predictions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ predictions: [] })));
    await expect(fetchNoaaTideEvents('8518750', 2)).rejects.toThrow(/unavailable/i);
  });
});
