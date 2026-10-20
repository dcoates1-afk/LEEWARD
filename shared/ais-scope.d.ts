export type Bounds = [number, number, number, number];
export type AisBox = [[number, number], [number, number]];

export const AIS_MAX_SPAN_DEG: number;
export const AIS_PAD_DEG: number;
export const AIS_CHANGE_DEG: number;
export const AIS_GLOBAL_BOX: AisBox;

export function normalizeBounds(bounds: unknown): Bounds | null;
export function padBounds(bounds: unknown, pad?: number): Bounds | null;
export function unionBounds(list: unknown[]): Bounds | null;
export function subscriptionBox(bounds: unknown, maxSpan?: number): AisBox | null;
export function subscriptionBoxes(
  list: unknown[],
  options?: { maxSpan?: number; pad?: number; maxBoxes?: number },
): AisBox[];
export function boundsChanged(a: unknown, b: unknown, threshold?: number): boolean;
export function boxesChanged(a: unknown, b: unknown, threshold?: number): boolean;
export function boxesContain(boxes: unknown, lat: number, lon: number): boolean;
export function boxContains(box: unknown, lat: number, lon: number): boolean;
