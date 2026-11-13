// Messages: the contact-details check (messages.html, detectContactInfo) catches phone numbers in any
// digits and app names in Arabic too, while ordinary messages still go through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'messages.html'), 'utf8');
const start = html.indexOf('function detectContactInfo(text) {');
const end = html.indexOf('\n}\n', start) + 2;
const detect = new Function('T', html.slice(start, end) + '\nreturn detectContactInfo;')((k, en) => k);

test('caught: phone numbers in Western, Arabic-Indic and Persian digits', () => {
  for (const t of ['call me +49 151 2345 6789', 'رقمي ٠٥٥١٢٣٤٥٦٧', 'اتصل على +٤٩ ١٥١ ٢٣٤٥ ٦٧٨٩', 'شماره ۰۹۱۲۳۴۵۶۷۸۹'])
    assert.equal(detect(t), 'c-phone', t);
});

test('caught: app names in English and Arabic followed by a handle', () => {
  for (const t of ['add me on insta @sam.lee', 'whatsapp me sam_99', 'ضيفني على سناب: ahmad_99', 'كلمني واتساب @sara.k', 'حسابي على انستغرام sara.k', 'تيليجرام @omar22'])
    assert.equal(detect(t), 'c-handle', t);
});

test('not caught: ordinary messages in English, Arabic and German', () => {
  for (const t of ['Can we meet on Thursday at 16:00?', 'هل يمكننا البدء يوم الخميس الساعة ٤ مساءً؟', 'لدي اختبار في ٢٠ نوفمبر', 'Ich habe 3 Fragen zu Kapitel 12.', 'The exam is worth 40%.', 'شكراً جزيلاً، الدرس كان ممتازاً'])
    assert.equal(detect(t), null, t);
});

test('emails and links still caught', () => {
  assert.equal(detect('mail me: sam@example.com'), 'c-email');
  assert.equal(detect('wa.me/491512345678'), 'c-phone');   // the long number is found first
  assert.equal(detect('https://t.me/samlee'), 'c-link');
});
