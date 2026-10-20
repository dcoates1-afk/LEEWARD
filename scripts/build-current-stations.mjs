#!/usr/bin/env node
/**
 * Build the bundled index of NOAA current-prediction stations.
 *
 * The CO-OPS metadata service returns ~4 MB of station records, far too much to
 * fetch while a skipper waits for a readout. Only the identity and position of
 * each station is needed to find the nearest one, so this script reduces the
 * list to [id, name, lat, lon] tuples and writes it to src/data, where the app
 * loads it as a lazy chunk.
 *
 * Run after NOAA adds stations: npm run currents:build
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions&units=metric';
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'currentStations.json',
);

const round = (value) => Number(Number(value).toFixed(4));

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`NOAA metadata returned HTTP ${response.status}`);
const payload = await response.json();
const records = Array.isArray(payload.stations) ? payload.stations : [];

const byId = new Map();
for (const station of records) {
  const id = typeof station.id === 'string' ? station.id.trim() : '';
  const lat = Number(station.lat);
  const lon = Number(station.lng);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (byId.has(id)) continue;
  byId.set(id, [id, String(station.name ?? '').trim().slice(0, 60), round(lat), round(lon)]);
}

const stations = [...byId.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(stations)}\n`);

console.log(
  `${stations.length} current stations from ${records.length} records -> ${path.relative(process.cwd(), OUT)}`,
);
