import type { AisVessel } from './ais';
import { relativeAge, vesselLabel } from './ais';
import { vesselCountry } from './mmsi';

/**
 * Presentation for AIS targets.
 *
 * MarineTraffic's chart works because class and status are readable before any
 * text: colour says what the vessel is, the outline says what it is doing. This
 * module owns that mapping so the marker, the hover card, the station list and
 * the detail sheet cannot drift apart.
 */

export type VesselKind =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'highspeed'
  | 'fishing'
  | 'tug'
  | 'pleasure'
  | 'sailing'
  | 'law'
  | 'military'
  | 'other'
  | 'unknown';

export const VESSEL_KIND_LABELS: Record<VesselKind, string> = {
  cargo: 'Cargo',
  tanker: 'Tanker',
  passenger: 'Passenger',
  highspeed: 'High-speed craft',
  fishing: 'Fishing',
  tug: 'Tug / towing',
  pleasure: 'Pleasure craft',
  sailing: 'Sailing',
  law: 'Law enforcement',
  military: 'Military',
  other: 'Other',
  unknown: 'Unknown type',
};

/** Colour reads as class at chart size; the outline carries the status. */
export const VESSEL_KIND_COLOURS: Record<VesselKind, string> = {
  cargo: '#2fa96b',
  tanker: '#e0453f',
  passenger: '#3b82f6',
  highspeed: '#22c4d6',
  fishing: '#e08a2e',
  tug: '#c9772f',
  pleasure: '#a855f7',
  sailing: '#c084fc',
  law: '#64748b',
  military: '#7c8a5a',
  other: '#8fa3ad',
  unknown: '#8fa3ad',
};

const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  9: 'Reserved (high-speed craft)',
  10: 'Reserved (wing in ground)',
  11: 'Towing astern',
  12: 'Pushing ahead',
  13: 'Reserved',
  14: 'AIS-SART / MOB',
  15: 'Undefined',
};

export type VesselMotion = 'underway' | 'anchored' | 'moored' | 'restricted' | 'aground' | 'stopped' | 'unknown';

const UNDERWAY_COLOUR = '#35c46a';
const ANCHORED_COLOUR = '#f4c531';
const MOORED_COLOUR = '#f59e42';
const RESTRICTED_COLOUR = '#ef4444';
const AGROUND_COLOUR = '#ef4444';
const STOPPED_COLOUR = '#8fa3ad';
const UNKNOWN_COLOUR = '#8fa3ad';

const KIND_BY_TYPE_CODE = (code: number): VesselKind => {
  if (code >= 20 && code <= 29) return 'other'; // wing in ground
  if (code === 30) return 'fishing';
  if (code === 31 || code === 32 || code === 52) return 'tug';
  if (code === 35) return 'military';
  if (code === 36) return 'sailing';
  if (code === 37) return 'pleasure';
  if (code >= 40 && code <= 49) return 'highspeed';
  if (code === 55) return 'law';
  if (code >= 60 && code <= 69) return 'passenger';
  if (code >= 70 && code <= 79) return 'cargo';
  if (code >= 80 && code <= 89) return 'tanker';
  if (code >= 90 && code <= 99) return 'other';
  return 'other';
};

/** Type code first; the label is a fallback for feeds that only send a name. */
export function vesselKind(vessel: AisVessel): VesselKind {
  if (vessel.typeCode !== null && vessel.typeCode > 0) return KIND_BY_TYPE_CODE(vessel.typeCode);
  const label = (vessel.shipType ?? '').toLowerCase();
  if (!label) return 'unknown';
  if (label.includes('tanker')) return 'tanker';
  if (label.includes('cargo')) return 'cargo';
  if (label.includes('passenger')) return 'passenger';
  if (label.includes('high-speed')) return 'highspeed';
  if (label.includes('fish')) return 'fishing';
  if (label.includes('tug') || label.includes('tow')) return 'tug';
  if (label.includes('sail')) return 'sailing';
  if (label.includes('pleasure')) return 'pleasure';
  if (label.includes('law')) return 'law';
  if (label.includes('military')) return 'military';
  if (label.includes('unknown') || label.includes('type')) return 'unknown';
  return 'other';
}

export function vesselKindLabel(vessel: AisVessel): string {
  const kind = vesselKind(vessel);
  return kind === 'unknown' && vessel.shipType ? vessel.shipType : VESSEL_KIND_LABELS[kind];
}

export function vesselColour(vessel: AisVessel): string {
  return VESSEL_KIND_COLOURS[vesselKind(vessel)];
}

/** Navigational status as broadcast, with a speed-based fallback. */
export function navStatusLabel(status: number | null, sog: number | null = null): string {
  if (status !== null && status !== 15 && NAV_STATUS_LABELS[status]) return NAV_STATUS_LABELS[status];
  if (status === 15) return 'Undefined';
  if (sog === null) return 'Status not reported';
  return sog >= 0.5 ? 'Under way' : 'Stationary';
}

export function vesselMotion(vessel: AisVessel): VesselMotion {
  switch (vessel.navStatus) {
    case 1:
      return 'anchored';
    case 5:
      return 'moored';
    case 2:
    case 3:
    case 4:
      return 'restricted';
    case 6:
      return 'aground';
    case 0:
    case 7:
    case 8:
    case 11:
    case 12:
      return 'underway';
    default:
      break;
  }
  if (vessel.sog === null) return 'unknown';
  return vessel.sog >= 0.5 ? 'underway' : 'stopped';
}

