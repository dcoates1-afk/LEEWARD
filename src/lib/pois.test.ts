import { describe, expect, it } from 'vitest';
import type { Poi } from '../../shared/poi-core';
import { poiGroupForTags, poiKind, normalizePoi } from '../../shared/poi-core.mjs';
import { poiIconSvg, visiblePois } from './pois';
import { sanitizeHiddenPoiGroups, togglePoiGroup } from './poiGroups';

describe('public place classification', () => {
  it('maps marine tags to their menu class', () => {
    expect(poiGroupForTags({ leisure: 'marina' })).toBe('marina');
    expect(poiGroupForTags({ waterway: 'fuel' })).toBe('fuel_water');
    expect(poiGroupForTags({ waterway: 'water_point' })).toBe('fuel_water');
    expect(poiGroupForTags({ waterway: 'sanitary_dump_station' })).toBe('fuel_water');
    expect(poiGroupForTags({ waterway: 'boatyard' })).toBe('boatyard');
    expect(poiGroupForTags({ shop: 'chandler' })).toBe('boatyard');
    expect(poiGroupForTags({ leisure: 'slipway' })).toBe('ramp');
    expect(poiGroupForTags({ amenity: 'pub' })).toBe('food');
    expect(poiGroupForTags({ shop: 'supermarket' })).toBe('shops');
    expect(poiGroupForTags({ amenity: 'toilets' })).toBe('facilities');
    expect(poiGroupForTags({ railway: 'station' })).toBe('transport');
  });

  it('does not turn every road filling station into a marine place', () => {
    expect(poiGroupForTags({ amenity: 'fuel' })).toBeNull();
    expect(poiGroupForTags({ amenity: 'bench' })).toBeNull();
    expect(poiGroupForTags({})).toBeNull();
  });

  it('names the actual feature, not just the class', () => {
    expect(poiKind({ waterway: 'fuel' })).toBe('Fuel dock');
    expect(poiKind({ waterway: 'sanitary_dump_station' })).toBe('Pump-out');
    expect(poiKind({ waterway: 'boatyard' })).toBe('Boatyard');
    expect(poiKind({ amenity: 'cafe' })).toBe('Café');
    expect(poiKind({ amenity: 'toilets' })).toBe('Toilets');
  });
});

describe('Overpass normalisation', () => {
  it('keeps the centre point and contact detail of a place', () => {
    const poi = normalizePoi({
      type: 'way',
      id: 42,
      center: { lat: 50.76, lon: -1.29 },
      tags: {
        leisure: 'marina',
        name: 'Cowes Marina',
        website: 'https://example.test',
        phone: '+44 1983 000000',
        opening_hours: 'Mo-Su 07:00-21:00',
      },
    }) as Poi | null;
    expect(poi).toMatchObject({
      id: 'osm:way/42',
      lat: 50.76,
      lon: -1.29,
      group: 'marina',
      name: 'Cowes Marina',
      kind: 'Marina',
      website: 'https://example.test',
      phone: '+44 1983 000000',
      opening: 'Mo-Su 07:00-21:00',
    });
  });

  it('rejects elements that are not public places', () => {
    expect(normalizePoi({ lat: 50.7, lon: -1.2, tags: { amenity: 'bench' } })).toBeNull();
    expect(normalizePoi(null)).toBeNull();
  });
});

function place(group: Poi['group'], name: string): Poi {
  return {
    id: name,
    lat: 50.76,
    lon: -1.29,
    group,
    name,
    kind: name,
    website: null,
    phone: null,
    opening: null,
    operator: null,
    description: null,
  };
}

describe('place filters', () => {
  const places = [
    place('marina', 'Marina'),
    place('fuel_water', 'Fuel'),
    place('food', 'Cafe'),
    place('facilities', 'Toilets'),
  ];

  it('reveals harbour-scale classes before town-scale ones', () => {
    expect(visiblePois(places, 11, []).map((poi) => poi.name)).toEqual(['Marina', 'Fuel']);
    expect(visiblePois(places, 14, []).map((poi) => poi.name)).toEqual(['Marina', 'Fuel']);
    expect(visiblePois(places, 15, []).map((poi) => poi.name)).toEqual([
      'Marina',
      'Fuel',
      'Cafe',
      'Toilets',
    ]);
  });

  it('honours the menu filters', () => {
    expect(visiblePois(places, 15, ['food', 'nope']).map((poi) => poi.name)).toEqual([
      'Marina',
      'Fuel',
      'Toilets',
    ]);
  });

  it('sanitises and toggles saved filter choices', () => {
    expect(sanitizeHiddenPoiGroups(['food', 'nope', 'food', 7])).toEqual(['food']);
    expect(togglePoiGroup(['food'], 'marina')).toEqual(['food', 'marina']);
    expect(togglePoiGroup(['food'], 'food')).toEqual([]);
    expect(togglePoiGroup([], 'nope')).toEqual([]);
  });

  it('gives every class its own glyph', () => {
    const glyphs = new Set(
      (['marina', 'fuel_water', 'boatyard', 'ramp', 'transport', 'food', 'shops', 'facilities'] as const).map(
        (group) => poiIconSvg(group),
      ),
    );
    expect(glyphs.size).toBe(8);
  });
});
