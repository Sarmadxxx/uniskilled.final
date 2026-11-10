// UniSkilled — Arabic (right-to-left) layout check in a real browser, desktop and phone.
//
// Builds mirrored copies of the main pages (English words, Arabic layout) the same way the
// language build makes /ar/ pages, then checks each one:
//   • the page is right-to-left and nothing crashes,
//   • the UniSkilled logo loads and stays on the LEFT (decision 10 Nov 2026),
//   • no file is missing (logo, fonts, scripts, videos),
//   • nothing is wider than the screen.
// It never signs in, books or pays.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'test-results', 'rtl-site');
const PAGES = ['index.html', 'find-tutors.html', 'signin.html', 'onboarding.html', 'about.html', 'book-session.html',
  'courses.html', 'group-sessions.html', 'legal.html', 'feed.html', 'rate-lesson.html', 'tutor-profile.html'];

test.beforeAll(() => {
  if (!existsSync(join(OUT, 'ar', 'index.html'))) {
    execFileSync('node', ['scripts/build-locales.mjs', '--site', '.', '--rtl-preview', PAGES.join(','), '--out', OUT], { cwd: ROOT });
  }
});

test.beforeEach(async ({ page }) => {
  await page.route(/posthog\.com|sentry\.io/, (r) => r.abort());
  // /ar/… is served from the generated copy; everything else from the site root as usual.
  await page.route(/127\.0\.0\.1:4173\/ar\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(OUT, decodeURIComponent(path));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.png') ? 'image/png' : path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: type });
  });
});

for (const file of PAGES) {
  test(`Arabic layout: ${file}`, async ({ page }) => {
    const crashes: string[] = [], missing: string[] = [];
    page.on('pageerror', (e) => { if (!/ResizeObserver loop/i.test(e.message)) crashes.push(e.message); });
    page.on('response', (r) => { if (r.url().startsWith('http://127.0.0.1:4173/') && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });

    await page.goto(`/ar/${file}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    if (!page.url().includes('/ar/')) return;   // page sends signed-out visitors elsewhere: nothing to check here

    expect(await page.getAttribute('html', 'dir')).toBe('rtl');
    expect(crashes, `crashed: ${crashes.join(' | ')}`).toEqual([]);
    expect(missing, `missing files: ${missing.join(' | ')}`).toEqual([]);

    const logo = page.locator('img[src*="uniskilled-logo"]:visible').first();
    if (await logo.count()) {
      const ok = await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
      expect(ok, 'logo image did not load').toBe(true);
      const box = await logo.boundingBox();
      const width = page.viewportSize()!.width;
      // The first logo on the page is the header logo: it must sit on the left half, as in English.
      expect(box!.x + box!.width / 2, 'logo must stay on the left in Arabic').toBeLessThan(width / 2);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(1);
  });
}
