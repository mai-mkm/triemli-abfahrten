import { test, expect } from '@playwright/test';

test('starts without a Google Maps API key and loads departures', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.route('https://transport.opendata.ch/v1/stationboard**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      stationboard: [{
        number: '14', category: 'T', to: 'Seebach',
        stop: { departure: new Date(Date.now() + 10 * 60_000).toISOString() }
      }]
    }) })
  );
  await page.route('https://transport.opendata.ch/v1/locations**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"stations":[]}' })
  );
  await page.goto('/');
  await expect(page.locator('#status')).not.toContainText('JavaScript wird gestartet', { timeout: 10000 });
  await expect(page.locator('#board')).toContainText('Seebach', { timeout: 10000 });
  expect(errors).toEqual([]);
  await page.locator('#manualMode').click();
  await expect(page.locator('#manualMode')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#gpsMode').click();
  await expect(page.locator('#gpsMode')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});


test('restores the manual tab selection and search text after reload without leaking into GPS', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('tab-test-seeded')) return;
    sessionStorage.setItem('tab-test-seeded', '1');
    localStorage.clear();
    localStorage.setItem('fahrplan-state-v2', JSON.stringify({
      gps: { selected: { id: '8503610', name: 'Zürich, Triemli' }, stops: [], index: 0 },
      manual: { selected: { id: '8503000', name: 'Zürich HB' }, stops: [], index: 0, manualLocation: 'Zürich HB' }
    }));
  });
  await page.route('https://transport.opendata.ch/v1/stationboard**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"stationboard":[]}' })
  );
  await page.route('https://transport.opendata.ch/v1/locations**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"stations":[]}' })
  );
  await page.goto('/');
  await expect(page.locator('#status')).not.toContainText('JavaScript wird gestartet');
  await page.locator('#manualMode').click();
  await expect(page.locator('#stopSearch')).toHaveValue('Zürich HB');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fahrplan-state-v2')).manual.selected.name)).toBe('Zürich HB');
  await page.locator('#gpsMode').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fahrplan-state-v2')).gps.selected.name)).toBe('Zürich, Triemli');
  await page.reload();
  await page.locator('#manualMode').click();
  await expect(page.locator('#stopSearch')).toHaveValue('Zürich HB');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fahrplan-state-v2')).manual.selected.name)).toBe('Zürich HB');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fahrplan-state-v2')).gps.selected.name)).toBe('Zürich, Triemli');
  expect(errors).toEqual([]);
});


test('Google Maps settings remain reachable on a small iPhone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.route('https://transport.opendata.ch/v1/stationboard**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"stationboard":[]}' })
  );
  await page.route('https://transport.opendata.ch/v1/locations**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"stations":[]}' })
  );
  await page.goto('/');
  // The mocked API returns no nearby stations, so the app hides #nearby.
  // Reveal the containing section to test the map panel's mobile layout in isolation.
  await page.locator('#nearby').evaluate(el => { el.hidden = false; });
  await page.locator('#mapAccordion').evaluate(el => {
    el.open = true;
    el.classList.add('map-expanded');
  });
  await page.locator('#mapSettings').evaluate(el => { el.open = true; });
  const result = await page.locator('#mapAccordion').evaluate(el => {
    const button = el.querySelector('#saveMap');
    el.scrollTop = el.scrollHeight;
    const container = el.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    return {
      scrollable: el.scrollHeight > el.clientHeight,
      buttonVisible: target.top >= container.top - 2 && target.bottom <= container.bottom + 2,
      buttonHeight: target.height,
      buttonDisplay: getComputedStyle(button).display
    };
  });
  // Scrolling is only necessary when the complete settings panel does not already fit.
  expect(result.scrollable || result.buttonVisible).toBe(true);
  expect(result.buttonVisible).toBe(true);
  expect(result.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(result.buttonDisplay).not.toBe('none');
});


test('keeps a manually chosen GPS station after switching tabs and refreshing GPS', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    let watchId = 0;
    Object.defineProperty(navigator.geolocation, 'watchPosition', {
      configurable: true,
      value: callback => {
        const id = ++watchId;
        setTimeout(() => {
          if (id === watchId) callback({ coords: { latitude: 47.36, longitude: 8.50, accuracy: 5 } });
        }, 0);
        return id;
      }
    });
    Object.defineProperty(navigator.geolocation, 'clearWatch', {
      configurable: true, value: () => { watchId++; }
    });
  });
  const stations = Array.from({ length: 10 }, (_, i) => ({
    id: String(8503610 + i), name: 'GPS Test ' + i,
    coordinate: { x: 47.36 + i * 0.001, y: 8.50 }
  }));
  await page.route('https://transport.opendata.ch/v1/stationboard**', route =>
    route.fulfill({ json: { stationboard: [] } }));
  let gpsRequests = 0;
  await page.route('https://transport.opendata.ch/v1/locations**', route => {
    if (new URL(route.request().url()).searchParams.has('x')) gpsRequests++;
    return route.fulfill({ json: { stations } });
  });
  await page.route('https://data.sbb.ch/**', route =>
    route.fulfill({ json: [{ designationofficial: 'Manual Test', number: 8503000, stoppoint: true }] }));
  await page.goto('/');
  await expect(page.locator('#nearbyList')).toContainText('GPS Test 0');
  await page.locator('#nextNearby').click();
  await expect(page.locator('#nearbyList')).toContainText('GPS Test 1');
  const before = gpsRequests;
  await page.locator('#manualMode').click();
  await page.locator('#gpsMode').click();
  await expect.poll(() => gpsRequests).toBeGreaterThan(before);
  await expect(page.locator('#nearbyList')).toContainText('GPS Test 1');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('fahrplan-state-v2')).gps.selected.id
  )).toBe('8503611');
  // Wait for the refreshed GPS request to be processed, not just issued.
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#nearbyList')).toContainText('GPS Test 1');
});
