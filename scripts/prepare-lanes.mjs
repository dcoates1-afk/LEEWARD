#!/usr/bin/env node
/**
 * Build src/data/lanes.json from the raw Overpass ferry/TSS snapshots.
 * Geometry is kept as [lat, lon] pairs so the client can draw it with Leaflet
 * without a GeoJSON dependency.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function geometry(element) {
  if (Array.isArray(element.geometry)) {
    return element.geometry
      .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
      .map((point) => [Number(point.lat.toFixed(5)), Number(point.lon.toFixed(5))]);
  }
  return [];
}

function nameOf(element, fallback) {
  const tags = element.tags ?? {};
  return tags.name || tags.ref || tags['seamark:name'] || fallback;
}

const ferries = [];
const seenFerry = new Set();
for (const file of ['ferry-solent.json', 'ferry-ny.json']) {
  const payload = JSON.parse(readFileSync(resolve(root, 'data-raw', file), 'utf8'));
  for (const element of payload.elements ?? []) {
    const path = geometry(element);
    if (path.length < 3) continue;
    const signature = path.map(([lat, lon]) => `${lat},${lon}`).join(';');
    if (seenFerry.has(signature)) continue;
    seenFerry.add(signature);
    ferries.push({ name: nameOf(element, 'Ferry route'), path });
  }
}

const tss = [];
const seenTss = new Set();
for (const file of ['tss.json', 'tss-ny.json']) {
  let payload;
  try {
    payload = JSON.parse(readFileSync(resolve(root, 'data-raw', file), 'utf8'));
  } catch {
    continue;
  }
  for (const element of payload.elements ?? []) {
    const path = geometry(element);
    if (path.length < 2) continue;
    const type = element.tags?.['seamark:type'] ?? 'separation_zone';
    const signature = `${type}:${path.map(([lat, lon]) => `${lat},${lon}`).join(';')}`;
    if (seenTss.has(signature)) continue;
    seenTss.add(signature);
    tss.push({ type, name: nameOf(element, type.replace(/_/g, ' ')), path });
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  attribution: 'Ferry routes and traffic separation schemes derived from OpenStreetMap (ODbL)',
  ferries,
  tss,
};

writeFileSync(resolve(root, 'src/data/lanes.json'), JSON.stringify(output));
console.log(`[lanes] ${ferries.length} ferry routes, ${tss.length} TSS features`);
