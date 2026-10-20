/**
 * AIS subscription scope.
 *
 * The relay shares one AISStream upstream across clients, so the subscription
 * is the union of what each client is looking at, padded a little and clamped
 * so a zoomed-out chart cannot ask for the whole planet.
 *
 * Declarations live in ais-scope.d.ts.
 */

export const AIS_MAX_SPAN_DEG = 12;
export const AIS_PAD_DEG = 0.25;
export const AIS_CHANGE_DEG = 0.35;
export const AIS_GLOBAL_BOX = [
  [-85, -180],
  [85, 180],
];

/** Accept [south, west, north, east] and return a clean copy, or null. */
export function normalizeBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return null;
  const values = bounds.map(Number);
  if (!values.every((value) => Number.isFinite(value))) return null;
  const [south, west, north, east] = values;
  if (south >= north || west >= east) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180) return null;
  return [south, west, north, east];
}

export function padBounds(bounds, pad = AIS_PAD_DEG) {
  const clean = normalizeBounds(bounds);
  if (!clean) return null;
  const [south, west, north, east] = clean;
  return [
    Math.max(-85, south - pad),
    Math.max(-180, west - pad),
    Math.min(85, north + pad),
    Math.min(180, east + pad),
  ];
}

export function unionBounds(list) {
  const valid = (list ?? []).map(normalizeBounds).filter(Boolean);
  if (valid.length === 0) return null;
  return [
    Math.min(...valid.map((b) => b[0])),
    Math.min(...valid.map((b) => b[1])),
    Math.max(...valid.map((b) => b[2])),
    Math.max(...valid.map((b) => b[3])),
  ];
}

/**
 * Turn a chart view into the AISStream BoundingBoxes payload:
 * [[south, west], [north, east]].
 */
export function subscriptionBox(bounds, maxSpan = AIS_MAX_SPAN_DEG) {
  const padded = padBounds(bounds, AIS_PAD_DEG);
  if (!padded) return null;
  let [south, west, north, east] = padded;

  if (north - south > maxSpan) {
    const centre = (south + north) / 2;
    south = centre - maxSpan / 2;
    north = centre + maxSpan / 2;
  }
  if (east - west > maxSpan) {
    const centre = (west + east) / 2;
    west = centre - maxSpan / 2;
    east = centre + maxSpan / 2;
  }

  const round = (value) => Number(value.toFixed(4));
  return [
    [round(Math.max(-85, south)), round(Math.max(-180, west))],
    [round(Math.min(85, north)), round(Math.min(180, east))],
  ];
}

function flatten(box) {
  if (!Array.isArray(box)) return null;
  if (Array.isArray(box[0])) return [box[0][0], box[0][1], box[1][0], box[1][1]];
  return box;
}

/**
 * One subscription box per distinct area on screen. Two clients in the Solent
 * and New York must not be merged into a single box over the Atlantic, which
 * is what a naive union does once the span is clamped.
 */
export function subscriptionBoxes(
  list,
  { maxSpan = AIS_MAX_SPAN_DEG, pad = AIS_PAD_DEG, maxBoxes = 4 } = {},
) {
  const boxes = (list ?? [])
    .map((bounds) => subscriptionBox(bounds, maxSpan))
    .filter(Boolean)
    .map((box) => box.map((pair) => [...pair]));

  const merged = [];
  for (const box of boxes) {
    const near = merged.find((existing) => overlaps(existing, box, pad));
    if (!near) {
      merged.push(box);
      continue;
    }
    near[0][0] = Math.min(near[0][0], box[0][0]);
    near[0][1] = Math.min(near[0][1], box[0][1]);
    near[1][0] = Math.max(near[1][0], box[1][0]);
    near[1][1] = Math.max(near[1][1], box[1][1]);
  }

  // AISStream accepts several boxes; keep the most recently added areas.
  return merged.slice(-maxBoxes);
}

function overlaps(a, b, slack = 0) {
  return (
    a[0][0] <= b[1][0] + slack &&
    b[0][0] <= a[1][0] + slack &&
    a[0][1] <= b[1][1] + slack &&
    b[0][1] <= a[1][1] + slack
  );
}

/** True when any edge of any box has moved more than the threshold. */
export function boundsChanged(a, b, threshold = AIS_CHANGE_DEG) {
  const first = flatten(a);
  const second = flatten(b);
  if (!first || !second) return true;
  return first.some((value, index) => Math.abs(value - second[index]) > threshold);
}

export function boxesChanged(a, b, threshold = AIS_CHANGE_DEG) {
  const first = (a ?? []).map(flatten);
  const second = (b ?? []).map(flatten);
  if (first.length !== second.length) return true;
  return first.some((box, index) =>
    box.some((value, edge) => Math.abs(value - second[index][edge]) > threshold),
  );
}

/** True when the point sits inside at least one subscribed box. */
export function boxesContain(boxes, lat, lon) {
  return (boxes ?? []).some((box) => boxContains(box, lat, lon));
}

export function boxContains(box, lat, lon) {
  const flat = flatten(box);
  if (!flat) return false;
  const [south, west, north, east] = flat;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}
