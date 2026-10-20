import { describe, expect, it } from 'vitest';
import { ALL_PARTS, partNames, searchColregs } from './colregsSearch';
import { COLREGS, REGIONAL_NOTES } from '../data/colregs';

describe('COLREGs reference', () => {
  it('ships the full international rule set plus regional notes', () => {
    expect(COLREGS.length).toBeGreaterThanOrEqual(30);
    expect(REGIONAL_NOTES.map((note) => note.id).sort()).toEqual(['canada', 'europe', 'us']);
    const rules = COLREGS.map((rule) => rule.rule);
    expect(rules).toContain('Rule 5');
    expect(rules).toContain('Rule 13');
    expect(rules).toContain('Rule 19');
  });

  it('finds rules by keyword, rule number and tag', () => {
    expect(searchColregs('overtaking').map((rule) => rule.rule)).toContain('Rule 13');
    expect(searchColregs('Rule 10').map((rule) => rule.title)).toContain('Traffic separation schemes');
    expect(searchColregs('fog').length).toBeGreaterThan(0);
    expect(searchColregs('restricted visibility').length).toBeGreaterThan(0);
  });

  it('filters by part and returns everything for an empty query', () => {
    const parts = partNames();
    expect(parts[0]).toBe(ALL_PARTS);
    expect(parts.length).toBeGreaterThan(3);
    const lights = searchColregs('', 'Part C — Lights and Shapes');
    expect(lights.length).toBeGreaterThan(4);
    expect(lights.every((rule) => rule.part === 'Part C — Lights and Shapes')).toBe(true);
    expect(searchColregs('', ALL_PARTS)).toHaveLength(COLREGS.length);
  });

  it('returns nothing for a miss', () => {
    expect(searchColregs('zeppelin')).toHaveLength(0);
  });
});
