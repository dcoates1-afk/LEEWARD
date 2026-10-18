import {
  CATEGORY_LABELS as RAW_CATEGORY_LABELS,
  ialaRegion,
  priorityFor,
  selectVisibleNavaids,
} from '../../shared/navaid-core.mjs';
import type { Navaid, NavaidCategory } from './navaidTypes';

export type { Navaid, NavaidCategory } from './navaidTypes';

export const CATEGORY_LABELS = RAW_CATEGORY_LABELS as Record<NavaidCategory, string>;
export { ialaRegion, selectVisibleNavaids };

export interface SymbolSpec {
  svg: string;
  label: string;
}

const RED = '#e23b3b';
const GREEN = '#26a65b';
const YELLOW = '#f4c531';
const BLACK = '#101820';
const WHITE = '#f4f7f8';
const MAGENTA = '#c74bd6';
const BLUE = '#2f7fd0';

function lateralColours(side: 'port' | 'starboard', region: 'A' | 'B') {
  if (region === 'B') {
    return side === 'port' ? { main: GREEN, band: RED } : { main: RED, band: GREEN };
  }
  return side === 'port' ? { main: RED, band: GREEN } : { main: GREEN, band: RED };
}

function svgWrap(inner: string): string {
  return `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">${inner}</svg>`;
}

function outline(shape: string, fill: string, stroke = '#04141f') {
  return `<g stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round">${shape.replace('{fill}', fill)}</g>`;
}

function can(fill: string) {
  return outline('<rect x="8" y="8" width="16" height="18" rx="3" fill="{fill}"/>', fill);
}

function cone(fill: string) {
  return outline('<path d="M16 6 L25 26 H7 Z" fill="{fill}"/>', fill);
}

function sphere(fill: string, band?: string) {
  const base = outline('<circle cx="16" cy="17" r="9.5" fill="{fill}"/>', fill);
  if (!band) return base;
  return `${base}<rect x="7" y="14" width="18" height="5" fill="${band}" stroke="#04141f" stroke-width="1.2"/>`;
}

function diamond(fill: string) {
  return outline('<path d="M16 5 L26 16 L16 27 L6 16 Z" fill="{fill}"/>', fill);
}

function cardinalSvg(kind: 'north' | 'east' | 'south' | 'west') {
  // Two stacked triangles: the classic black/yellow quadrant topmark.
  const top = kind === 'north' || kind === 'west' ? BLACK : YELLOW;
  const bottom = kind === 'north' || kind === 'east' ? YELLOW : BLACK;
  const bands =
    kind === 'east'
      ? `<rect x="7" y="12" width="18" height="5" fill="${BLACK}"/>`
      : kind === 'west'
        ? `<rect x="7" y="19" width="18" height="5" fill="${BLACK}"/>`
        : kind === 'south'
          ? `<rect x="7" y="8" width="18" height="6" fill="${YELLOW}"/>`
          : '';
  return `${outline('<rect x="8" y="8" width="16" height="18" rx="3" fill="{fill}"/>', top)}${bands}
    <path d="M16 3 L21 9 H11 Z" fill="${top}" stroke="#04141f" stroke-width="1.2"/>
    <path d="M16 13 L21 19 H11 Z" fill="${bottom}" stroke="#04141f" stroke-width="1.2"/>`;
}

function lightSvg(fill: string, major: boolean) {
  const rays = major
    ? `${[0, 45, 90, 135, 180, 225, 270, 315]
        .map((deg) => `<line x1="16" y1="16" x2="${16 + 13 * Math.cos((deg * Math.PI) / 180)}" y2="${16 + 13 * Math.sin((deg * Math.PI) / 180)}" stroke="${MAGENTA}" stroke-width="1.8"/>`)
        .join('')}`
    : '';
  return `${rays}${outline('<circle cx="16" cy="16" r="6.5" fill="{fill}"/>', fill)}`;
}

