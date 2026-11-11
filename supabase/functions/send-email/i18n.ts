// Email language support.
//
// Every visible English text in index.ts is written as t`...`. For English, t puts the text back
// together exactly as written, so English emails are unchanged. For another language, t looks the
// English text up in that language's dictionary (keys use {{0}}, {{1}}… for the values) and fills
// the values in. Text without a translation stays English.
//
// The recipient's language is the one they chose on the website (auth user_metadata.ui_locale).
// It is never guessed from location. Only languages listed in EMAIL_LANGS are used.

import { AR } from './ar.ts';

export type Forms = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
export type Dict = Record<string, string | Forms>;
export type Tx = (strings: TemplateStringsArray, ...vals: unknown[]) => string;

export const DICTS: Record<string, Dict> = { ar: AR };
export const EMAIL_LANGS = ['ar'];
export const INTL: Record<string, string> = { en: 'en-GB', ar: 'ar-u-nu-latn' };
export const DIR: Record<string, 'ltr' | 'rtl'> = { ar: 'rtl' };

/** The email language for a stored website language choice: a supported language, otherwise English. */
export function emailLang(uiLocale: unknown): string {
  const code = String(uiLocale || '').toLowerCase().slice(0, 2);
  return EMAIL_LANGS.includes(code) ? code : 'en';
}

export function keyOf(strings: readonly string[]): string {
  return strings.reduce((acc, s, i) => acc + (i ? `{{${i - 1}}}` : '') + s, '');
}

export function makeT(lang: string): Tx {
  const dict = DICTS[lang];
  return (strings: TemplateStringsArray, ...vals: unknown[]) => {
    if (!dict) return strings.reduce((acc, s, i) => acc + (i ? String(vals[i - 1]) : '') + s, '');
    let tr = dict[keyOf(strings)];
    if (tr === undefined) return strings.reduce((acc, s, i) => acc + (i ? String(vals[i - 1]) : '') + s, '');
    if (typeof tr === 'object') {
      const n = Number(vals.find((v) => typeof v === 'number' || /^\d+$/.test(String(v))));
      const cat = new Intl.PluralRules(lang).select(isFinite(n) ? n : 0) as keyof Forms;
      tr = tr[cat] ?? tr.other;
    }
    return (tr as string).replace(/\{\{(\d+)\}\}/g, (_, i) => String(vals[Number(i)]));
  };
}

/** Dates written in English by other server functions ("Thursday, 19 November 2026", "Wednesday 11 November at 18:36 (Berlin time)") in the reader's language. */
export function localizeEnglishDate(s: string, lang: string, t: Tx): string {
  if (lang === 'en' || !s) return s;
  const loc = INTL[lang] || lang;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const name: Record<string, string> = {};
  months.forEach((m, i) => { name[m] = new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 15))); });
  days.forEach((d, i) => { name[d] = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 16 + i))); });
  return s
    .replace(/\(([^()]+) time\)/g, (_, city) => `(${t`${city} time`})`)
    .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, (w) => name[w] || w)
    .replace(/ at (\d)/g, (_, d) => ` ${t`at`} ${d}`)
    .replace(/, /g, t`, `);
}

/** Fixed sentences other server functions write in English (dispute outcomes), in the reader's language. */
export function localizeSentence(s: string, lang: string, t: Tx): string {
  if (lang === 'en' || !s) return s;
  const m = s.match(/^The student has been refunded (\S+) (\S+)\.$/);
  if (m) return t`The student has been refunded ${m[1]} ${m[2]}.`;
  const arr = Object.assign([s], { raw: [s] }) as unknown as TemplateStringsArray;
  return t(arr);
}
