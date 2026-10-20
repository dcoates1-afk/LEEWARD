import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCurrentCache,
  currentAt,
  currentSeries,
  fetchCurrentEvents,
  findCurrentPredictions,
  loadCurrentStations,
  modelCurrentAt,
  modelCurrentSeries,
  nearestCurrentStation,
  normalizeCurrentPredictions,
} from './currents';
import type { CurrentEvent, CurrentStation } from './currents';
import { parseNoaaTime } from './time';
import type { SeriesPoint } from './weather';

const at = (iso: string) => Date.parse(iso);
const minute = 60 * 1000;

function event(iso: string, type: CurrentEvent['type'], speedKn: number, setDegrees: number | null): CurrentEvent {
  return { time: iso.slice(0, 16).replace('T', ' '), epoch: at(iso), type, speedKn, setDegrees };
}

const day = [
  event('2026-10-18T00:00:00Z', 'slack', 0, null),
  event('2026-10-18T01:30:00Z', 'flood', 1.8, 210),
  event('2026-10-18T03:00:00Z', 'slack', 0, null),
  event('2026-10-18T04:30:00Z', 'ebb', 2.4, 40),
  event('2026-10-18T06:00:00Z', 'slack', 0, null),
];

describe('parseNoaaTime', () => {
  it('reads NOAA UTC timestamps', () => {
    expect(parseNoaaTime('2026-10-18 03:24')).toBe(Date.UTC(2026, 9, 18, 3, 24));
  });

  it('rejects junk', () => {
    expect(Number.isNaN(parseNoaaTime('not a time'))).toBe(true);
  });
});

describe('normalizeCurrentPredictions', () => {
  it('turns signed velocity into a speed plus the set of the stream', () => {
    const events = normalizeCurrentPredictions([
      {
        Type: 'flood',
        Time: '2026-10-18 05:35',
        Velocity_Major: 1.9,
        meanFloodDir: 210,
        meanEbbDir: 40,
      },
      {
        Type: 'ebb',
        Time: '2026-10-18 00:30',
        Velocity_Major: -2.25,
        meanFloodDir: 210,
        meanEbbDir: 40,
      },
      { Type: 'slack', Time: '2026-10-18 03:24', Velocity_Major: 0, meanFloodDir: 210, meanEbbDir: 40 },
    ]);

    expect(events.map((entry) => entry.type)).toEqual(['ebb', 'slack', 'flood']);
    const [ebb, slack, flood] = events;
    expect(ebb.speedKn).toBeCloseTo(2.25);
    expect(ebb.setDegrees).toBe(40);
    expect(slack.setDegrees).toBeNull();
    expect(flood.speedKn).toBeCloseTo(1.9);
    expect(flood.setDegrees).toBe(210);
  });

  it('skips entries without a known phase or time', () => {
    expect(
      normalizeCurrentPredictions([
        { Type: 'unknown', Time: '2026-10-18 05:35', Velocity_Major: 1 },
        { Type: 'flood', Time: '', Velocity_Major: 1 },
      ]),
    ).toEqual([]);
  });
});

describe('currentAt', () => {
  it('is slack at slack water', () => {
    const now = currentAt(day, at('2026-10-18T03:00:00Z'));
    expect(now?.phase).toBe('slack');
    expect(now?.speedKn).toBeCloseTo(0);
    expect(now?.setDegrees).toBeNull();
  });

  it('reaches the published peak at maximum flood and sets with the flood', () => {
    const now = currentAt(day, at('2026-10-18T01:30:00Z'));
    expect(now?.phase).toBe('flood');
    expect(now?.speedKn).toBeCloseTo(1.8, 3);
    expect(now?.setDegrees).toBe(210);
  });

  it('interpolates a cosine between slack and peak', () => {
    const now = currentAt(day, at('2026-10-18T00:45:00Z'));
    expect(now?.phase).toBe('flood');
    expect(now?.speedKn).toBeCloseTo(1.8 * Math.SQRT1_2, 3);
  });

  it('reports the ebb set rather than the flood set', () => {
    const now = currentAt(day, at('2026-10-18T04:30:00Z'));
    expect(now?.phase).toBe('ebb');
    expect(now?.setDegrees).toBe(40);
    expect(now?.speedKn).toBeCloseTo(2.4, 3);
  });

  it('names the next event and how far away it is', () => {
    const now = currentAt(day, at('2026-10-18T03:10:00Z'));
    expect(now?.next?.type).toBe('ebb');
    expect(now?.minutesToNext).toBe(80);
  });

  it('falls back to the nearest published event outside the window', () => {
    const now = currentAt(day, at('2026-10-18T20:00:00Z'));
    expect(now?.next).toBeNull();
    expect(now?.minutesToNext).toBeNull();
    expect(now?.speedKn).toBeCloseTo(0);
  });

  it('returns null without events', () => {
    expect(currentAt([], Date.now())).toBeNull();
  });
});

describe('currentSeries', () => {
  it('samples the next twelve hours every half hour', () => {
    const series = currentSeries(day, at('2026-10-18T00:00:00Z'), 12, 30);
    expect(series).toHaveLength(25);
    expect(series[0].speedKn).toBeCloseTo(0);
    expect(Math.max(...series.map((point) => point.speedKn))).toBeGreaterThan(2);
  });
});

