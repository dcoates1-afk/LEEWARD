/**
 * Public-place categories and their OpenStreetMap source.
 *
 * These are the places a navigator looks for once alongside: a berth, fuel,
 * water, a yard, a ramp, a chandlery, food and the facilities around a harbour.
 * The same definitions drive the menu, the browser filter and the Overpass
 * query, so a category can never be drawn without a way to switch it off.
 *
 * Only tags with useful marine or harbour coverage are queried. `amenity=fuel`
 * is deliberately absent: it is the road filling station tag and would carpet
 * every town on the chart with irrelevant pins.
 */

export const POI_GROUPS = [
  {
    id: 'marina',
    label: 'Marinas & berths',
    glyph: 'anchor',
    colour: '#2f7fd0',
    minZoom: 11,
  },
  {
    id: 'fuel_water',
    label: 'Fuel & water',
    glyph: 'drop',
    colour: '#28a3a3',
    minZoom: 11,
  },
  {
    id: 'boatyard',
    label: 'Boatyard & chandlery',
    glyph: 'wrench',
    colour: '#c07a2c',
    minZoom: 12,
  },
  {
    id: 'ramp',
    label: 'Slipways & ramps',
    glyph: 'ramp',
    colour: '#7a63c7',
    minZoom: 12,
  },
  {
    id: 'transport',
    label: 'Transport',
    glyph: 'train',
    colour: '#5b6b78',
    minZoom: 14,
  },
  {
    id: 'food',
    label: 'Food & drink',
    glyph: 'food',
    colour: '#c0485c',
    minZoom: 15,
  },
  {
    id: 'shops',
    label: 'Shops & provisions',
    glyph: 'basket',
    colour: '#8b7d2f',
    minZoom: 15,
  },
  {
    id: 'facilities',
    label: 'Ashore facilities',
    glyph: 'info',
    colour: '#3b8a5a',
    minZoom: 15,
  },
];

export const POI_GROUP_IDS = POI_GROUPS.map((group) => group.id);

const GROUP_BY_ID = new Map(POI_GROUPS.map((group) => [group.id, group]));

function facilityCategory(tags) {
  return tags['seamark:small_craft_facility:category'] || '';
}

function amenity(tags) {
  return tags.amenity || '';
}

function shop(tags) {
  return tags.shop || '';
}

/**
 * Resolve one tag set to exactly one menu group. Order matters: a marina that
 * also carries a fuel tag stays a marina, while a standalone fuel pontoon is a
 * fuel stop.
 */
export function poiGroupForTags(tags = {}) {
  const scf = facilityCategory(tags);
  if (tags.leisure === 'marina') return 'marina';
  if (
    tags['seamark:type'] === 'harbour' &&
    /marina/i.test(tags['seamark:harbour:category'] || '')
  ) {
    return 'marina';
  }
  if (
    tags.waterway === 'fuel' ||
    tags.waterway === 'water_point' ||
    tags.waterway === 'sanitary_dump_station' ||
    amenity(tags) === 'sanitary_dump_station' ||
    amenity(tags) === 'water_point' ||
    /^(fuel_station|water_tap|pump_out|pump-out)$/i.test(scf)
  ) {
    return 'fuel_water';
  }
  if (
    tags.waterway === 'boatyard' ||
    tags.craft === 'boatbuilder' ||
    /^(chandler|ship_chandler|boat|boat_repair)$/i.test(shop(tags)) ||
    /^(chandler|boat_hoist)$/i.test(scf)
  ) {
    return 'boatyard';
  }
  if (
    tags.leisure === 'slipway' ||
    tags.waterway === 'access_point' ||
    /^slipway$/i.test(scf)
  ) {
    return 'ramp';
  }
  if (/^(restaurant|pub|bar|cafe)$/i.test(amenity(tags))) return 'food';
  if (/^(supermarket|convenience|bakery|butcher|fishmonger|greengrocer)$/i.test(shop(tags))) {
    return 'shops';
  }
  if (/^(toilets|shower|laundry|pharmacy|hospital|drinking_water)$/i.test(amenity(tags))) {
    return 'facilities';
  }
  if (/^(station|halt)$/i.test(tags.railway || '') || /^(bus_station|taxi)$/i.test(amenity(tags))) {
    return 'transport';
  }
  return null;
}

