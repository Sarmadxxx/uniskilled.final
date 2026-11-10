// Languages a person speaks / teaches in (language-picker.js) — separate from the website language.
// Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url).pathname;
const plain = x => JSON.parse(JSON.stringify(x));   // objects made inside the sandbox → plain data
function load(boot) {
  const window = {};
  if (boot) {
    vm.runInNewContext(readFileSync(ROOT + 'i18n.js', 'utf8'), { window: Object.assign(window, { __I18N: boot, location: { search: '' }, navigator: { languages: [] } }), Intl, Date, Number, String, Math, Array, Object, JSON });
  }
  vm.runInNewContext(readFileSync(ROOT + 'language-picker.js', 'utf8'), { window, Intl, String, Array, Object, Promise, JSON });
  return window.USKLangs;
}

test('a fixed list of codes, never free text; duplicates and unknown codes dropped', () => {
  const L = load();
  assert.ok(L.CODES.includes('ar') && L.CODES.includes('en') && L.CODES.includes('ckb') && L.CODES.includes('de'));
  assert.deepEqual(plain(L.clean([{ code: 'AR', level: 'native' }, { code: 'ar', level: 'fluent' }, { code: '<b>x</b>' }, { code: 'en', level: 'expert' }])),
    [{ code: 'ar', level: 'native' }, { code: 'en', level: 'fluent' }]);
  assert.ok(L.CODES.every(c => /^[a-z]{2,3}$/.test(c)), 'codes must match the database rule');
});

test('names come out in the reader’s language', () => {
  assert.equal(load().list([{ code: 'ar' }, { code: 'en' }]), 'Arabic, English');
  assert.equal(load({ lang: 'de', dict: {} }).name('ar'), 'Arabisch');
  assert.equal(load({ lang: 'ar', dict: {} }).name('en'), 'الإنجليزية');
});

test('saving goes through set_my_languages with clean rows only', async () => {
  const L = load(); let called;
  const client = { rpc: (fn, args) => { called = [fn, args]; return Promise.resolve({ error: null }); } };
  const r = await L.save(client, [{ code: 'tr', level: 'conversational' }, { code: 'zz!' }]);
  assert.equal(r.error, null);
  assert.deepEqual(plain(called), ['set_my_languages', { p_langs: [{ code: 'tr', level: 'conversational' }] }]);
});

test('loading never breaks a page when the database answers with an error', async () => {
  const L = load();
  const q = { select: () => q, in: () => q, order: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }) };
  assert.deepEqual(plain(await L.load({ from: () => q }, ['u1'])), {});
});

test('migration: private by default, tutors public, changes only through set_my_languages', () => {
  const sql = readFileSync(ROOT + 'supabase/migrations/20261110230000_user_languages.sql', 'utf8');
  assert.match(sql, /alter table public\.user_languages enable row level security/);
  assert.match(sql, /revoke all on public\.user_languages from anon, authenticated;\ngrant select on public\.user_languages to anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*user_languages[^;]*(anon|authenticated)/i);
  assert.match(sql, /revoke all on function public\.set_my_languages\(jsonb\) from public, anon;/);
  assert.match(sql, /using \(public\.is_listed_tutor\(user_id\)\)/);
  // The sign-up step for languages has its own error block, so it can never stop an account being created
  assert.match(sql, /BEGIN\n    INSERT INTO public\.user_languages[\s\S]*?EXCEPTION WHEN others THEN\n    RAISE WARNING 'handle_new_user: languages skipped/);
});
