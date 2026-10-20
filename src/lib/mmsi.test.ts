import { describe, expect, it } from 'vitest';
import { MMSI_TYPE_LABELS, midCountry, mmsiIdentity, vesselCountry } from './mmsi';

describe('MMSI MID decoding', () => {
  it('reads the flag of ordinary ship stations from the first three digits', () => {
    const cases: [number, string, string][] = [
      [232036114, 'GB', 'United Kingdom'],
      [316001234, 'CA', 'Canada'],
      [366123456, 'US', 'United States'],
      [227123456, 'FR', 'France'],
      [371123456, 'PA', 'Panama'],
      [636123456, 'LR', 'Liberia'],
      [563123456, 'SG', 'Singapore'],
    ];
    for (const [mmsi, iso2, country] of cases) {
      const identity = mmsiIdentity(mmsi);
      expect(identity.type).toBe('ship');
      expect(identity.iso2).toBe(iso2);
      expect(identity.country).toBe(country);
      expect(identity.valid).toBe(true);
    }
  });

  it('finds the MID inside each special nine-digit format', () => {
    expect(mmsiIdentity(992110001)).toMatchObject({ type: 'aid_to_navigation', iso2: 'DE', valid: true });
    expect(mmsiIdentity(982110001)).toMatchObject({ type: 'craft_associated', iso2: 'DE', valid: true });
    expect(mmsiIdentity(821112345)).toMatchObject({ type: 'handheld_vhf', iso2: 'DE', valid: true });
    expect(mmsiIdentity(111211123)).toMatchObject({ type: 'sar_aircraft', iso2: 'DE', valid: true });
  });

  it('pads short numeric station identities back to nine digits', () => {
    // 002111234 (coast) and 021112345 (group) lose their leading zeros when
    // carried as numbers, so the decoder restores them before reading the MID.
    expect(mmsiIdentity(2111234)).toMatchObject({ type: 'coast_station', iso2: 'DE', valid: true });
    expect(mmsiIdentity(21112345)).toMatchObject({ type: 'group', iso2: 'DE', valid: true });
    expect(mmsiIdentity(211123456)).toMatchObject({ type: 'ship', iso2: 'DE' });
  });

  it('marks emergency beacons valid but without a country', () => {
    for (const mmsi of [970123456, 972123456, 974123456]) {
      const identity = mmsiIdentity(mmsi);
      expect(identity.type).toBe('emergency_device');
      expect(identity.valid).toBe(true);
      expect(identity.mid).toBeNull();
      expect(identity.country).toBeNull();
    }
  });

  it('labels unknown MIDs instead of inventing a flag', () => {
    const unassigned = mmsiIdentity(799123456);
    expect(unassigned.type).toBe('ship');
    expect(unassigned.iso2).toBeNull();
    expect(unassigned.country).toBeNull();
    expect(unassigned.valid).toBe(false);
    expect(midCountry(null).country).toBeNull();
    expect(midCountry(799).country).toBeNull();
  });

  it('rejects values that cannot be an MMSI', () => {
    for (const value of [0, -1, 12.5, 1_000_000_000, Number.NaN]) {
      expect(mmsiIdentity(value).type).toBe('unknown');
    }
  });

  it('exposes a flag code and a label for each station type', () => {
    expect(MMSI_TYPE_LABELS.aid_to_navigation).toBe('Aid to navigation');
    expect(vesselCountry({ mmsi: 316001234 })).toMatchObject({ iso2: 'CA', country: 'Canada' });
  });
});