const TAG_LABELS = {
  fuel: 'Fuel dock',
  water_point: 'Water point',
  sanitary_dump_station: 'Pump-out',
  boatyard: 'Boatyard',
  access_point: 'Water access',
  restaurant: 'Restaurant',
  pub: 'Pub',
  bar: 'Bar',
  cafe: 'Café',
  toilets: 'Toilets',
  shower: 'Showers',
  laundry: 'Laundry',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  drinking_water: 'Drinking water',
  bus_station: 'Bus station',
  taxi: 'Taxi rank',
  supermarket: 'Supermarket',
  convenience: 'Convenience store',
  bakery: 'Bakery',
  butcher: 'Butcher',
  fishmonger: 'Fishmonger',
  greengrocer: 'Greengrocer',
  station: 'Rail station',
  halt: 'Rail halt',
  boatbuilder: 'Boat builder',
  chandler: 'Chandlery',
  ship_chandler: 'Chandlery',
  boat_repair: 'Boat repair',
  boat_hoist: 'Boat hoist',
  fuel_station: 'Fuel dock',
  water_tap: 'Water point',
  pump_out: 'Pump-out',
  'pump-out': 'Pump-out',
  slipway: 'Slipway',
};

/** Human label for the exact feature, e.g. "Fuel dock" rather than "Fuel & water". */
export function poiKind(tags = {}) {
  const scf = facilityCategory(tags);
  if (
    tags.leisure === 'marina' ||
    (tags['seamark:type'] === 'harbour' && /marina/i.test(tags['seamark:harbour:category'] || ''))
  ) {
    return 'Marina';
  }
  for (const value of [
    tags.waterway,
    tags.leisure,
    tags.craft,
    scf,
    tags.railway,
    tags.shop,
    amenity(tags),
  ]) {
    if (value && TAG_LABELS[value]) return TAG_LABELS[value];
  }
  const group = poiGroupForTags(tags);
  return GROUP_BY_ID.get(group)?.label ?? 'Place';
}

function bboxOf(bounds) {
  const round = (value) => Number(value.toFixed(5));
  return bounds.map(round).join(',');
}

/** Overpass QL for every public-place category in one viewport query. */
export function buildPoiQuery(bounds) {
  const box = `(${bboxOf(bounds)})`;
  const clauses = [
    `nwr["leisure"="marina"]${box};`,
    `nwr["seamark:type"="harbour"]["seamark:harbour:category"~"marina",i]${box};`,
    `nwr["waterway"~"^(fuel|water_point|sanitary_dump_station)$"]${box};`,
    `nwr["amenity"~"^(sanitary_dump_station|water_point)$"]${box};`,
    `nwr["seamark:small_craft_facility:category"~"^(fuel_station|water_tap|pump_out|pump-out)$",i]${box};`,
    `nwr["waterway"="boatyard"]${box};`,
    `nwr["craft"="boatbuilder"]${box};`,
    `nwr["shop"~"^(chandler|ship_chandler|boat|boat_repair)$"]${box};`,
    `nwr["seamark:small_craft_facility:category"~"^(chandler|boat_hoist)$",i]${box};`,
    `nwr["leisure"="slipway"]${box};`,
    `nwr["waterway"="access_point"]${box};`,
    `nwr["seamark:small_craft_facility:category"="slipway"]${box};`,
    `nwr["amenity"~"^(restaurant|pub|bar|cafe)$"]${box};`,
    `nwr["shop"~"^(supermarket|convenience|bakery|butcher|fishmonger|greengrocer)$"]${box};`,
    `nwr["amenity"~"^(toilets|shower|laundry|pharmacy|hospital|drinking_water)$"]${box};`,
    `nwr["railway"~"^(station|halt)$"]${box};`,
    `nwr["amenity"~"^(bus_station|taxi)$"]${box};`,
  ];
  return [
    '[out:json][timeout:60];',
    '(',
    ...clauses,
    ');',
    'out center tags;',
  ].join('');
}

function firstTag(tags, keys) {
  for (const key of keys) {
    const value = tags[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Turn one Overpass element into a public place, or null if it is not one. */
export function normalizePoi(element) {
  if (!element) return null;
  const tags = element.tags || {};
  const group = poiGroupForTags(tags);
  if (!group) return null;
  const lat = element.lat ?? element.center?.lat ?? element.bounds?.minlat;
  const lon = element.lon ?? element.center?.lon ?? element.bounds?.minlon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const kind = element.type || 'node';
  const id =
    element.id !== undefined
      ? `osm:${kind}/${element.id}`
      : `osm:${kind}/${lat.toFixed(5)}/${lon.toFixed(5)}`;
  return {
    id,
    lat,
    lon,
    group,
    name: firstTag(tags, ['name', 'seamark:name', 'ref']),
    kind: poiKind(tags),
    website: firstTag(tags, ['website', 'contact:website', 'url']),
    phone: firstTag(tags, ['phone', 'contact:phone']),
    opening: firstTag(tags, ['opening_hours']),
    operator: firstTag(tags, ['operator']),
    description: firstTag(tags, ['description', 'note']),
  };
}
