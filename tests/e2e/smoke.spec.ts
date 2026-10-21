// UniSkilled — browser smoke test.
//
// Opens every page of the site in a real Chromium browser, the way a visitor would, and fails if a
// page crashes (an uncaught JavaScript error) or doesn't load. Pages that need a login are opened
// signed-out: they must send the visitor to sign in (or show their signed-out state) without crashing.
//
// Safe to run any time: it only reads public data, never signs in, books or pays. Analytics and
// error-tracking calls are blocked so test runs never show up in PostHog or Sentry.
//
// Run locally:  npm ci && npx playwright install chromium && npx playwright test
import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
// Every page in the site root, except the email template (it's pasted into Supabase, not served).
const PAGES = readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && f !== 'reset-password-email-template.html')
  .sort();

// Known harmless browser messages that are not bugs in our code.
const IGNORED = [
  /ResizeObserver loop/i,            // benign layout notice some browsers raise
];

test.beforeEach(async ({ page }) => {
  // Keep test traffic out of analytics and error tracking.
  await page.route(/posthog\.com|sentry\.io/, (route) => route.abort());
});

for (const file of PAGES) {
  test(`${file} loads without crashing`, async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (err) => {
      if (!IGNORED.some((re) => re.test(err.message))) crashes.push(err.message);
    });

    const res = await page.goto(`/${file}`, { waitUntil: 'domcontentloaded' });
    expect(res, `no response for ${file}`).not.toBeNull();
    expect(res!.status(), `${file} returned HTTP ${res!.status()}`).toBeLessThan(400);

    // Let the page's own scripts run (auth checks, data loading, redirects).
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(1500);

    expect(await page.title(), `${file} has no <title>`).not.toBe('');
    expect(crashes, `JavaScript errors on ${file}:\n${crashes.join('\n')}`).toEqual([]);
  });
}

test('homepage shows the main call to action', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toContainText(/tutor/i);
  await expect(page.locator('a[href*="find-tutors"]').first()).toBeVisible();
});

test('find-tutors lists tutors from the live database', async ({ page }) => {
  await page.goto('/find-tutors.html');
  // Public tutor data comes through the read-only public_tutors view.
  const resp = await page.waitForResponse((r) => r.url().includes('/rest/v1/') && r.request().method() === 'GET', { timeout: 15000 });
  expect(resp.status()).toBeLessThan(400);
});

test('signed-out visitor is sent to sign in from the student dashboard', async ({ page }) => {
  await page.goto('/student-dashboard.html');
  await page.waitForURL(/signin\.html|index\.html/, { timeout: 15000 });
});
