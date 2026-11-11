// Where Stripe sends the student back after checkout, and which language Stripe's own page uses.
//
// The student's website language comes from the page (`lang` in the request). Only the site's own
// language codes are accepted, so the request can never point the return address anywhere else.
// No language, English or anything unknown → exactly the English addresses used before.
// Stripe Checkout itself has no Arabic, so for Arabic it keeps choosing by browser ('auto').

export const SITE_URL = 'https://uniskilled.com';
const SITE_LANGUAGES = ['de', 'ar', 'tr', 'fr', 'es'];
const STRIPE_CHECKOUT_LOCALES: Record<string, string> = { de: 'de', fr: 'fr', es: 'es', tr: 'tr' };

export function siteLanguage(lang: unknown): string | null {
  const l = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
  return SITE_LANGUAGES.includes(l) ? l : null;
}

export function checkoutReturnUrls(refParam: 'session' | 'group_participant', referenceId: string, lang: unknown) {
  const l = siteLanguage(lang);
  const page = `${SITE_URL}${l ? '/' + l : ''}/complete-payment.html?${refParam}=${referenceId}`;
  return { success: `${page}&stripe_success=1`, cancel: page, stripeLocale: l ? STRIPE_CHECKOUT_LOCALES[l] ?? null : null };
}
