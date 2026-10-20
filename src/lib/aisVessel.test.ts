import { describe, expect, it } from 'vitest';
import type { AisVessel } from './ais';
import {
  VESSEL_KIND_COLOURS,
  courseLabel,
  dimensionsLabel,
  navStatusLabel,
  speedLabel,
  vesselIconSize,
  vesselIconSvg,
  vesselIsMoving,
  vesselKind,
  vesselMotion,
  vesselStatusColour,
  vesselTooltipHtml,
} from './aisVessel';

function vessel(overrides: Partial<AisVessel> = {}): AisVessel {
  return {
    mmsi: 232001234,
    name: 'RED JET 6',
    lat: 50.795,
    lon: -1.29,
    sog: 21.4,
    cog: 205,
    heading: 203,
    shipType: 'Passenger',
    typeCode: 60,
    destination: 'PORTSMOUTH',
    navStatus: 0,
    callSign: 'MABC1',
    imo: 9_123_456,
    draught: 2.4,
    length: 40,
    beam: 10,
    eta: '14 Jun 22:00 UTC',
    transponder: 'A',
    lastSeen: Date.now() - 45_000,
    staticAt: Date.now() - 600_000,
    simulated: false,
    ...overrides,
  };
}

describe('AIS vessel presentation', () => {
  it('classifies by AIS type code', () => {
    const cases: [number, ReturnType<typeof vesselKind>][] = [
      [70, 'cargo'],
      [80, 'tanker'],
      [60, 'passenger'],
      [40, 'highspeed'],
      [30, 'fishing'],
      [52, 'tug'],
      [36, 'sailing'],
      [37, 'pleasure'],
      [55, 'law'],
      [35, 'military'],
      [90, 'other'],
    ];
    for (const [code, kind] of cases) {
      expect(vesselKind(vessel({ typeCode: code, shipType: null }))).toBe(kind);
    }
  });

  it('falls back to the reported label when no type code arrived', () => {
    expect(vesselKind(vessel({ typeCode: null, shipType: 'Cargo' }))).toBe('cargo');
    expect(vesselKind(vessel({ typeCode: null, shipType: 'Towing (large)' }))).toBe('tug');
    expect(vesselKind(vessel({ typeCode: null, shipType: null }))).toBe('unknown');
  });

  it('gives the main classes distinct colours', () => {
    const colours = ['cargo', 'tanker', 'passenger', 'fishing', 'sailing'] as const;
    const used = colours.map((kind) => VESSEL_KIND_COLOURS[kind]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('names the navigational status, falling back to speed', () => {
    expect(navStatusLabel(0)).toBe('Under way using engine');
    expect(navStatusLabel(1)).toBe('At anchor');
    expect(navStatusLabel(5)).toBe('Moored');
    expect(navStatusLabel(15)).toBe('Undefined');
    expect(navStatusLabel(null, 8)).toBe('Under way');
    expect(navStatusLabel(null, 0)).toBe('Stationary');
    expect(navStatusLabel(null, null)).toBe('Status not reported');
  });

  it('separates moored, anchored and under-way motion', () => {
    expect(vesselMotion(vessel({ navStatus: 1 }))).toBe('anchored');
    expect(vesselMotion(vessel({ navStatus: 5 }))).toBe('moored');
    expect(vesselMotion(vessel({ navStatus: 2 }))).toBe('restricted');
    expect(vesselMotion(vessel({ navStatus: null, sog: 0 }))).toBe('stopped');
    expect(vesselMotion(vessel({ navStatus: 0 }))).toBe('underway');
    expect(vesselIsMoving(vessel({ navStatus: 5, sog: 0 }))).toBe(false);
    expect(vesselIsMoving(vessel({ navStatus: 0 }))).toBe(true);
  });

  it('draws a turning hull when moving and a disc when stopped', () => {
    const moving = vesselIconSvg(vessel({ typeCode: 70, navStatus: 0 }), 26);
    expect(moving).toContain('width="26"');
    expect(moving).toContain(VESSEL_KIND_COLOURS.cargo);
    expect(moving).toContain(vesselStatusColour(vessel({ navStatus: 0 })));
    expect(moving).toContain('<path d="M16 2.4');

    const stopped = vesselIconSvg(vessel({ navStatus: 5 }), 26);
    expect(stopped).toContain('<circle cx="16" cy="16" r="8.8"');
    expect(stopped).not.toContain('<path d="M16 2.4');
  });

  it('scales the marker with zoom and hull length', () => {
    const small = vesselIconSize(vessel({ length: 12 }), 16);
    const large = vesselIconSize(vessel({ length: 200 }), 16);
    const zoomedOut = vesselIconSize(vessel({ length: 200 }), 8);
    expect(large).toBeGreaterThan(small);
    expect(zoomedOut).toBeLessThan(large);
  });

  it('builds a hover card with identity, status and numbers', () => {
    const html = vesselTooltipHtml(vessel(), Date.now());
    expect(html).toContain('RED JET 6');
    expect(html).toContain('Passenger');
    expect(html).toContain('Under way using engine');
    expect(html).toContain('21.4');
    expect(html).toContain('205');
    expect(html).toContain('PORTSMOUTH');
    expect(html).toContain('MMSI 232001234');
    expect(html).toContain('Class A');
  });

  it('escapes AIS text and explains a missing name', () => {
    const html = vesselTooltipHtml(
      vessel({ name: '<img src=x onerror=alert(1)>', destination: 'A & B' }),
      Date.now(),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('A &amp; B');

    const unnamed = vesselTooltipHtml(vessel({ name: null }), Date.now());
    expect(unnamed).toContain('MMSI 232001234');
    expect(unnamed).toContain('No static report yet');
  });

  it('formats speed, course and dimensions', () => {
    expect(speedLabel(vessel({ sog: 0.04 }))).toBe('0.0 kn');
    expect(speedLabel(vessel({ sog: null }))).toBe('—');
    expect(courseLabel(vessel({ cog: 7.4 }))).toBe('007°');
    expect(courseLabel(vessel({ cog: null }))).toBe('—');
    expect(dimensionsLabel(vessel({ length: 112.4, beam: 18.2 }))).toBe('112 m × 18 m');
    expect(dimensionsLabel(vessel({ length: null, beam: null }))).toBeNull();
  });
});
