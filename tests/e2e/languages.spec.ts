// UniSkilled — languages people speak / teach in (not the website language), in a real browser.
// The database is replaced by fake answers, so this never reads or writes real data.
import { test, expect, Page } from '@playwright/test';

const TUTORS = [
  { id: 't1', user_id: 'u1', subjects: ['Linear Algebra'], hourly_rate: 25, currency: 'EUR', location: 'TU Berlin', availability: ['mon'], preferred_times: [] },
  { id: 't2', user_id: 'u2', subjects: ['Organic Chemistry'], hourly_rate: 20, currency: 'EUR', location: 'University of Jordan', availability: ['tue'], preferred_times: [] },
  { id: 't3', user_id: 'u3', subjects: ['Microeconomics'], hourly_rate: 22, currency: 'USD', location: 'Boğaziçi University', availability: ['wed'], preferred_times: [] },
];
const NAMES = [{ id: 'u1', full_name: 'Lena K' }, { id: 'u2', full_name: 'Omar H' }, { id: 'u3', full_name: 'Elif Y' }];
const LANGS = [
  { user_id: 'u1', lang: 'en', level: 'fluent', position: 0 }, { user_id: 'u1', lang: 'de', level: 'native', position: 1 },
  { user_id: 'u2', lang: 'ar', level: 'native', position: 0 }, { user_id: 'u2', lang: 'en', level: 'fluent', position: 1 },
  { user_id: 'u3', lang: 'tr', level: 'native', position: 0 },
];

async function fakeDatabase(page: Page) {
  await page.route(/posthog\.com|sentry\.io/, (r) => r.abort());
  await page.route(/supabase\.co\/(rest|functions|auth)\//, (route) => {
    const url = route.request().url();
    const body = /\/rest\/v1\/tutor_profiles/.test(url) ? TUTORS
      : /\/rest\/v1\/public_tutors/.test(url) ? NAMES
      : /\/rest\/v1\/user_languages/.test(url) ? LANGS : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('Find a Tutor: "Teaches in" filter and card line', async ({ page }) => {
  await fakeDatabase(page);
  await page.goto('/find-tutors.html');
  const filter = page.locator('#filterLang');
  await expect(filter).toBeVisible();
  await expect(filter.locator('option')).toHaveText(['Any language', 'Teaches in Arabic', 'Teaches in English', 'Teaches in German', 'Teaches in Turkish']);
  await expect(page.locator('article.card')).toHaveCount(3);
  await expect(page.locator('article.card', { hasText: 'Omar H' })).toContainText('Teaches in: Arabic, English');
  await filter.selectOption('ar');
  await expect(page.locator('article.card')).toHaveCount(1);
  await expect(page.locator('article.card')).toContainText('Omar H');
  await filter.selectOption('en');
  await expect(page.locator('article.card')).toHaveCount(2);
  await filter.selectOption('');
  await expect(page.locator('article.card')).toHaveCount(3);
});

test('Sign-up: languages come from a fixed list with levels, label follows the role', async ({ page }) => {
  await fakeDatabase(page);
  await page.goto('/onboarding.html');
  await page.locator('.role-card[data-role="tutor"]').first().click();
  await expect(page.locator('#langLabel')).toHaveText('Languages you teach in *');
  await page.goto('/onboarding.html');
  await page.locator('.role-card[data-role="student"]').first().click();
  await expect(page.locator('#langLabel')).toHaveText('Languages you speak *');
  const picker = page.locator('#langPicker');
  await picker.locator('select.ulp-add').selectOption('ar');
  await picker.locator('select.ulp-add').selectOption('en');
  await expect(picker.locator('.ulp-row b')).toHaveText(['Arabic', 'English']);
  await expect(picker.locator('.ulp-row select').first()).toHaveValue('native');
  await expect(picker.locator('.ulp-row select').nth(1)).toHaveValue('fluent');
  await picker.getByRole('button', { name: 'Remove Arabic' }).click();
  await expect(picker.locator('.ulp-row b')).toHaveText(['English']);
  // Continuing without any language is refused with a clear message
  await picker.getByRole('button', { name: 'Remove English' }).click();
  for (const [id, v] of [['firstName', 'Sara'], ['lastName', 'Test'], ['country', 'Germany'], ['university', 'TU Berlin'], ['degree', 'CS']]) await page.fill('#' + id, v);
  await page.click('#nextBtn2');
  await expect(page.getByText('Please add at least one language you speak.')).toBeVisible();
});
