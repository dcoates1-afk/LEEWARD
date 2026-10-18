import { describe, expect, it } from 'vitest';
import {
  classifyTags,
  dedupeNavaids,
  cellBounds,
  cellKey,
  ialaRegion,
  normalizeElement,
  selectVisibleNavaids,
} from '../../shared/navaid-core.mjs';
import type { Navaid, NavaidCategory } from './navaidTypes';

function mark(overrides: Partial<Navaid> & { category: NavaidCategory }): Navaid {
  return {
    id: overrides.id ?? `test/${Math.random()}`,
    lat: overrides.lat ?? 50.8,
    lon: overrides.lon ?? -1.2,
    category: overrides.category,
    form: overrides.form ?? 'buoy',
    name: overrides.name ?? null,
    light: overrides.light ?? null,
    colour: overrides.colour ?? null,
    shape: overrides.shape ?? null,
    height: overrides.height ?? null,
    range: overrides.range ?? null,
    description: overrides.description ?? null,
    lit: overrides.lit ?? null,
    priority: overrides.priority ?? 50,
    source: overrides.source ?? 'osm',
    updated: overrides.updated ?? null,
    region: overrides.region ?? 'solent',
  };
}

describe('classification', () => {
  it('separates port and starboard lateral marks', () => {
    const port = classifyTags({ 'seamark:type': 'buoy_lateral', 'seamark:buoy_lateral:category': 'port' });
    const starboard = classifyTags({
      'seamark:type': 'beacon_lateral',
      'seamark:beacon_lateral:category': 'starboard',
    });
    expect(port?.category).toBe('lateral_port');
    expect(port?.form).toBe('buoy');
    expect(starboard?.category).toBe('lateral_starboard');
    expect(starboard?.form).toBe('beacon');
  });

  it('detects bifurcation / preferred-channel marks', () => {
    const preferred = classifyTags({
      'seamark:type': 'buoy_lateral',
      'seamark:buoy_lateral:category': 'preferred_channel_starboard',
    });
    expect(preferred?.category).toBe('preferred_channel_starboard');
  });

  it('maps cardinal categories and defaults unknown quadrants', () => {
    expect(
      classifyTags({ 'seamark:type': 'buoy_cardinal', 'seamark:buoy_cardinal:category': 'east' })?.category,
    ).toBe('cardinal_east');
    expect(classifyTags({ 'seamark:type': 'beacon_cardinal' })?.category).toBe('cardinal_north');
  });

  it('treats leading beacons and leading-light categories as range marks', () => {
    expect(
      classifyTags({
        'seamark:type': 'beacon_special_purpose',
        'seamark:beacon_special_purpose:category': 'leading',
      })?.category,
    ).toBe('range');
    expect(
      classifyTags({ 'seamark:type': 'light_minor', 'seamark:light:category': 'leading' })?.category,
    ).toBe('range');
  });

  it('classifies unlit beacons as day marks (lit false)', () => {
    const result = classifyTags({
      'seamark:type': 'beacon_special_purpose',
      'seamark:beacon_special_purpose:category': 'warning',
    });
    expect(result?.form).toBe('beacon');
    expect(result?.lit).toBe(false);
  });

  it('drops areas, cables and unknown shoreline features', () => {
    expect(classifyTags({ 'seamark:type': 'cable_submarine' })).toBeNull();
    expect(classifyTags({ 'seamark:type': 'restricted_area' })).toBeNull();
    expect(classifyTags({ 'building': 'yes' })).toBeNull();
  });

  it('keeps lit nodes that only carry light tags', () => {
    expect(classifyTags({ 'seamark:light:character': 'Fl' })?.category).toBe('light');
  });
});

describe('normalisation', () => {
  it('builds a full mark from OSM tags including light text', () => {
    const navaid = normalizeElement({
      type: 'node',
      id: 42,
      lat: 50.7,
      lon: -1.3,
      tags: {
        name: 'No Man Land Buoy',
        'seamark:type': 'buoy_lateral',
        'seamark:buoy_lateral:category': 'port',
        'seamark:light:character': 'Fl',
        'seamark:light:group': '2',
        'seamark:light:colour': 'red',
        'seamark:light:period': '10',
      },
    }) as Navaid;

    expect(navaid.id).toBe('osm:node/42');
    expect(navaid.category).toBe('lateral_port');
    expect(navaid.light).toBe('Fl(2) red 10s');
    expect(navaid.source).toBe('osm');
  });

  it('uses way centres and skips elements without a position', () => {
    const center = normalizeElement({
      type: 'way',
      id: 7,
      center: { lat: 50.6, lon: -1.1 },
      tags: { 'seamark:type': 'buoy_safe_water' },
    }) as Navaid;
    expect(center.lat).toBe(50.6);
    expect(normalizeElement({ type: 'way', id: 8, tags: { 'seamark:type': 'buoy_lateral' } })).toBeNull();
  });
});

