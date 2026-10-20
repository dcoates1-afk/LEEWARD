import { describe, expect, it } from 'vitest';
import {
  AIS_GLOBAL_BOX,
  AIS_MAX_SPAN_DEG,
  boxContains,
  boxesChanged,
  boxesContain,
  boundsChanged,
  normalizeBounds,
  padBounds,
  subscriptionBox,
  subscriptionBoxes,
  unionBounds,
} from '../../shared/ais-scope.mjs';

describe('bounds normalisation', () => {
  it('accepts south/west/north/east and rejects inverted or short input', () => {
    expect(normalizeBounds([50.5, -1.9, 51.1, -0.7])).toEqual([50.5, -1.9, 51.1, -0.7]);
    expect(normalizeBounds([51.1, -1.9, 50.5, -0.7])).toBeNull();
    expect(normalizeBounds([50.5, -1.9, 51.1])).toBeNull();
    expect(normalizeBounds(['a', 'b', 'c', 'd'])).toBeNull();
    expect(normalizeBounds([-91, -1, 51, 1])).toBeNull();
  });

  it('pads and clamps to valid latitudes', () => {
    expect(padBounds([50, -1, 51, 0], 0.5)).toEqual([49.5, -1.5, 51.5, 0.5]);
    expect(padBounds([-85.5, -179.9, 85.5, 179.9], 1)).toEqual([-85, -180, 85, 180]);
  });
});

describe('subscription box', () => {
  it('pads a normal chart view and returns AISStream order', () => {
    const box = subscriptionBox([50.6, -1.8, 51.0, -0.8]);
    expect(box).toEqual([
      [50.35, -2.05],
      [51.25, -0.55],
    ]);
    expect(box![0][0]).toBeLessThan(box![1][0]);
    expect(box![0][1]).toBeLessThan(box![1][1]);
  });

  it('clamps a zoomed-out view to the maximum span', () => {
    const box = subscriptionBox([-40, -120, 40, 120])!;
    expect(box[1][0] - box[0][0]).toBeCloseTo(AIS_MAX_SPAN_DEG, 5);
    expect(box[1][1] - box[0][1]).toBeCloseTo(AIS_MAX_SPAN_DEG, 5);
  });

  it('returns null for junk', () => {
    expect(subscriptionBox(null)).toBeNull();
    expect(subscriptionBox([0, 0, 0, 0])).toBeNull();
  });
});

describe('per-chart subscription boxes', () => {
  const solent: [number, number, number, number] = [50.5, -1.9, 51.1, -0.7];
  const newYork: [number, number, number, number] = [40.5, -74.2, 40.9, -73.7];

  it('keeps distant charts as separate subscriptions', () => {
    const boxes = subscriptionBoxes([solent, newYork]);
    expect(boxes).toHaveLength(2);
    expect(boxesContain(boxes, 50.7, -1.2)).toBe(true);
    expect(boxesContain(boxes, 40.7, -74.0)).toBe(true);
    expect(boxesContain(boxes, 45.6, -37.6)).toBe(false);
  });

  it('merges neighbouring views into one box', () => {
    const boxes = subscriptionBoxes([solent, [50.6, -1.8, 51.0, -0.8]]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0][1][1] - boxes[0][0][1]).toBeLessThan(2);
  });

  it('caps the number of subscriptions and returns junk-free arrays', () => {
    const many = [solent, newYork, [35.2, 139.6, 35.8, 140.2], [-33.9, 151.1, -33.7, 151.3], [1.2, 103.7, 1.4, 103.9]];
    expect(subscriptionBoxes(many, { maxBoxes: 2 })).toHaveLength(2);
    expect(subscriptionBoxes([null, [0, 0, 0, 0]])).toEqual([]);
  });

  it('detects a scope change only past the threshold and on count changes', () => {
    const one = subscriptionBoxes([solent]);
    const same = subscriptionBoxes([solent]);
    expect(boxesChanged(one, same, 0.2)).toBe(false);
    expect(boxesChanged(one, subscriptionBoxes([solent, newYork]), 0.2)).toBe(true);
    expect(boxesChanged(one, subscriptionBoxes([newYork]), 0.2)).toBe(true);
  });
});

describe('unions and change detection', () => {
  it('unions several client views', () => {
    expect(
      unionBounds([
        [50.5, -1.9, 51.1, -0.7],
        [40.5, -74.2, 40.9, -73.7],
      ]),
    ).toEqual([40.5, -74.2, 51.1, -0.7]);
    expect(unionBounds([])).toBeNull();
  });

  it('only reports a change past the threshold', () => {
    const solent = subscriptionBox([50.5, -1.9, 51.1, -0.7])!;
    expect(boundsChanged(solent, solent, 0.35)).toBe(false);
    expect(boundsChanged(solent, subscriptionBox([50.51, -1.9, 51.1, -0.7])!, 0.35)).toBe(false);
    expect(boundsChanged(solent, subscriptionBox([40.5, -74.2, 40.9, -73.7])!, 0.35)).toBe(true);
    expect(boundsChanged(null, solent)).toBe(true);
  });

  it('knows what is inside a box and what is global', () => {
    expect(boxContains(AIS_GLOBAL_BOX, 50.7, -1.2)).toBe(true);
    const solent = subscriptionBox([50.5, -1.9, 51.1, -0.7])!;
    expect(boxContains(solent, 50.7, -1.2)).toBe(true);
    expect(boxContains(solent, 40.7, -74.0)).toBe(false);
  });
});
