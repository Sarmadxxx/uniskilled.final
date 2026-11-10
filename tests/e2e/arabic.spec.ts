// UniSkilled — the real Arabic pages (built by scripts/build-locales.mjs) and the language button.
// Database answers are fake; nothing real is read or written.
import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const SITE = join(ROOT, 'test-results', 'built-site');
const AR_LIVE = JSON.parse(readFileSync(join(ROOT, 'locales', 'languages.json'), 'utf8')).languages.find((l: any) => l.code === 'ar').live;
const PAGES = ['index.html', 'about.html', 'find-tutors.html', 'courses.html', 'group-sessions.html', '404.html'];

test.beforeAll(() => {
  if (existsSync(join(SITE, 'ar', 'index.html'))) return;
  rmSync(SITE, { recursive: true, force: true }); mkdirSync(SITE, { recursive: true });
  for (const f of execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT }).toString().split('\n')) {
    if (!f || /^(node_modules|test-results|db|supabase|tests|scripts|locales)\//.test(f)) continue;
    mkdirSync(join(SITE, f, '..'), { recursive: true }); cpSync(join(ROOT, f), join(SITE, f));
  }
  execFileSync('node', ['-e', `import('./scripts/build-locales.mjs').then(m => m.build({ site: ${JSON.stringify(SITE)}, log: () => {} }))`], { cwd: ROOT });
});

async function serveBuilt(page: Page) {
  await page.route(/posthog\.com|sentry\.io/, (r) => r.abort());
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/127\.0\.0\.1:4173\/ar\//, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = join(SITE, path);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.png') ? 'image/png' : path.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: type });
  });
}

for (const p of PAGES) {
  test(`Arabic page works: ${p}`, async ({ page }) => {
    const crashes: string[] = [], missing: string[] = [];
    page.on('pageerror', (e) => crashes.push(e.message));
    page.on('response', (r) => { if (r.url().startsWith('http://127.0.0.1:4173/') && r.status() >= 400 && !r.url().endsWith('/404-test')) missing.push(`${r.status()} ${r.url()}`); });
    await serveBuilt(page);
    await page.goto(`/ar/${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    expect(await page.getAttribute('html', 'lang')).toBe('ar');
    expect(await page.getAttribute('html', 'dir')).toBe('rtl');
    if (AR_LIVE && p === '404.html') expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex'); // error page: never indexed, as in English
    else if (AR_LIVE) await expect(page.locator('meta[name="robots"]')).toHaveCount(0);                   // live: open to search engines
    else expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex'); // hidden until approved
    expect(crashes).toEqual([]);
    expect(missing).toEqual([]);
    // Header is in Arabic and the logo stays on the left
    await expect(page.locator('#site-nav')).toContainText('ابحث عن مدرّس');
    const logo = await page.locator('#site-nav img[src*="uniskilled-logo"]').boundingBox();
    expect(logo!.x + logo!.width / 2).toBeLessThan(page.viewportSize()!.width / 2);
  });
}

test('language button: lists English and Arabic, switches page, remembers the choice', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone sheet is checked separately');
  await serveBuilt(page);
  await page.goto('/ar/find-tutors.html?subject=x');
  const btn = page.locator('.snav-lang-btn');
  await expect(btn).toHaveText(/AR/);
  await btn.click();
  const opts = page.locator('#snavLangPanel .snav-lang-opt');
  await expect(opts).toHaveCount(2);
  await expect(opts.nth(0)).toContainText('English');
  await expect(opts.nth(1)).toHaveAttribute('aria-current', 'true');
  await opts.nth(0).click();
  await page.waitForURL(/\/find-tutors\.html\?subject=x$/);
  expect(page.url()).not.toContain('/ar/');
  expect(await page.evaluate(() => localStorage.getItem('uniskilled_lang'))).toBe('en');
});

test('phone: language sheet opens from the menu', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await serveBuilt(page);
  await page.goto('/ar/index.html');
  await page.click('.snav-burger');
  await page.click('.snav-lang-row');
  const sheet = page.locator('.snav-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.snav-lang-opt')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('English pages: language button only once another language is live', async ({ page, isMobile }) => {
  await page.route(/posthog\.com|sentry\.io/, (r) => r.abort());
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/index.html');
  await expect(page.locator('#site-nav')).toBeVisible();
  // An English-speaking browser never gets the "view in Arabic" suggestion.
  await expect(page.locator('.snav-lang-bar')).toHaveCount(0);
  if (!AR_LIVE) { await expect(page.locator('.snav-lang-btn')).toHaveCount(0); return; }
  if (isMobile) {
    await page.click('.snav-burger');
    await page.click('.snav-lang-row');
    await expect(page.locator('.snav-sheet .snav-lang-opt')).toHaveCount(2);
  } else {
    const btn = page.locator('.snav-lang-btn');
    await expect(btn).toHaveText(/EN/);
    await btn.click();
    await expect(page.locator('#snavLangPanel .snav-lang-opt')).toHaveCount(2);
    await expect(page.locator('#snavLangPanel .snav-lang-opt').nth(1)).toContainText('العربية');
  }
});

test('English pages: an Arabic-speaking browser gets a one-time suggestion', async ({ browser }) => {
  test.skip(!AR_LIVE, 'only once Arabic is live');
  const ctx = await browser.newContext({ locale: 'ar-SA' });
  const page = await ctx.newPage();
  await page.route(/posthog\.com|sentry\.io/, (r) => r.abort());
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/index.html');
  const bar = page.locator('.snav-lang-bar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('a')).toHaveAttribute('href', /ar\//);
  await bar.locator('button').last().click();
  await expect(bar).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.snav-lang-bar')).toHaveCount(0);
  await ctx.close();
});
