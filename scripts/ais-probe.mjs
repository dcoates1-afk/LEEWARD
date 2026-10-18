#!/usr/bin/env node
/**
 * Probe AISStream with the server-side key.
 *
 *   set -a; . ./.env.local; set +a; node scripts/ais-probe.mjs [seconds] [lat1 lon1 lat2 lon2]
 *
 * Prints connect state, message counts and the first position report. Used to
 * confirm the relay's upstream is reachable before blaming the /ws/ais proxy.
 */
import { WebSocket } from 'ws';

const seconds = Number(process.argv[2] ?? 20);
const box = process.argv.length >= 7
  ? [[Number(process.argv[3]), Number(process.argv[4])], [Number(process.argv[5]), Number(process.argv[6])]]
  : [[49.5, -6.0], [52.2, 2.5]];

const key = process.env.AISSTREAM_API_KEY;
if (!key) {
  console.error('AISSTREAM_API_KEY is not set');
  process.exit(1);
}

let positions = 0;
let statics = 0;
const names = new Set();
const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      APIKey: key,
      BoundingBoxes: [box],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }),
  );
  console.log('connected');
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.MessageType === 'PositionReport') {
    positions += 1;
    if (positions === 1) {
      const report = msg.Message?.PositionReport;
      console.log('first position:', report?.Latitude, report?.Longitude, 'mmsi', report?.UserID);
    }
  } else {
    statics += 1;
    const name = msg.Message?.ShipStaticData?.Name;
    if (name) names.add(name.trim());
  }
});

ws.on('close', (code) => console.log('closed', code));
ws.on('error', (error) => console.log('error', error.message));

setTimeout(() => {
  console.log(`positions ${positions} statics ${statics} named ${names.size}`);
  ws.close();
  process.exit(0);
}, seconds * 1000);