export function vesselStatusColour(vessel: AisVessel): string {
  switch (vesselMotion(vessel)) {
    case 'underway':
      return UNDERWAY_COLOUR;
    case 'anchored':
      return ANCHORED_COLOUR;
    case 'moored':
      return MOORED_COLOUR;
    case 'restricted':
      return RESTRICTED_COLOUR;
    case 'aground':
      return AGROUND_COLOUR;
    case 'stopped':
      return STOPPED_COLOUR;
    default:
      return UNKNOWN_COLOUR;
  }
}

/** The direction the marker points: course over ground, else heading. */
export function vesselCourse(vessel: AisVessel): number {
  if (vessel.cog !== null) return vessel.cog;
  if (vessel.heading !== null) return vessel.heading;
  return 0;
}

export function vesselIsMoving(vessel: AisVessel): boolean {
  const motion = vesselMotion(vessel);
  return motion === 'underway' || motion === 'restricted';
}

/** Icon size grows with hull length, so a ferry does not look like a dinghy. */
export function vesselIconSize(vessel: AisVessel, zoom: number): number {
  const base = zoom >= 15 ? 30 : zoom >= 12 ? 26 : zoom >= 9 ? 22 : 18;
  const length = vessel.length ?? 0;
  if (length >= 150) return base + 6;
  if (length >= 80) return base + 3;
  return base;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Marker silhouette: a hull with a pointed bow when under way, a disc when
 * stopped. The fill is the vessel class, the outline the navigational status.
 */
export function vesselIconSvg(vessel: AisVessel, size: number): string {
  const fill = vesselColour(vessel);
  const stroke = vesselStatusColour(vessel);
  const moving = vesselIsMoving(vessel);
  const hull = moving
    ? '<path d="M16 2.4 L25.4 13.8 L21.6 28.4 L16 25.8 L10.4 28.4 L6.6 13.8 Z" fill="' +
      fill +
      '" stroke="' +
      stroke +
      '" stroke-width="2.1" stroke-linejoin="round"/>' +
      '<path d="M16 8.4 L16 21.4" stroke="rgba(4,20,31,0.45)" stroke-width="1.5" stroke-linecap="round"/>'
    : '<circle cx="16" cy="16" r="8.8" fill="' +
      fill +
      '" stroke="' +
      stroke +
      '" stroke-width="2.2"/>' +
      '<circle cx="16" cy="16" r="2.6" fill="rgba(4,20,31,0.55)"/>';
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false">${hull}</svg>`;
}

/** Small colour key used by the station list and the detail sheet. */
export function vesselSwatchSvg(vessel: AisVessel, size = 14): string {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6" fill="${vesselColour(vessel)}" stroke="${vesselStatusColour(vessel)}" stroke-width="2"/>
  </svg>`;
}

export function speedLabel(vessel: AisVessel): string {
  return vessel.sog === null ? '—' : `${vessel.sog.toFixed(1)} kn`;
}

export function courseLabel(vessel: AisVessel): string {
  return vessel.cog === null ? '—' : `${String(Math.round(vessel.cog)).padStart(3, '0')}°`;
}

export function headingLabel(vessel: AisVessel): string {
  return vessel.heading === null ? '—' : `${String(Math.round(vessel.heading)).padStart(3, '0')}°`;
}

export function dimensionsLabel(vessel: AisVessel): string | null {
  if (vessel.length === null && vessel.beam === null) return null;
  const length = vessel.length === null ? '—' : `${Math.round(vessel.length)} m`;
  const beam = vessel.beam === null ? '—' : `${Math.round(vessel.beam)} m`;
  return `${length} × ${beam}`;
}

export function draughtLabel(vessel: AisVessel): string | null {
  return vessel.draught === null ? null : `${vessel.draught.toFixed(1)} m`;
}

/**
 * Hover card contents: name, class and status, the numbers that matter on
 * passage, then destination and freshness. Every value is escaped because an
 * AIS name is untrusted text arriving from a radio network.
 */
export function vesselTooltipHtml(vessel: AisVessel, now = Date.now()): string {
  const kind = vesselKindLabel(vessel);
  const status = navStatusLabel(vessel.navStatus, vessel.sog);
  const name = escapeHtml(vesselLabel(vessel));
  const swatch = vesselSwatchSvg(vessel, 12);
  const rows: string[] = [];
  rows.push(
    `<div class="vessel-tip-metric"><span>SOG</span><b>${vessel.sog === null ? '—' : vessel.sog.toFixed(1)}<i>kn</i></b></div>`,
  );
  rows.push(
    `<div class="vessel-tip-metric"><span>COG</span><b>${vessel.cog === null ? '—' : `${Math.round(vessel.cog)}<i>°</i>`}</b></div>`,
  );
  if (vessel.destination) {
    rows.push(
      `<div class="vessel-tip-metric wide"><span>Destination</span><b>${escapeHtml(vessel.destination)}</b></div>`,
    );
  }
  const foot = [
    `MMSI ${vessel.mmsi}`,
    vessel.transponder ? `Class ${vessel.transponder}` : null,
    relativeAge(vessel.lastSeen, now),
    vessel.simulated ? 'simulated' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const unnamed = vessel.name ? '' : '<p class="vessel-tip-note">No static report yet</p>';
  const { country, iso2 } = vesselCountry(vessel);
  const flagLine = country
    ? `<p class="vessel-tip-flag">${iso2 ? `<span class="vessel-flagcode">${escapeHtml(iso2)}</span>` : ''}${escapeHtml(country)}</p>`
    : '';
  return `<div class="vessel-tip-card">
    <p class="vessel-tip-head">${swatch}<strong>${name}</strong></p>
    <p class="vessel-tip-kind">${escapeHtml(kind)} · ${escapeHtml(status)}</p>
    ${flagLine}
    <div class="vessel-tip-grid">${rows.join('')}</div>
    ${unnamed}
    <p class="vessel-tip-foot">${escapeHtml(foot)}</p>
  </div>`;
}
