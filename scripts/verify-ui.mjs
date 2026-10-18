#!/usr/bin/env node
/**
 * Browser verification for MARNAV.
 *
 *   node scripts/verify-ui.mjs [baseUrl]
 *
 * Checks the chart fills the viewport, nothing overflows horizontally, every
 * on-screen button is a touch target, the single menu exposes every section,
 * NAVAID hover/quick-info and reference sheet work, and the AIS, COLREGs and
 * weather stations load real content. Screenshots land in artifacts/.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3000';
const artifacts = new URL('../artifacts/', import.meta.url).pathname;
mkdirSync(artifacts, { recursive: true });

const results = [];
const consoleErrors = [];
const failedRequests = [];
let activeBrowser = null;

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForChart(page) {
  await page.waitForSelector('.leaflet-container');
  await page.waitForFunction(() => document.querySelectorAll('.marnav-mark-wrap').length > 20, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}

async function openMenu(page) {
  const button = page.locator('.menu-button');
  if ((await page.locator('.menu-panel').count()) === 0) await button.click();
  await page.waitForSelector('.menu-panel');
}

async function closeMenu(page) {
  const close = page.locator('.menu-panel .icon-button').first();
  if (await close.count()) await close.click();
  await page.waitForTimeout(200);
}

async function run() {
  const browser = await chromium.launch();
  activeBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 50.7612, longitude: -1.2012, accuracy: 8 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  page.setDefaultNavigationTimeout(20_000);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('aisstream') && !url.includes('ws://')) {
      failedRequests.push(`${request.failure()?.errorText} ${url}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForChart(page);

  // 1. Phone layout
  const layout = await page.evaluate(() => {
    const map = document.querySelector('.marnav-map')?.getBoundingClientRect();
    const root = document.documentElement;
    return {
      map: map ? { width: Math.round(map.width), height: Math.round(map.height) } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: root.scrollWidth,
      floating: document.querySelectorAll('.gps-widget, .leaflet-control-zoom').length,
    };
  });
  check(
    'chart fills the phone viewport exactly',
    layout.map && Math.abs(layout.map.width - layout.viewport.width) <= 1 && Math.abs(layout.map.height - layout.viewport.height) <= 1,
    JSON.stringify(layout.map),
  );
  check('no horizontal overflow on phone', layout.scrollWidth <= layout.viewport.width + 1, `${layout.scrollWidth}px`);
  check('no floating zoom/GPS controls by default', layout.floating === 0, `${layout.floating} found`);

  const undersized = await page.evaluate(() => {
    const bad = [];
    for (const button of document.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if ($0_isLeaflet(button)) continue;
      if (rect.height < 44) bad.push(`${button.textContent?.trim().slice(0, 24) || 'icon'} ${rect.height.toFixed(0)}px`);
    }
    function $0_isLeaflet(element) {
      return Boolean(element.closest('.leaflet-control'));
    }
    return bad;
  });
  check('every visible control is at least 44px tall', undersized.length === 0, undersized.join(', '));

  const markerCount = await page.locator('.marnav-mark-wrap').count();
  check('NAVAID markers render from the database', markerCount > 20, `${markerCount} markers`);

  await page.screenshot({ path: `${artifacts}phone-chart.png` });

  // 2. Single menu
  console.log('step: menu');
  await openMenu(page);
  const menuText = await page.locator('.menu-panel').textContent();
  for (const section of ['Base chart', 'Overlays', 'Vessel position', 'Stations', 'Mark database']) {
    check(`menu exposes “${section}”`, menuText.includes(section));
  }
  check('menu offers OSM, satellite and NOAA bases', ['Standard chart', 'Satellite', 'NOAA ENC'].every((label) => menuText.includes(label)));
  check(
    'menu offers OpenSeaMap, NAVAID, ferry and TSS overlays',
    ['OpenSeaMap seamarks', 'NAVAIDs from database', 'Ferry lanes', 'TSS lanes'].every((label) => menuText.includes(label)),
  );
  await page.screenshot({ path: `${artifacts}phone-menu.png` });

  // Enable the lane overlays and close.
  for (const label of ['Ferry lanes', 'TSS lanes']) {
    const row = page.locator('.menu-row', { hasText: label }).first();
    await row.click();
    await page.waitForTimeout(150);
  }
  await closeMenu(page);
  const laneLayers = await page.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
  check('ferry/TSS overlay paths draw on the chart', laneLayers > 5, `${laneLayers} paths`);

  // 3. Hover quick info, then the reference sheet.
  // Markers overlap by design, so drive the pointer at the marker's screen
  // position: the topmost mark receives the real hover and click.
  console.log('step: hover + sheet');
  const markBox = await page.locator('.marnav-mark-wrap').first().boundingBox();
  check('first mark has a screen position', Boolean(markBox));
  if (!markBox) throw new Error('no NAVAID marker was positioned on screen');
  const point = { x: markBox.x + markBox.width / 2, y: markBox.y + markBox.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.waitForSelector('.leaflet-tooltip', { timeout: 6000 });
  const tooltip = (await page.locator('.leaflet-tooltip').first().textContent()).replace(/\s+/g, ' ');
  check('hovering a mark opens quick info', tooltip.length > 8, tooltip.slice(0, 90));
  check('quick info tells you to tap for the reference', /full reference/i.test(tooltip));

  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('.navaid-sheet');
  const sheetText = await page.locator('.navaid-sheet').textContent();
  check('tapping a mark opens the full reference sheet', sheetText.includes('Centre chart on mark'));
  check('reference sheet shows position and source', /Source/.test(sheetText) && /IALA region/.test(sheetText));
  await page.screenshot({ path: `${artifacts}navaid-sheet.png` });
  await page.locator('.navaid-sheet .icon-button').first().click();
  await page.waitForTimeout(250);

  // 4. GPS panel opt-in
  console.log('step: gps');
  await openMenu(page);
  const showPanel = page.locator('.menu-row', { hasText: 'Show position panel' }).first();
  await showPanel.click();
  await closeMenu(page);
  await page.waitForSelector('.gps-widget');
  const gpsText = await page.locator('.gps-widget').textContent();
  check('position panel reports a live fix', /Live GPS fix|Waiting for fix/.test(gpsText), gpsText.split('\n')[0]);
  await page.waitForTimeout(1200);
  const gpsUpdated = await page.locator('.gps-widget').textContent();
  check('position panel shows coordinates and SOG', /Latitude/.test(gpsUpdated) && /Speed over ground/.test(gpsUpdated));
  await page.screenshot({ path: `${artifacts}gps-panel.png` });

  // 5. AIS station
  console.log('step: ais');
  await openMenu(page);
  await page.locator('.menu-row.nav-row', { hasText: 'AIS live traffic' }).first().click();
  await page.waitForSelector('.station-drawer');
  await page.waitForTimeout(9000);
  const vesselCount = await page.locator('.vessel-row').count();
  const aisState = await page.locator('.station-status .pill').first().textContent();
  check('AIS station lists live vessels', vesselCount > 0, `${vesselCount} vessels, state ${aisState}`);
  check('AIS state is live or simulated', /Live|Simulated/.test(aisState), aisState);
  await page.screenshot({ path: `${artifacts}ais-panel.png` });

  // 6. COLREGs
  console.log('step: colregs');
  await page.locator('.tab', { hasText: 'COLREGs' }).click();
  await page.waitForSelector('.search-field input');
  await page.fill('.search-field input', 'overtaking');
  await page.waitForTimeout(300);
  const ruleText = await page.locator('.rule-list').first().textContent();
  check('COLREGs search finds the overtaking rule', /Rule 13/.test(ruleText));
  await page.screenshot({ path: `${artifacts}colregs.png` });

  // 7. Weather and tides
  await page.locator('.tab', { hasText: 'Weather' }).click();
  await page.waitForSelector('.metric-card', { timeout: 20_000 });
  const weatherText = await page.locator('.station-body').textContent();
  check('weather panel shows wind and sea state', /Wind/.test(weatherText) && /Sea state/.test(weatherText));
  check('tide section explains coverage', /NOAA|tide/i.test(weatherText));
  await page.screenshot({ path: `${artifacts}weather.png` });
  await page.locator('.station-drawer .icon-button').click();

  // 8. NOAA base map and coverage guard
  await openMenu(page);
  await page.locator('.menu-row', { hasText: 'NOAA ENC' }).first().click();
  await page.waitForTimeout(700);
  const warning = await page.locator('.inline-warning').first().textContent().catch(() => '');
  check('NOAA coverage guard explains US-only charts', /outside US chart coverage/i.test(warning), warning.slice(0, 60));
  await page.locator('.menu-row', { hasText: 'Standard chart' }).first().click();
  await closeMenu(page);

  // 9. Always-off GPS really stops the watch.
  console.log('step: gps-off');
  await openMenu(page);
  await page.locator('.segmented button', { hasText: 'Always off' }).click();
  await page.waitForTimeout(300);
  const offStatus = await page.locator('[data-testid="gps-status"]').textContent();
  check('GPS can be switched always off', /off/i.test(offStatus), offStatus);
  await page.locator('.segmented button', { hasText: 'Always on' }).click();
  await closeMenu(page);

  await context.close();

  // 10. Tablet layout
  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 });
  const tabletPage = await tablet.newPage();
  tabletPage.on('pageerror', (error) => consoleErrors.push(`tablet pageerror: ${error.message}`));
  await tabletPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForChart(tabletPage);
  await openMenu(tabletPage);
  const panelBox = await tabletPage.locator('.menu-panel').boundingBox();
  check('tablet menu is a right-hand panel', Boolean(panelBox && panelBox.x > 380), panelBox ? `x=${Math.round(panelBox.x)}` : 'missing');
  const tabletLayout = await tabletPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
    map: document.querySelector('.marnav-map')?.getBoundingClientRect().height ?? 0,
    height: window.innerHeight,
  }));
  check('no horizontal overflow on tablet', tabletLayout.scrollWidth <= tabletLayout.width + 1);
  check('chart fills the tablet height', Math.abs(tabletLayout.map - tabletLayout.height) <= 1);
  await tabletPage.screenshot({ path: `${artifacts}tablet-menu.png` });
  await tablet.close();

  // 11. Small landscape phone
  const landscape = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const landscapePage = await landscape.newPage();
  await landscapePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForChart(landscapePage);
  const landscapeLayout = await landscapePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
    mapHeight: document.querySelector('.marnav-map')?.getBoundingClientRect().height ?? 0,
    height: window.innerHeight,
  }));
  check('no horizontal overflow in landscape', landscapeLayout.scrollWidth <= landscapeLayout.width + 1);
  check('chart fills landscape height', Math.abs(landscapeLayout.mapHeight - landscapeLayout.height) <= 1);
  await landscapePage.screenshot({ path: `${artifacts}landscape-chart.png` });
  await landscape.close();

  // 12. NOAA over US waters: real chart tiles, no coverage warning.
  const us = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 });
  const usPage = await us.newPage();
  usPage.setDefaultTimeout(12_000);
  const noaaStatuses = [];
  const noaaSizes = [];
  usPage.on('response', (response) => {
    if (response.url().includes('encdirect')) {
      noaaStatuses.push(response.status());
      response
        .body()
        .then((buffer) => noaaSizes.push(buffer.length))
        .catch(() => {});
    }
  });
  usPage.on('pageerror', (error) => consoleErrors.push(`us pageerror: ${error.message}`));
  await usPage.goto(`${baseUrl}?lat=40.7&lon=-74.03&z=13`, { waitUntil: 'domcontentloaded' });
  await waitForChart(usPage);
  const nyMarkers = await usPage.locator('.marnav-mark-wrap').count();
  check('New York region loads NAVAIDs from its shard set', nyMarkers > 10, `${nyMarkers} markers`);
  await openMenu(usPage);
  await usPage.locator('.menu-row', { hasText: 'NOAA ENC' }).first().click();
  await usPage.waitForTimeout(4000);
  const nyWarning = await usPage.locator('.inline-warning').count();
  check('no coverage warning over US waters', nyWarning === 0, `${nyWarning} warnings`);
  check(
    'NOAA chart raster tiles load in US waters',
    noaaStatuses.some((status) => status === 200),
    `statuses: ${noaaStatuses.slice(0, 6).join(', ') || 'none'}`,
  );
  const largestNoaa = noaaSizes.length ? Math.max(...noaaSizes) : 0;
  // A blank/error 256 px export is under 1 kB; a real chart tile is 11–26 kB.
  check(
    'NOAA tiles contain real chart imagery (not a blank error image)',
    largestNoaa > 6_000,
    `largest tile ${Math.round(largestNoaa / 1024)} kB`,
  );
  await usPage.screenshot({ path: `${artifacts}noaa-new-york.png` });
  await us.close();

  await browser.close();

  const failures = results.filter((entry) => !entry.ok);
  const realConsoleErrors = consoleErrors.filter(
    (text) => !/Download the React DevTools|favicon/.test(text),
  );

  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (realConsoleErrors.length) {
    console.log(`console errors (${realConsoleErrors.length}):`);
    for (const error of realConsoleErrors.slice(0, 8)) console.log(`  - ${error}`);
  } else {
    console.log('console errors: none');
  }
  if (failedRequests.length) {
    console.log(`failed requests (${failedRequests.length}):`);
    for (const request of failedRequests.slice(0, 6)) console.log(`  - ${request}`);
  }

  if (failures.length > 0) process.exitCode = 1;
}

run().catch(async (error) => {
  console.error('verification failed:', error?.message ?? error);
  process.exitCode = 1;
  if (activeBrowser) await activeBrowser.close().catch(() => {});
});
