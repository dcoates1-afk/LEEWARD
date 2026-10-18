import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  readChartPreferences,
  sanitizePreferences,
  writeChartPreferences,
} from './chartPreferences';
import { GPS_DEFAULT, parseGpsMode, readGpsMode, writeGpsMode } from './gpsPreference';
import {
  WEEK_MS,
  boundsIntersect,
  regionForPoint,
  shardsForBounds,
  shouldRevalidate,
  validateManifest,
} from './navaidDb';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('chart preferences', () => {
  it('falls back to defaults for junk input', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ base: 'nope', overlays: { navaids: 'yes' } })).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid values and persists them', () => {
    const sanitized = sanitizePreferences({
      base: 'satellite',
      overlays: { tss: true, navaids: false },
      showAllMarks: true,
      showPosition: true,
    });
    expect(sanitized.base).toBe('satellite');
    expect(sanitized.overlays.tss).toBe(true);
    expect(sanitized.overlays.navaids).toBe(false);
    expect(sanitized.overlays.ferries).toBe(false);
    expect(sanitized.showAllMarks).toBe(true);

    const storage = fakeStorage();
    writeChartPreferences(storage, sanitized);
    expect(readChartPreferences(storage)).toEqual(sanitized);
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeChartPreferences(blocked, DEFAULT_PREFERENCES)).not.toThrow();
    expect(readChartPreferences(blocked)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('GPS preference', () => {
  it('defaults to on and only accepts an explicit off', () => {
    expect(GPS_DEFAULT).toBe('on');
    expect(parseGpsMode('off')).toBe('off');
    expect(parseGpsMode('on')).toBe('on');
    expect(parseGpsMode('anything')).toBe('on');
    expect(parseGpsMode(null)).toBe('on');
  });

  it('persists the choice and tolerates missing storage', () => {
    const storage = fakeStorage();
    writeGpsMode(storage, 'off');
    expect(readGpsMode(storage)).toBe('off');
    writeGpsMode(storage, 'on');
    expect(readGpsMode(storage)).toBe('on');
    expect(readGpsMode(null)).toBe('on');
  });
});

describe('weekly database revalidation', () => {
  it('is due when no stamp exists or the stamp is a week old', () => {
    const now = Date.UTC(2026, 9, 18);
    expect(shouldRevalidate(null, now)).toBe(true);
    expect(shouldRevalidate(now - WEEK_MS + 60_000, now)).toBe(false);
    expect(shouldRevalidate(now - WEEK_MS, now)).toBe(true);
    expect(shouldRevalidate(now - WEEK_MS - 1, now)).toBe(true);
  });

  it('can be forced', () => {
    const now = Date.UTC(2026, 9, 18);
    expect(shouldRevalidate(now, now, 0)).toBe(true);
  });
});

const manifest = {
  schema: 2,
  version: '20261018120000-abc',
  generatedAt: '2026-10-18T12:00:00.000Z',
  cellSize: 0.25,
  regions: [
    {
      id: 'solent',
      name: 'Solent',
      bounds: [50.55, -1.85, 51.05, -0.75],
      count: 120,
      sources: ['osm'],
      shards: [
        { path: 'solent/202_-5.json', bounds: [50.5, -1.25, 50.75, -1.0], count: 80 },
        { path: 'solent/203_-5.json', bounds: [50.75, -1.25, 51.0, -1.0], count: 40 },
      ],
    },
    {
      id: 'ny-harbor',
      name: 'New York',
      bounds: [40.45, -74.3, 40.95, -73.7],
      count: 90,
      sources: ['osm'],
      shards: [{ path: 'ny-harbor/161_-297.json', bounds: [40.25, -74.25, 40.5, -74.0], count: 90 }],
    },
  ],
  sources: [{ id: 'osm', name: 'OpenStreetMap seamarks' }],
  stats: { rawRecords: 400, uniqueAids: 210, duplicatesRemoved: 12 },
};

describe('manifest validation', () => {
  it('accepts a well-formed manifest', () => {
    const parsed = validateManifest(manifest);
    expect(parsed?.version).toBe(manifest.version);
    expect(parsed?.regions).toHaveLength(2);
    expect(parsed?.stats.uniqueAids).toBe(210);
  });

  it('rejects other schema versions and empty region lists', () => {
    expect(validateManifest({ ...manifest, schema: 1 })).toBeNull();
    expect(validateManifest({ ...manifest, regions: [] })).toBeNull();
    expect(validateManifest(null)).toBeNull();
  });
});

describe('viewport selection', () => {
  it('detects intersecting bounds', () => {
    expect(boundsIntersect([50.5, -1.5, 51.0, -1.0], [50.6, -1.2, 50.8, -1.1])).toBe(true);
    expect(boundsIntersect([50.5, -1.5, 51.0, -1.0], [51.2, -1.2, 51.4, -1.1])).toBe(false);
  });

  it('selects only the shards that intersect the view', () => {
    const parsed = validateManifest(manifest)!;
    const selection = shardsForBounds(parsed, [50.6, -1.2, 50.7, -1.1]);
    expect(selection).toHaveLength(1);
    expect(selection[0].region.id).toBe('solent');
    expect(selection[0].shards.map((shard) => shard.path)).toEqual(['solent/202_-5.json']);
  });

  it('includes every shard a viewport straddles', () => {
    const parsed = validateManifest(manifest)!;
    const selection = shardsForBounds(parsed, [50.6, -1.2, 50.8, -1.1]);
    expect(selection[0].shards.map((shard) => shard.path)).toEqual([
      'solent/202_-5.json',
      'solent/203_-5.json',
    ]);
  });

  it('resolves the containing region for a point', () => {
    const parsed = validateManifest(manifest)!;
    expect(regionForPoint(parsed, 50.8, -1.2)?.id).toBe('solent');
    expect(regionForPoint(parsed, 40.7, -74.0)?.id).toBe('ny-harbor');
    expect(regionForPoint(parsed, 35.0, 139.0)).toBeNull();
  });
});
