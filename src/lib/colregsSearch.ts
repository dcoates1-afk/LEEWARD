import { COLREGS } from '../data/colregs';
import type { ColregRule } from '../data/colregs';

export const ALL_PARTS = 'All parts';

export function partNames(rules: ColregRule[] = COLREGS): string[] {
  return [ALL_PARTS, ...Array.from(new Set(rules.map((rule) => rule.part)))];
}

/**
 * Case-insensitive search across rule number, title, summary and tags, with an
 * optional part filter. Empty query returns the filtered part in rule order.
 */
export function searchColregs(
  query: string,
  part: string = ALL_PARTS,
  rules: ColregRule[] = COLREGS,
): ColregRule[] {
  const term = query.trim().toLowerCase();
  return rules.filter((rule) => {
    if (part !== ALL_PARTS && rule.part !== part) return false;
    if (!term) return true;
    const haystack = [rule.rule, rule.title, rule.summary, rule.tags.join(' ')]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}
