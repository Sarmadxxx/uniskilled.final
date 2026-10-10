#!/usr/bin/env python3
"""
UniSkilled — static checks for the website (no browser or network needed).

Run from the repo root:   python3 tests/static_checks.py
Exit code 0 = all checks passed. Requires Node.js (for JavaScript syntax checks).

What it checks
  1. Every inline <script> and every .js file is valid JavaScript (syntax).
  2. No broken links to local pages/assets (href/src and location redirects).
  3. No page loads fonts from Google (GDPR) and every page uses the self-hosted fonts.
  4. Every font file referenced by fonts/fonts.css exists.
  5. No secrets are committed (Stripe/Resend/webhook keys, Supabase service-role key).
  6. Payment page: card is the default and PayPal is hidden unless the server enables it.
  7. Tutor dashboard: PayPal payout picker is switched off.
  8. Legal page: Stripe is listed as a processor; Google Fonts is not.
  9. A custom 404 page exists and uses absolute asset paths.
"""
import base64, glob, json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)
failures, passes = [], []


def check(name, ok, detail=''):
    (passes if ok else failures).append(name if ok else f'{name} — {detail}')


def read(path):
    with open(path, encoding='utf-8', errors='replace') as fh:
        return fh.read()


PAGES = sorted(glob.glob('*.html'))
SITE_FILES = set(os.listdir('.'))

# 1. JavaScript syntax ---------------------------------------------------------------------------
js_errors = []
with tempfile.TemporaryDirectory() as tmp:
    targets = []
    for page in PAGES:
        src = read(page)
        for i, m in enumerate(re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', src, re.S | re.I)):
            attrs, code = m.group(1), m.group(2)
            if 'application/ld+json' in attrs or not code.strip():
                continue
            ext = '.mjs' if 'module' in attrs else '.js'
            p = os.path.join(tmp, f'{page}.{i}{ext}')
            with open(p, 'w', encoding='utf-8') as fh:
                fh.write(code)
            targets.append((f'{page} <script #{i}>', p))
    targets += [(f, f) for f in sorted(glob.glob('*.js'))]
    for label, path in targets:
        r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
        if r.returncode != 0:
            js_errors.append(f'{label}: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "syntax error"}')
check(f'JavaScript syntax ({len(targets)} scripts)', not js_errors, '; '.join(js_errors[:5]))

# 2. Broken local links --------------------------------------------------------------------------
broken = {}
for f in PAGES + sorted(glob.glob('*.js')):
    s = read(f)
    for m in re.finditer(r'''(?:href|src)\s*=\s*["']([^"'#?$`{}]+\.(?:html|js|css|png|jpg|jpeg|webp|ico|svg|woff2))''', s):
        u = m.group(1)
        if u.startswith(('http', '//', 'data:', 'mailto:')):
            continue
        if not os.path.exists(u.lstrip('/')):
            broken.setdefault(u, set()).add(f)
    for m in re.finditer(r'''location(?:\.href)?\s*=\s*['"]([a-z0-9_-]+\.html)''', s):
        if m.group(1) not in SITE_FILES:
            broken.setdefault(m.group(1), set()).add(f)
check('No broken local links', not broken, '; '.join(f'{k} <- {sorted(v)}' for k, v in list(broken.items())[:5]))

# 3. Fonts are self-hosted -----------------------------------------------------------------------
google = [p for p in PAGES + glob.glob('*.js') + glob.glob('*.css') if re.search(r'fonts\.(googleapis|gstatic)\.com', read(p))]
check('No Google Fonts requests (GDPR)', not google, ', '.join(google))
# (The password-reset *email* template is pasted into Supabase and rendered by mail apps, not the
#  website, so it relies on font fallbacks and is excluded.)
uses_fonts = [p for p in PAGES if p != 'reset-password-email-template.html' and re.search(r"font-family\s*:\s*['\"]?(Manrope|Lora|Playfair|Plus Jakarta|Fraunces)", read(p))]
missing_local = [p for p in uses_fonts if 'fonts/fonts.css' not in read(p)]
check('Pages using brand fonts load fonts/fonts.css', not missing_local, ', '.join(missing_local))

# 4. Font files exist ----------------------------------------------------------------------------
css = read('fonts/fonts.css') if os.path.exists('fonts/fonts.css') else ''
font_urls = re.findall(r'url\(([^)]+\.woff2)\)', css)
missing_fonts = [u for u in font_urls if not os.path.exists(os.path.join('fonts', u))]
check(f'Font files referenced by fonts.css exist ({len(font_urls)})', bool(font_urls) and not missing_fonts, ', '.join(missing_fonts) or 'fonts.css missing/empty')
for fam in ['Manrope', 'Lora', 'Playfair Display', 'Plus Jakarta Sans', 'Fraunces']:
    check(f"fonts.css defines '{fam}'", f"font-family: '{fam}'" in css, 'missing')

# 5. No committed secrets ------------------------------------------------------------------------
secret_re = re.compile(r'sk_(live|test)_[A-Za-z0-9]{10,}|rk_(live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}')
jwt_re = re.compile(r'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.([A-Za-z0-9_-]+)\.')
leaks = []
for dirpath, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'fonts')]
    for fn in files:
        if not fn.endswith(('.html', '.js', '.ts', '.json', '.md', '.sql', '.toml', '.css', '.py', '.txt')):
            continue
        p = os.path.join(dirpath, fn)
        s = read(p)
        if secret_re.search(s):
            leaks.append(f'{p}: API key pattern')
        for m in jwt_re.finditer(s):
            payload = m.group(1) + '=' * (-len(m.group(1)) % 4)
            try:
                role = json.loads(base64.urlsafe_b64decode(payload)).get('role')
            except Exception:
                role = None
            if role and role != 'anon':
                leaks.append(f'{p}: Supabase key with role "{role}"')