describe('nearestCurrentStation', () => {
  const stations: CurrentStation[] = [
    { id: 'A', name: 'Far', lat: 41.5, lon: -73 },
    { id: 'B', name: 'Near', lat: 40.7, lon: -74 },
  ];

  it('picks the closest station', () => {
    const result = nearestCurrentStation(40.71, -74.01, stations);
    expect(result?.station.id).toBe('B');
    expect(result?.distanceKm).toBeLessThan(2);
  });

  it('refuses stations beyond the search radius', () => {
    expect(nearestCurrentStation(38, -60, stations, 60)).toBeNull();
  });
});

describe('findCurrentPredictions', () => {
  const body = {
    current_predictions: {
      units: 'feet, knots',
      cp: [
        { Type: 'slack', Time: '2026-10-18 00:00', Velocity_Major: 0, meanFloodDir: 210, meanEbbDir: 40 },
        { Type: 'flood', Time: '2026-10-18 01:30', Velocity_Major: 1.8, meanFloodDir: 210, meanEbbDir: 40 },
        { Type: 'slack', Time: '2026-10-18 03:00', Velocity_Major: 0, meanFloodDir: 210, meanEbbDir: 40 },
      ],
    },
  };

  function respond(payload: unknown, ok = true) {
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
    } as Response;
  }

  beforeEach(() => {
    clearCurrentCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCurrentCache();
  });

  it('returns predictions for the nearest station', async () => {
    const fetchMock = vi.fn(async (_url: string) => respond(body));
    vi.stubGlobal('fetch', fetchMock);

    const lookup = await findCurrentPredictions(40.7, -74.014, { now: at('2026-10-18T01:00:00Z') });
    expect(lookup.status).toBe('ok');
    if (lookup.status !== 'ok') throw new Error('expected a forecast');
    expect(lookup.forecast.station.name.length).toBeGreaterThan(0);
    expect(lookup.forecast.distanceKm).toBeLessThanOrEqual(60);
    expect(lookup.forecast.events).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('product=currents_predictions');
  });

  it('serves a repeat lookup from memory', async () => {
    const fetchMock = vi.fn(async () => respond(body));
    vi.stubGlobal('fetch', fetchMock);

    await findCurrentPredictions(40.7, -74.014, { now: at('2026-10-18T01:00:00Z') });
    await findCurrentPredictions(40.7, -74.014, { now: at('2026-10-18T01:00:00Z') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through stations that answer without predictions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ error: { message: 'not available' } }))
      .mockImplementation(async () => respond(body));
    vi.stubGlobal('fetch', fetchMock);

    const lookup = await findCurrentPredictions(40.7, -74.014, { now: at('2026-10-18T01:00:00Z') });
    expect(lookup.status).toBe('ok');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('reports when no station is close enough', async () => {
    const lookup = await findCurrentPredictions(35, -150, { now: at('2026-10-18T01:00:00Z') });
    expect(lookup.status).toBe('no-station');
  });

  it('reports unavailable when every station fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ error: { message: 'down' } })));
    const lookup = await findCurrentPredictions(40.7, -74.014, { now: at('2026-10-18T01:00:00Z') });
    expect(lookup.status).toBe('unavailable');
  });

  it('loads the bundled index without a network request', async () => {
    const stations = await loadCurrentStations();
    expect(stations.length).toBeGreaterThan(2000);
    expect(stations.every((station) => Number.isFinite(station.lat) && Number.isFinite(station.lon))).toBe(true);
  });

  it('uses the currents product and knots', async () => {
    const fetchMock = vi.fn(async (_url: string) => respond(body));
    vi.stubGlobal('fetch', fetchMock);
    await fetchCurrentEvents('ACT0091', 2);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('units=english');
    expect(url).toContain('interval=max_slack');
  });
});

describe('global model current', () => {
  const speed: SeriesPoint[] = [
    { time: '2026-10-18T00:00', value: 1.852 },
    { time: '2026-10-18T01:00', value: 3.704 },
  ];
  const direction: SeriesPoint[] = [
    { time: '2026-10-18T00:00', value: 250 },
    { time: '2026-10-18T01:00', value: 260 },
  ];

  it('converts Open-Meteo km/h into knots and keeps the set', () => {
    const now = modelCurrentAt(speed, direction, Date.UTC(2026, 9, 18, 0, 0));
    expect(now?.speedKn).toBeCloseTo(1, 3);
    expect(now?.setDegrees).toBe(250);
  });

  it('interpolates between hourly samples', () => {
    const now = modelCurrentAt(speed, direction, Date.UTC(2026, 9, 18, 0, 30));
    expect(now?.speedKn).toBeCloseTo(1.5, 3);
  });

  it('returns null without model data', () => {
    expect(modelCurrentAt([], [], Date.now())).toBeNull();
  });

  it('builds a twelve-hour curve in knots', () => {
    const series = modelCurrentSeries(speed, Date.UTC(2026, 9, 18, 0, 0), 12);
    expect(series).toHaveLength(2);
    expect(series[0].speedKn).toBeCloseTo(1, 3);
    expect(series[1].speedKn).toBeCloseTo(2, 3);
    expect(modelCurrentSeries(speed, Date.UTC(2026, 9, 19, 0, 0), 12)).toEqual([]);
  });
});

describe('current interpolation windows', () => {
  it('marks a near-zero interpolated speed as slack', () => {
    const now = currentAt(day, at('2026-10-18T00:00:00Z') + minute);
    expect(now?.phase).toBe('slack');
    expect(now?.setDegrees).toBeNull();
  });
});
