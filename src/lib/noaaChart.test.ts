import { describe, expect, it } from 'vitest';
import {
  NOAA_TILE_MAX_AGE_MS,
  formatBytes,
  isFresh,
  noaaServiceFor,
  noaaTileUrl,
  planNoaaTiles,
  tileBounds,
  tileForPoint,
} from './noaaChart';

describe('tile maths', () => {
  it('matches the slippy map bounds of the whole world at z0', () => {
    const [south, west, north, east] = tileBounds({ z: 0, x: 0, y: 0 });
    expect(west).toBe(-180);
    expect(east).toBe(180);
    expect(north).toBeCloseTo(85.0511, 3);
    expect(south).toBeCloseTo(-85.0511, 3);
  });

  it('places a known tile at z2 in the north-west quadrant', () => {
    const [south, west, north, east] = tileBounds({ z: 2, x: 1, y: 1 });
    expect(west).toBe(-90);
    expect(east).toBe(0);
    expect(north).toBeCloseTo(66.5133, 3);
    expect(south).toBeCloseTo(0, 5);
  });

  it('round-trips a point into the tile that contains it', () => {
    const tile = tileForPoint(40.7, -74.03, 13);
    const [south, west, north, east] = tileBounds(tile);
    expect(40.7).toBeGreaterThanOrEqual(south);
    expect(40.7).toBeLessThanOrEqual(north);
    expect(-74.03).toBeGreaterThanOrEqual(west);
    expect(-74.03).toBeLessThanOrEqual(east);
  });

  it('clamps to the poles instead of producing NaN tiles', () => {
    const tile = tileForPoint(89.9, 0, 4);
    expect(Number.isFinite(tile.y)).toBe(true);
    expect(tile.y).toBe(0);
  });
});

describe('tile URLs', () => {
  it('picks the usage band from the zoom level', () => {
    expect(noaaServiceFor(6)).toBe('enc_general');
    expect(noaaServiceFor(10)).toBe('enc_coastal');
    expect(noaaServiceFor(14)).toBe('enc_harbour');
  });

  it('builds one stable URL that the layer and prefetcher share', () => {
    const tile = { z: 13, x: 2410, y: 3078 };
    const url = noaaTileUrl(tile);
    expect(url).toContain('/encdirect/enc_harbour/MapServer/export');
    expect(url).toContain('size=256,256');
    expect(url).toContain('format=png32');
    expect(url).toContain('imageSR=3857');
    expect(url).toContain('bboxSR=4326');
    // Same tile, same bytes: the cache key has to be deterministic.
    expect(noaaTileUrl({ ...tile })).toBe(url);
    const bbox = /bbox=([^&]+)/.exec(url)?.[1]?.split(',').map(Number) ?? [];
    expect(bbox).toHaveLength(4);
    const [west, south, east, north] = bbox;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
  });
});

describe('prefetch planning', () => {
  const newYork: [number, number, number, number] = [40.68, -74.05, 40.72, -74.0];

  it('covers every corner of the view', () => {
    const tiles = planNoaaTiles(newYork, [13], { max: 200 });
    expect(tiles.length).toBeGreaterThan(0);
    const keys = new Set(tiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`));
    for (const [lat, lon] of [
      [newYork[0], newYork[1]],
      [newYork[0], newYork[3]],
      [newYork[2], newYork[1]],
      [newYork[2], newYork[3]],
    ]) {
      const corner = tileForPoint(lat, lon, 13);
      expect(keys.has(`${corner.z}/${corner.x}/${corner.y}`)).toBe(true);
    }
  });

  it('dedupes repeated zooms and stops at the budget', () => {
    expect(planNoaaTiles(newYork, [13, 13], { max: 200 })).toEqual(planNoaaTiles(newYork, [13], { max: 200 }));
    expect(planNoaaTiles(newYork, [13, 14, 15], { max: 5 })).toHaveLength(5);
  });

  it('skips water outside coverage and rejects junk bounds', () => {
    expect(planNoaaTiles(newYork, [13], { isCovered: () => false })).toEqual([]);
    expect(planNoaaTiles([0, 0, 0, 0], [10])).toEqual([]);
    expect(planNoaaTiles([40, -74, 39, -73], [10])).toEqual([]);
    expect(planNoaaTiles(null as never, [10])).toEqual([]);
  });

  it('plans a bounded number of tiles for a phone-sized view', () => {
    const solent: [number, number, number, number] = [50.7, -1.35, 50.83, -1.2];
    const tiles = planNoaaTiles(solent, [12, 13, 14], { max: 48 });
    expect(tiles.length).toBeLessThanOrEqual(48);
    expect(new Set(tiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`)).size).toBe(tiles.length);
  });
});

describe('cache ageing and formatting', () => {
  const now = Date.UTC(2026, 9, 18, 12, 0, 0);

  it('treats only recent stamps as fresh', () => {
    expect(isFresh(now - 1000, now)).toBe(true);
    expect(isFresh(now - NOAA_TILE_MAX_AGE_MS, now)).toBe(true);
    expect(isFresh(now - NOAA_TILE_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
    expect(isFresh(now + 60_000, now)).toBe(false);
  });

  it('formats sensible sizes', () => {
    expect(formatBytes(0)).toBe('0 kB');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
