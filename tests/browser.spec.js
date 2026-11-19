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
