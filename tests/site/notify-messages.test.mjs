// Stored notifications are recognised and shown in the reader's language (notifications.js).
// Every known English wording must be recognised from a filled-in example, with its values kept,
// and English pages must show the stored text unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../notifications.js', import.meta.url), 'utf8');
const en = JSON.parse(fs.readFileSync(new URL('../../locales/en/common.json', import.meta.url), 'utf8'));
const ar = JSON.parse(fs.readFileSync(new URL('../../locales/ar/common.json', import.meta.url), 'utf8'));

const SAMPLE = { amount: '€42.50', subject: 'Linear Algebra', name: 'Lena M.', date: 'Monday, 16 November', time: '14:00 (Berlin time)',
  deadline: 'Mon 16 Nov at 14:00', text: 'Thanks, that helps', uni: 'TU Berlin', n: '5', currency: 'EUR', count: '24', price: '€30.00' };
const fill = (tpl) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => SAMPLE[k] ?? 'X');

function load(lang, dict) {
  const fake = {
    lang,
    t(key, fallback, vars) {
      let s = lang === 'en' ? fallback : (dict[key] ?? fallback);
      if (typeof s === 'object') s = vars && vars.count === 1 ? s.one : s.other;
      return String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
    },
    h(k, f, v) { return this.t(k, f, v); },
    date(d, o) { return new Intl.DateTimeFormat(lang, o).format(d); },
  };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  const ctx = { window: {}, document: { documentElement: { lang }, readyState: 'loading', addEventListener() {}, createElement: el, querySelector() { return null; }, querySelectorAll() { return []; }, head: el(), body: el() },
    localStorage: { getItem() { return null; }, setItem() {} }, navigator: {}, setTimeout() {}, setInterval() {}, console, Intl, Date, RegExp, JSON, Math };
  ctx.window = ctx; ctx.I18N = fake; ctx.window.I18N = fake;
  vm.runInNewContext(src, ctx);
  return { tr: ctx.USKNotifyText, messages: vm.runInNewContext(src.match(/var MESSAGES = (\[[\s\S]*?\n  \]);/)[1]) };
}

test('every known notification is recognised and shown in Arabic with its values', () => {
  const { tr, messages } = load('ar', ar);
  assert.equal(typeof tr, 'function');
  assert.ok(messages.length >= 90);
  for (const [key, tpl] of messages) {
    assert.equal(en['notify.msg.' + key], tpl, `en common.json matches ${key}`);
    assert.ok(ar['notify.msg.' + key], `Arabic for ${key}`);
    const out = tr(fill(tpl));
    assert.equal(out, tr(fill(tpl)));
    assert.notEqual(out, fill(tpl), `${key} was translated`);
    for (const v of tpl.match(/\{\{\w+\}\}/g) || []) {
      const name = v.slice(2, -2);
      if (['date', 'time', 'deadline'].includes(name)) continue;
      assert.ok(out.includes(SAMPLE[name]), `${key} keeps ${name}: ${out}`);
    }
    assert.ok(!/\{\{/.test(out), `${key} has no leftover placeholder: ${out}`);
  }
});

test('each example is recognised as its own message, not an earlier one', () => {
  const { messages } = load('ar', ar);
  const rx = (tpl) => new RegExp('^' + tpl.split(/(\{\{\w+\}\})/).map((p) => /^\{\{\w+\}\}$/.test(p) ? '([\\s\\S]+?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
  messages.forEach(([key, tpl], i) => {
    const first = messages.findIndex(([, t]) => rx(t).test(fill(tpl)));
    assert.equal(messages[first][0], key, `${key} is caught by ${messages[first][0]}`);
  });
});

test('dates, times and fallback names are shown in Arabic', () => {
  const { tr } = load('ar', ar);
  const out = tr(fill('{{name}} asked to move your {{subject}} session to {{date}} at {{time}}. Accept or decline it on your dashboard.'));
  assert.ok(!/Monday|November|Berlin time| at /.test(out), out);
  assert.ok(out.includes('بتوقيت Berlin'), out);
  assert.ok(tr('A student cancelled the Maths session. A full refund has been issued.').startsWith('ألغى أحد الطلاب'));
});

test('unknown text and English pages are left exactly as stored', () => {
  const { tr } = load('ar', ar);
  assert.equal(tr('Something the platform never sends'), 'Something the platform never sends');
  const enTr = load('en', en).tr;
  for (const s of ['✅ Payment confirmed!', 'Your session with Lena M. is all set.']) assert.equal(enTr(s), s);
});
