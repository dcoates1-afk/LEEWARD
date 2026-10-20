import { POI_GROUPS as RAW_POI_GROUPS } from '../../shared/poi-core.mjs';
import type { PoiGroup } from '../../shared/poi-core';

/**
 * The menu's public-place legend and filters, mirroring `navaidGroups.ts`.
 * Every category the chart can draw belongs to exactly one group, so a user can
 * always switch it off.
 */
export const POI_GROUPS = RAW_POI_GROUPS as PoiGroup[];
export const POI_GROUP_IDS: string[] = POI_GROUPS.map((group) => group.id);

const GROUP_BY_ID = new Map<string, PoiGroup>(POI_GROUPS.map((group) => [group.id, group]));

export function sanitizeHiddenPoiGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    if (!GROUP_BY_ID.has(entry)) continue;
    seen.add(entry);
  }
  return POI_GROUP_IDS.filter((id) => seen.has(id));
}

export function hiddenPoiGroupSet(value: unknown): Set<string> {
  return new Set(sanitizeHiddenPoiGroups(value));
}

export function isPoiGroupHidden(hiddenGroups: unknown, id: string): boolean {
  return sanitizeHiddenPoiGroups(hiddenGroups).includes(id);
}

export function togglePoiGroup(hiddenGroups: unknown, id: string): string[] {
  const current = sanitizeHiddenPoiGroups(hiddenGroups);
  if (!GROUP_BY_ID.has(id)) return current;
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

export function poiGroup(id: string): PoiGroup | undefined {
  return GROUP_BY_ID.get(id);
}
