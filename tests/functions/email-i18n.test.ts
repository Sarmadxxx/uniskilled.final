// Emails in the recipient's language (supabase/functions/send-email/i18n.ts + ar.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emailLang, makeT, keyOf, localizeEnglishDate, localizeSentence } from '../../supabase/functions/send-email/i18n.ts';
import { AR } from '../../supabase/functions/send-email/ar.ts';

const placeholders = (s: string) => [...new Set(s.match(/\{\{\d+\}\}/g) || [])].sort();
const tagNames = (s: string) => (s.match(/<\s*\/?\s*([a-z]+)/g) || []).map((x) => x.replace(/[<\/\s]/g, '')).filter((x) => x !== 'span').sort();

test('the email language is the one chosen on the website, English otherwise', () => {
  assert.equal(emailLang('ar'), 'ar');
  assert.equal(emailLang('AR'), 'ar');
  for (const v of [undefined, null, '', 'en', 'xx', 'de']) assert.equal(emailLang(v), 'en');   // not offered by email yet
});

test('English text is put back together exactly as written', () => {
  const t = makeT('en');
  const name = 'Lena', amount = '€30.00';
  assert.equal(t`Hi ${name},`, 'Hi Lena,');
  assert.equal(t`Payment received${': ' + amount}`, 'Payment received: €30.00');
  assert.equal(t`${'1'} hour`, '1 hour');
});

test('Arabic fills the values in and picks the right plural form', () => {
  const t = makeT('ar');
  const name = 'Lena';
  assert.equal(t`Hi ${name},`, 'مرحباً Lena،');
  assert.equal(t`${60} minutes`, '60 دقيقة');
  assert.equal(t`${5} minutes`, '5 دقائق');
  assert.equal(t`${2} hours`, 'ساعتان');
  assert.equal(t`Text that is not translated`, 'Text that is not translated');
});

test('every Arabic text keeps the values, links and formatting of the English text', () => {
  for (const [en, ar] of Object.entries(AR)) {
    const forms = typeof ar === 'string' ? { other: ar } : ar;
    // "1 hour" / "1 star" are written out in Arabic without the number.
    if (!['{{0}} hour', '{{0}} star'].includes(en)) assert.deepEqual(placeholders(forms.other), placeholders(en), `values in: ${en}`);
    for (const f of Object.values(forms)) {
      assert.ok(placeholders(f!).every((p) => placeholders(en).includes(p)), `unknown value in: ${f}`);
      assert.deepEqual(tagNames(f!), tagNames(en), `tags in: ${en}`);
      assert.ok(!/[A-Za-z]{4,}/.test(f!.replace(/<[^>]+>|\{\{\d+\}\}|UniSkilled|Stripe Express|Stripe|Google Calendar|Apple|Outlook|nbsp/g, '')), `left in English: ${f}`);
      assert.ok(!/معلّم|ضمان استرداد/.test(f!), `glossary: ${f}`);
    }
  }
});

test('every text the email templates write has an Arabic version', () => {
  const src = readFileSync(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8');
  // Simple t`...` texts (no nested template inside): enough to catch a new sentence added without Arabic.
  const keys = [...src.matchAll(/\bt`((?:[^`\\$]|\\.|\$\{[^{}`]*(?:\{[^{}`]*\}[^{}`]*)*\})*)`/g)].map((m) => keyOf(m[1].split(/\$\{[^{}`]*(?:\{[^{}`]*\}[^{}`]*)*\}/)));
  assert.ok(keys.length > 300, `found ${keys.length} texts`);
  const missing = keys.filter((k) => !(k in AR));
  assert.deepEqual(missing, []);
});

test('dates and outcome sentences from other server functions are shown in Arabic', () => {
  const t = makeT('ar');
  assert.equal(localizeEnglishDate('Thursday, 26 November 2026', 'ar', t), 'الخميس، 26 نوفمبر 2026');
  assert.equal(localizeEnglishDate('19:00 (Berlin time)', 'ar', t), '19:00 (بتوقيت Berlin)');
  assert.equal(localizeEnglishDate('Friday 13 November at 09:00 (Berlin time)', 'ar', t), 'الجمعة 13 نوفمبر الساعة 09:00 (بتوقيت Berlin)');
  assert.equal(localizeEnglishDate('Thursday, 26 November 2026', 'en', makeT('en')), 'Thursday, 26 November 2026');
  assert.equal(localizeSentence('The student has been fully refunded.', 'ar', t), 'تم استرداد المبلغ كاملاً للطالب.');
  assert.equal(localizeSentence('The student has been refunded 15.00 EUR.', 'ar', t), 'تم استرداد مبلغ 15.00 EUR للطالب.');
  assert.equal(localizeSentence('Something else.', 'ar', t), 'Something else.');
});
