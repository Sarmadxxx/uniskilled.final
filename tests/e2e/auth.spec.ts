// Sign-in regressions. The login server is simulated, so these tests never touch real accounts.
//
// Bug fixed 2026-10-22: with "Keep me signed in" unticked, the sign-in page ended the login on the
// server the moment it sent the person to their dashboard, so the next secured action (e.g. accepting
// a booking request) said "Your login has expired" and sent them back to sign in.
import { test, expect, type Page } from '@playwright/test';

const REF = 'orghkbbohnabcietidiv';
const KEY = `sb-${REF}-auth-token`;
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'tutor@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { role: 'tutor' }, app_metadata: {} };
// Obviously fake token, assembled at runtime so the secret scanner never mistakes it for a real key.
const fakeToken = ['test', Buffer.from(JSON.stringify({ sub: user.id })).toString('base64url'), 'not-signed'].join('.');
const session = () => ({ access_token: fakeToken, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh', user });

async function fakeBackend(page: Page) {
  const calls: string[] = [];
  await page.route(/posthog|sentry\.io|api\.github\.com/, (r) => r.abort());
  await page.route(new RegExp(`${REF}\\.supabase\\.co`), async (r) => {
    const path = new URL(r.request().url()).pathname;
    calls.push(r.request().method() + ' ' + path);
    if (path === '/auth/v1/token') return r.fulfill({ json: session() });
    if (path === '/auth/v1/user') return r.fulfill({ json: user });
    if (path === '/auth/v1/logout') return r.fulfill({ status: 204 });
    return r.fulfill({ json: [] });
  });
  // The dashboards themselves aren't under test here.
  await page.route(/\/(tutor|student)-dashboard\.html/, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Dashboard</title><p>dashboard</p>' }));
  return calls;
}

for (const keep of [false, true]) {
  test(`signing in (keep me signed in: ${keep}) never ends the login`, async ({ page }) => {
    const calls = await fakeBackend(page);
    await page.goto('/signin.html');
    await page.fill('#email', 'tutor@example.com');
    await page.fill('#password', 'CorrectHorse-9!');
    if (keep) await page.check('#keepSignedIn'); else await page.uncheck('#keepSignedIn');
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard\.html/);
    await page.waitForTimeout(500);
    expect(calls.filter((c) => c.includes('/auth/v1/logout')), 'sign-in must not call log-out').toEqual([]);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY), 'login stays stored').not.toBeNull();
  });
}

test('not kept signed in: the login is forgotten after the browser is closed', async ({ page, context }) => {
  await fakeBackend(page);
  // State as left by a sign-in without "keep me signed in" ...
  await page.goto('/404.html');
  await page.evaluate(([k, s]) => { localStorage.setItem(k, s); localStorage.setItem('usk_session_only', '1'); }, [KEY, JSON.stringify(session())]);
  // ... while the browser is still open (session cookie present): the login stays.
  await context.addCookies([{ name: 'usk_alive', value: '1', url: 'http://127.0.0.1:4173' }]);
  await page.goto('/signin.html');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).not.toBeNull();
  // Browser closed and reopened = session cookies gone: the stored login is removed.
  await context.clearCookies();
  await page.goto('/signin.html');
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
});
