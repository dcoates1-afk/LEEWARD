export type PoiGroupId =
  | 'marina'
  | 'fuel_water'
  | 'boatyard'
  | 'ramp'
  | 'transport'
  | 'food'
  | 'shops'
  | 'facilities';

export interface PoiGroup {
  id: PoiGroupId;
  label: string;
  glyph: string;
  colour: string;
  minZoom: number;
}

export interface Poi {
  id: string;
  lat: number;
  lon: number;
  group: PoiGroupId;
  name: string | null;
  kind: string;
  website: string | null;
  phone: string | null;
  opening: string | null;
  operator: string | null;
  description: string | null;
}

export const POI_GROUPS: PoiGroup[];
export const POI_GROUP_IDS: string[];
export function poiGroupForTags(tags?: Record<string, string>): PoiGroupId | null;
export function poiKind(tags?: Record<string, string>): string;
export function buildPoiQuery(bounds: [number, number, number, number]): string;
export function normalizePoi(element: unknown): Poi | null;
