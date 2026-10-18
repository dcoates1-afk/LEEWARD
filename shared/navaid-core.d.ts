export type NavaidCategory =
  | 'lateral_port'
  | 'lateral_starboard'
  | 'preferred_channel_port'
  | 'preferred_channel_starboard'
  | 'lateral_other'
  | 'cardinal_north'
  | 'cardinal_east'
  | 'cardinal_south'
  | 'cardinal_west'
  | 'safe_water'
  | 'isolated_danger'
  | 'special_purpose'
  | 'range'
  | 'major_light'
  | 'light'
  | 'hazard'
  | 'hazard_danger'
  | 'landmark'
  | 'marina'
  | 'facility'
  | 'mooring'
  | 'anchorage'
  | 'notice'
  | 'gate'
  | 'other';

export type NavaidForm = 'buoy' | 'beacon' | 'light' | 'landmark' | 'mark';

export interface NavaidTagMap {
  [key: string]: string | undefined;
}

export interface Navaid {
  id: string;
  lat: number;
  lon: number;
  category: NavaidCategory;
  form: NavaidForm;
  name: string | null;
  light: string | null;
  colour: string | null;
  shape: string | null;
  height: string | null;
  range: string | null;
  description: string | null;
  lit: boolean | null;
  priority: number;
  source: string;
  updated: string | null;
  region: string | null;
}

export interface ClassifiedMark {
  category: NavaidCategory;
  form: NavaidForm;
  priority: number;
  lit: boolean | null;
}

export const DEFAULT_CELL_SIZE: number;
export const DEDUPE_DISTANCE_M: number;
export const SHOW_ALL_LIMIT: number;
export const DEFAULT_MARK_LIMIT: number;

export function ialaRegion(lat: number, lon: number): 'A' | 'B';
export function classifyTags(tags: NavaidTagMap): ClassifiedMark | null;
export function lightText(tags: NavaidTagMap): string | null;
export function normalizeElement(
  element: unknown,
  regionId?: string | null,
  source?: string,
): Navaid | null;
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number;
export function dedupeNavaids(
  items: Navaid[],
  options?: { distanceM?: number },
): { navaids: Navaid[]; removed: number };
export function cellKey(lat: number, lon: number, size?: number): string;
export function cellBounds(key: string, size?: number): [number, number, number, number];
export function minZoomFor(category: NavaidCategory): number;
export function priorityFor(category: NavaidCategory): number;
export function selectVisibleNavaids(
  navaids: Navaid[],
  options: {
    zoom: number;
    bounds: [number, number, number, number];
    showAll?: boolean;
    limit?: number;
    center?: [number, number];
  },
): Navaid[];
export const CATEGORY_LABELS: Record<NavaidCategory, string>;