check('No secrets committed (only the public anon key is allowed)', not leaks, '; '.join(leaks))

# 6. Payment page --------------------------------------------------------------------------------
cp = read('complete-payment.html')
check('Payment page: method toggle hidden by default', re.search(r'id="methodToggle" style="display:none', cp) is not None, 'toggle visible by default')
check('Payment page: PayPal container hidden by default', re.search(r'id="paypal-button-container" style="display:none', cp) is not None, 'PayPal visible by default')
check('Payment page: card container visible by default', re.search(r'<div id="cardPayContainer">', cp) is not None, 'card hidden by default')
check('Payment page: asks the server before offering PayPal', 'paypalCheckoutOffered()' in cp and 'checkout_enabled === true' in cp, 'no server check')
check('Payment page: confirmation polls the server (never trusts the redirect)', "params.get('stripe_success') === '1'" in cp and 'pollForCardConfirmation' in cp, 'missing')
check('Payment page: discount preview capped at the platform fee', 'PREVIEW_FEE_RATE' in cp and 'maxPreview' in cp, 'uncapped preview')

# 7. Tutor dashboard -----------------------------------------------------------------------------
td = read('tutor-dashboard.html')
check('Tutor dashboard: PayPal payout picker switched off', 'const PAYPAL_PAYOUTS_ENABLED = false;' in td, 'switch missing or on')

# 8. Legal page ----------------------------------------------------------------------------------
lg = re.sub(r'<[^>]+>', ' ', read('legal.html'))
check('Legal: Stripe listed as a processor', 'Stripe Payments Europe' in lg, 'missing')
check('Legal: Google Fonts no longer listed', 'Google Fonts' not in lg, 'still listed')
check('Legal: payments not described as PayPal checkout', 'through PayPal or' not in lg and '(PayPal or' not in lg, 'PayPal checkout wording remains')

# 9. 404 page ------------------------------------------------------------------------------------
nf = read('404.html') if os.path.exists('404.html') else ''
check('404 page exists with absolute asset paths', bool(nf) and 'href="/fonts/fonts.css"' in nf and 'src="/uniskilled-logo-sm.png"' in nf, 'missing or relative paths')

# Report -----------------------------------------------------------------------------------------
for p in passes:
    print(f'PASS  {p}')
for f in failures:
    print(f'FAIL  {f}')
print(f'\n{len(passes)} passed, {len(failures)} failed')
sys.exit(1 if failures else 0)
