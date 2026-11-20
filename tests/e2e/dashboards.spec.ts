// Signed-in dashboard regressions. The database and login are simulated with fake answers,
// so these tests never touch real accounts or data.
//
// Bugs fixed 2026-11-20 (audit of 19 Nov):
//  1. Since the shared navy header (26 Oct) the notification bell never appeared: notifications.js
//     looked for a <nav> that the new header doesn't have.
//  2. On phones both dashboards rendered wider than the screen (filter chips widened the grid),
//     cutting off buttons on the right.
//  3. On phones a tutor's tab (Notifications, Requests, …) opened ~1,100 px down, under the menu,
//     so the tap looked like it did nothing.
import { test, expect, type Page } from '@playwright/test';

const REF = 'orghkbbohnabcietidiv';
const KEY = `sb-${REF}-auth-token`;
const UID = '00000000-0000-4000-8000-000000000002';
// Obviously fake token, assembled at runtime so the secret scanner never mistakes it for a real key.
const fakeToken = ['test', Buffer.from(JSON.stringify({ sub: UID })).toString('base64url'), 'not-signed'].join('.');

function user(role: 'student' | 'tutor') {
  return { id: UID, email: `${role}@example.com`, aud: 'authenticated', role: 'authenticated', user_metadata: { role, full_name: `Test ${role}` }, app_metadata: {} };
}

const notifications = [1, 2, 3].map((i) => ({
  id: `n${i}`, user_id: UID, type: i === 1 ? 'new_message' : 'booking_request',
  title: `Test notification ${i}`, body: 'Body', read: false, link: '',
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
}));

async function signIn(page: Page, role: 'student' | 'tutor') {
  const u = user(role);
  const session = { access_token: fakeToken, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh', user: u };
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }, [KEY, JSON.stringify(session)]);
  await page.route(/posthog|sentry\.io|api\.github\.com/, (r) => r.abort());
  await page.route(/supabase\.co\//, (r) => {
    const url = new URL(r.request().url());
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: u });
    if (url.pathname.startsWith('/auth/v1/token')) return r.fulfill({ json: session });
    if (r.request().method() === 'HEAD') return r.fulfill({ status: 200, headers: { 'content-range': '*/0' } });
    if (url.pathname.startsWith('/rest/v1/notifications') && r.request().method() === 'GET') return r.fulfill({ json: notifications });
    if (url.pathname.startsWith('/rest/v1/users')) {
      const row = { id: UID, full_name: u.user_metadata.full_name, role, roles: [role] };
      return r.fulfill({ json: single ? row : [row] });
    }
    return r.fulfill({ json: single ? null : [] });
  });
}

async function pageWidth(page: Page) {
  return page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth, screen: window.screen.width }));
}

for (const role of ['student', 'tutor'] as const) {
  const file = `${role}-dashboard.html`;

  test(`${role} dashboard: notification bell is in the header and opens/closes`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(file);
    const bell = page.locator('#site-nav #uskBell');
    await expect(bell).toBeVisible();
    await expect(bell.locator('.usk-count')).toHaveText('3');
    await bell.click();
    await expect(page.locator('#uskPanel')).toBeVisible();
    await expect(page.locator('#uskPanel .usk-item')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#uskPanel')).toBeHidden();
    await bell.click();
    await expect(page.locator('#uskPanel')).toBeVisible();
    await page.mouse.click(5, 300); // outside the panel
    await expect(page.locator('#uskPanel')).toBeHidden();
  });

  test(`${role} dashboard: page is never wider than the screen`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(role === 'tutor' ? `${file}?tab=notifications` : file);
    await expect(page.locator('#uskBell')).toBeVisible();
    const w = await pageWidth(page);
    expect(w.vw, 'layout viewport widened by content').toBeLessThanOrEqual(w.screen);
    expect(w.doc, 'horizontal scrolling').toBeLessThanOrEqual(w.vw);
  });

  test(`${role} dashboard: Messages link opens the inbox`, async ({ page }) => {
    await signIn(page, role);
    await page.goto(file);
    await page.locator('.sidebar-nav a.nav-item[href="messages.html"]').first().click();
    await expect(page).toHaveURL(/messages\.html/);
  });
}

test('tutor dashboard: a tab opens in view, even on phones', async ({ page }) => {
  await signIn(page, 'tutor');
  for (const tab of ['notifications', 'requests', 'sessions', 'reviews']) {
    await page.goto(`tutor-dashboard.html?tab=${tab}`);
    const section = page.locator(`#page-${tab}`);
    await expect(section).toBeVisible();
    await expect(section).toBeInViewport();
  }
});

test('tutor dashboard: an unknown tab falls back to the overview', async ({ page }) => {
  await signIn(page, 'tutor');
  await page.goto('tutor-dashboard.html?tab=nope');
  await expect(page.locator('#page-overview')).toBeVisible();
});

test('student dashboard: sidebar Notifications scrolls to the notifications card', async ({ page }) => {
  await signIn(page, 'student');
  await page.goto('student-dashboard.html');
  await expect(page.locator('#uskBell')).toBeVisible();
  await page.locator('.sidebar-nav a.nav-item[href="#notifsCard"]').click();
  await expect(page.locator('#notifsCard')).toBeInViewport();
});