export function symbolFor(category: NavaidCategory, region: 'A' | 'B'): SymbolSpec {
  const label = CATEGORY_LABELS[category] ?? 'Mark';
  switch (category) {
    case 'lateral_port':
      return { svg: svgWrap(can(lateralColours('port', region).main)), label };
    case 'lateral_starboard':
      return { svg: svgWrap(cone(lateralColours('starboard', region).main)), label };
    case 'preferred_channel_port': {
      const colours = lateralColours('port', region);
      return { svg: svgWrap(sphere(colours.main, colours.band)), label };
    }
    case 'preferred_channel_starboard': {
      const colours = lateralColours('starboard', region);
      return { svg: svgWrap(sphere(colours.main, colours.band)), label };
    }
    case 'lateral_other':
      return { svg: svgWrap(can('#8fa3ad')), label };
    case 'cardinal_north':
      return { svg: svgWrap(cardinalSvg('north')), label };
    case 'cardinal_east':
      return { svg: svgWrap(cardinalSvg('east')), label };
    case 'cardinal_south':
      return { svg: svgWrap(cardinalSvg('south')), label };
    case 'cardinal_west':
      return { svg: svgWrap(cardinalSvg('west')), label };
    case 'safe_water':
      return { svg: svgWrap(sphere(WHITE, RED)), label };
    case 'isolated_danger':
      return { svg: svgWrap(sphere(BLACK, RED)), label };
    case 'special_purpose':
      return { svg: svgWrap(diamond(YELLOW)), label };
    case 'range':
      return {
        svg: svgWrap(
          `${outline('<rect x="9" y="4" width="14" height="24" rx="2" fill="{fill}"/>', '#123')}
           <path d="M16 7 L21 13 H11 Z" fill="${WHITE}" stroke="#04141f" stroke-width="1.2"/>
           <path d="M16 25 L21 19 H11 Z" fill="${WHITE}" stroke="#04141f" stroke-width="1.2"/>`,
        ),
        label,
      };
    case 'major_light':
      return { svg: svgWrap(lightSvg(MAGENTA, true)), label };
    case 'light':
      return { svg: svgWrap(lightSvg(MAGENTA, false)), label };
    case 'hazard':
      return { svg: svgWrap(sphere(WHITE, BLACK)), label };
    case 'hazard_danger':
      return {
        svg: svgWrap(
          `${outline('<circle cx="16" cy="16" r="10" fill="{fill}"/>', '#3b2a2a')}
           <path d="M11 11 L21 21 M21 11 L11 21" stroke="${RED}" stroke-width="3"/>`,
        ),
        label,
      };
    case 'landmark':
      return {
        svg: svgWrap(
          `${outline('<path d="M10 26 V11 L16 5 L22 11 V26 Z" fill="{fill}"/>', '#4a5b66')}
           <rect x="14" y="17" width="4" height="9" fill="${WHITE}"/>`,
        ),
        label,
      };
    case 'marina':
      return {
        svg: svgWrap(
          `${outline('<circle cx="16" cy="16" r="10" fill="{fill}"/>', BLUE)}
           <path d="M16 9 V22 M11 18 A5 5 0 0 0 21 18" stroke="${WHITE}" stroke-width="2" fill="none"/>`,
        ),
        label,
      };
    case 'facility':
      return { svg: svgWrap(outline('<rect x="8" y="8" width="16" height="16" rx="8" fill="{fill}"/>', '#35657a')), label };
    case 'mooring':
      return { svg: svgWrap(outline('<circle cx="16" cy="16" r="6" fill="{fill}"/>', YELLOW)), label };
    case 'anchorage':
      return {
        svg: svgWrap(
          `${outline('<circle cx="16" cy="16" r="9" fill="{fill}"/>', '#1d4b63')}
           <path d="M16 9 V21 M12 15 H20 M11 19 A5 5 0 0 0 21 19" stroke="${WHITE}" stroke-width="1.6" fill="none"/>`,
        ),
        label,
      };
    case 'notice':
      return { svg: svgWrap(outline('<rect x="9" y="6" width="14" height="20" rx="2" fill="{fill}"/>', '#c9a227')), label };
    case 'gate':
      return {
        svg: svgWrap(
          `<path d="M6 10 L26 10 M6 22 L26 22" stroke="${WHITE}" stroke-width="2"/>
           <path d="M6 10 L16 22 L26 10" stroke="#1d4b63" stroke-width="2" fill="none"/>`,
        ),
        label,
      };
    default:
      return { svg: svgWrap(outline('<circle cx="16" cy="16" r="6" fill="{fill}"/>', '#7d8f99')), label };
  }
}

export function quickInfo(navaid: Navaid, region: 'A' | 'B'): string {
  const label = CATEGORY_LABELS[navaid.category] ?? 'Mark';
  const parts = [label];
  if (navaid.name) parts.push(navaid.name);
  if (navaid.light) parts.push(navaid.light);
  else if (navaid.colour) parts.push(navaid.colour);
  parts.push(ialaRegion(navaid.lat, navaid.lon) === region ? 'Tap for full reference' : 'Tap for full reference');
  return parts.join(' · ');
}

export function formatPosition(lat: number, lon: number): string {
  const format = (value: number, positive: string, negative: string) => {
    const hemisphere = value >= 0 ? positive : negative;
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    return `${degrees}° ${minutes.toFixed(3).padStart(6, '0')}′ ${hemisphere}`;
  };
  return `${format(lat, 'N', 'S')}  ${format(lon, 'E', 'W')}`;
}

export function priorityLabel(category: NavaidCategory): number {
  return priorityFor(category) as number;
}
