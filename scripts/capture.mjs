#!/usr/bin/env node
/**
 * Screenshot a chart position.
 *
 *   node scripts/capture.mjs <url> <output.png> [waitMs] [--legend]
 *
 * The optional --legend opens the chart menu and expands the symbol key, which
 * is handy when comparing rendered symbols.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [url, output, waitArg] = process.argv.slice(2);
if (!url || !output) {
  console.error('usage: node scripts/capture.mjs <url> <output.png> [waitMs] [--legend]');
  process.exit(1);
}
const waitMs = Number(waitArg) || 9000;
const showLegend = process.argv.includes('--legend');

mkdirSync(dirname(resolve(output)), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.marnav-mark-wrap', { timeout: 30_000 });
await page.waitForTimeout(waitMs);

if (showLegend) {
  await page.locator('.menu-button').click();
  await page.waitForSelector('.menu-panel');
  await page.locator('.legend summary').click();
  await page.waitForTimeout(400);
}

await page.screenshot({ path: resolve(output) });
console.log(`saved ${output}`);
console.log(`markers ${await page.locator('.marnav-mark-wrap').count()}`);
if (errors.length) console.log('console errors:', errors.slice(0, 4).join(' | '));

await browser.close();