describe('IALA regions', () => {
  it('uses region B in the Americas and region A in Europe', () => {
    expect(ialaRegion(40.7, -74.0)).toBe('B');
    expect(ialaRegion(50.8, -1.2)).toBe('A');
    expect(ialaRegion(35.6, 139.7)).toBe('B');
  });
});

describe('dedupe', () => {
  it('merges records with the same name close together and keeps the richer one', () => {
    const sparse = mark({ category: 'major_light', name: 'Needles Light', lat: 50.66, lon: -1.58 });
    const rich = mark({
      category: 'major_light',
      name: 'Needles Light',
      lat: 50.6601,
      lon: -1.5801,
      light: 'Fl(2) W 10s',
      height: '24',
    });
    const { navaids, removed } = dedupeNavaids([sparse, rich]) as { navaids: Navaid[]; removed: number };
    expect(removed).toBe(1);
    expect(navaids).toHaveLength(1);
    expect((navaids[0] as Navaid).light).toBe('Fl(2) W 10s');
  });

  it('keeps distinct aids that sit close but differ in family and name', () => {
    const buoy = mark({ category: 'lateral_port', lat: 50.7, lon: -1.2, name: 'A' });
    const beacon = mark({ category: 'lateral_starboard', lat: 50.7002, lon: -1.2, name: 'B' });
    const { navaids, removed } = dedupeNavaids([buoy, beacon]) as { navaids: Navaid[]; removed: number };
    expect(removed).toBe(0);
    expect(navaids).toHaveLength(2);
  });

  it('merges the same aid repeated within 12 m even without a name', () => {
    const first = mark({ category: 'hazard', lat: 50.7, lon: -1.2 });
    const second = mark({ category: 'hazard', lat: 50.70005, lon: -1.20005 });
    const { navaids, removed } = dedupeNavaids([first, second]) as { navaids: Navaid[]; removed: number };
    expect(removed).toBe(1);
    expect(navaids).toHaveLength(1);
  });
});

describe('cells', () => {
  it('round-trips a cell key to bounds that contain the point', () => {
    const key = cellKey(50.76, -1.2) as string;
    const [south, west, north, east] = cellBounds(key) as [number, number, number, number];
    expect(50.76).toBeGreaterThanOrEqual(south);
    expect(50.76).toBeLessThanOrEqual(north);
    expect(-1.2).toBeGreaterThanOrEqual(west);
    expect(-1.2).toBeLessThanOrEqual(east);
  });
});

describe('zoom declutter', () => {
  const bounds: [number, number, number, number] = [50.5, -1.8, 51.0, -0.7];

  it('hides low-priority marks at low zoom unless Show all marks is on', () => {
    const light = mark({ category: 'major_light', lat: 50.8, lon: -1.2 });
    const mooring = mark({ category: 'mooring', lat: 50.81, lon: -1.21 });
    const zoomedOut = selectVisibleNavaids([light, mooring], { zoom: 10, bounds }) as Navaid[];
    expect(zoomedOut.map((entry) => entry.category)).toEqual(['major_light']);
    const all = selectVisibleNavaids([light, mooring], { zoom: 10, bounds, showAll: true }) as Navaid[];
    expect(all).toHaveLength(2);
  });

  it('filters marks outside the viewport', () => {
    const inside = mark({ category: 'lateral_port', lat: 50.8, lon: -1.2 });
    const outside = mark({ category: 'lateral_port', lat: 51.5, lon: -1.2 });
    const visible = selectVisibleNavaids([inside, outside], { zoom: 14, bounds, showAll: true }) as Navaid[];
    expect(visible).toHaveLength(1);
  });

  it('caps dense scenes by priority', () => {
    const dense: Navaid[] = [];
    for (let index = 0; index < 40; index += 1) {
      dense.push(mark({ category: 'lateral_port', lat: 50.7 + index * 0.001, lon: -1.2 }));
      dense.push(mark({ category: 'major_light', lat: 50.75 + index * 0.001, lon: -1.3 }));
    }
    const visible = selectVisibleNavaids(dense, {
      zoom: 15,
      bounds: [50.5, -1.8, 51.0, -0.7],
      showAll: true,
      limit: 10,
    }) as Navaid[];
    expect(visible).toHaveLength(10);
    expect(visible.every((entry) => entry.category === 'major_light')).toBe(true);
  });
});
