/* UniSkilled — right-to-left (Arabic) copies of pages and scripts, made at build time.
 *
 * The English files are never edited. For each Arabic page the build mirrors the layout in the
 * COPY under /ar/: every left becomes right (margins, paddings, borders, positions, text alignment,
 * floats, rounded corners), using rtlcss (MIT) for real CSS and a careful swap for styles written
 * inside JavaScript strings.
 *
 * Kept as in English on purpose:
 *   • The header (site-nav.js): it stays left-to-right so the logo stays on the LEFT (decision
 *     10 Nov 2026); only its links and menus read right-to-left (HEADER_RTL below).
 *   • Things centred with left:50% (they are symmetric).
 *   • Anything marked  data-keep-ltr  or written inside  /* rtl:ignore *\/ .
 */
import rtlcss from 'rtlcss';
import { tokenizer } from 'acorn';

const RTL_OPTS = { autoRename: false, stringMap: [] };

/** Mirror a whole stylesheet (the contents of a <style> block or a .css file). */
export function flipCss(css) {
  return rtlcss.process(css, RTL_OPTS);
}

// Template expressions (${…}) and {{holes}} cannot be parsed as CSS: park them, flip, put them back.
function park(s) {
  const saved = [];
  const out = s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}|\{\{[^}]*\}\}/g, m => { saved.push(m); return `__P${saved.length - 1}__`; });
  return [out, t => t.replace(/__P(\d+)__/g, (_, i) => saved[Number(i)])];
}

/** Mirror one style="…" value. Keeps the original text exactly when nothing needs to change. */
export function flipDeclarations(decls) {
  if (!/(left|right)|margin|padding|border-(?:width|radius|color|style)|float|clear|text-align|transform|background-position/i.test(decls)) return decls;
  const [parked, restore] = park(decls);
  try {
    const css = rtlcss.process(`a{${parked}}`, RTL_OPTS);
    const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
    // rtlcss may normalise spacing; only accept its result when something actually changed.
    const norm = s => s.replace(/\s+/g, '').replace(/;$/, '');
    return norm(body) === norm(parked) ? decls : restore(body.trim());
  } catch {
    return swapDeclarations(decls);
  }
}

/** Swap left and right in CSS text that has no parser (CSS written inside JavaScript strings).
 *  Things centred with left:50% / right:50% are left alone (they are symmetric). */
export function swapDeclarations(s) {
  const other = side => (side.toLowerCase() === 'left' ? 'right' : 'left');
  return s
    .replace(/\b(margin|padding|border)-(left|right)\b/gi, (m, p, side) => `${p}-${other(side)}`)
    .replace(/\bborder-(top|bottom)-(left|right)-radius\b/gi, (m, v, side) => `border-${v}-${other(side)}-radius`)
    .replace(/(^|[;{\s'"`])(left|right)(\s*:\s*)(?!50%)/gi, (m, pre, side, colon) => `${pre}${other(side)}${colon}`)
    .replace(/\b(text-align|float|clear)(\s*:\s*)(left|right)\b/gi, (m, p, c, side) => `${p}${c}${other(side)}`);
}

// A string looks like CSS when it has a side property with a colon AND a CSS-only hint.
const SIDE_PROP = /(?:^|[;{\s'"`])(?:(?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|border-(?:top|bottom)-(?:left|right)-radius|left|right|text-align|float|clear)\s*:/i;
const CSS_HINT = /\d(?:px|rem|em|%|vw|vh)\b|;|\{|\b(?:auto|solid|dashed|none|inherit|calc|max|min)\b/i;

/** Mirror the styles inside a piece of JavaScript. Only text strings are changed, found with a real
 *  JavaScript tokenizer (acorn), so code such as {left: x} or el.style.left is never touched.
 *  If the code cannot be read, it is returned unchanged. */
export function flipScript(code) {
  if (/\/\*\s*rtl:ignore\s*\*\//.test(code)) return code;
  const edits = [];
  try {
    for (const tok of tokenizer(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true })) {
      const label = tok.type.label;
      if (label !== 'string' && label !== 'template') continue;
      const raw = code.slice(tok.start, tok.end);
      if (!SIDE_PROP.test(raw) || !CSS_HINT.test(raw)) continue;
      const next = swapDeclarations(raw);
      if (next !== raw) edits.push([tok.start, tok.end, next]);
    }
  } catch {
    return code;
  }
  let out = code;
  for (const [a, b, text] of edits.reverse()) out = out.slice(0, a) + text + out.slice(b);
  return out;
}

/** Header: logo stays on the left (header keeps LTR); links, account menu and phone menu read RTL. */
export const HEADER_RTL = [
  '.snav{direction:ltr}',
  '.snav-links{flex-direction:row-reverse}',
  '.snav-links a,.snav-end,.snav-menu,.snav-m{direction:rtl}',
  '.snav-mi{text-align:right}',
  '.snav-m a,.snav-m button{text-align:right}',
  '.snav-m a[aria-current="page"]{box-shadow:inset -3px 0 0 #28a9e0;padding-left:0;padding-right:12px}',
  // Every other page's own header or bar that holds the logo keeps its English order (logo on the left);
  // the words inside still read right-to-left (unicode-bidi: plaintext).
  ':is(header,[class*="topbar"],[class*="top-bar"],[class*="navbar"],[class*="nav-bar"]):has(img[src*="uniskilled-logo"]),' +
    ':has(>img[src*="uniskilled-logo"]),:has(>a>img[src*="uniskilled-logo"]){direction:ltr}',
  ':is(header,[class*="topbar"],[class*="top-bar"],[class*="navbar"],[class*="nav-bar"]):has(img[src*="uniskilled-logo"]) :is(a,button,span,p,li,small,b,strong,label){unicode-bidi:plaintext}',
  '.flip-rtl{transform:scaleX(-1)}',
  'input[type="email"],input[type="tel"],input[type="url"],.ltr{direction:ltr;text-align:right}',
].join('');

/**
 * Turn an already-translated page into its right-to-left version.
 * flippedScripts: Set of shared .js file names that have a mirrored copy at /<lang>/<name>.
 */
export function rtlPage(html, { lang = 'ar', flippedScripts = new Set() } = {}) {
  let out = html;

  // 1) <style> blocks (not the ones inside <script> strings)
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) =>
    /data-keep-ltr/.test(open) ? m : open + flipCss(css) + close);

  // 2) style="…" attributes in the HTML itself (skip <script> bodies, handled next, and data-keep-ltr elements)
  const parts = out.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/i);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/<([a-zA-Z][\w-]*)\b([^>]*?)\sstyle="([^"]*)"([^>]*)>/g, (m, tag, a1, decls, a2) =>
      /data-keep-ltr/.test(a1 + a2) ? m : `<${tag}${a1} style="${flipDeclarations(decls)}"${a2}>`);
  }
  // 3) inline scripts: styles written in JavaScript strings
  for (let i = 1; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/i, (m, open, code, close) =>
      /application\/ld\+json/.test(open) ? m : open + flipScript(code) + close);
  }
  out = parts.join('');

  // 4) shared scripts that hold styles → their mirrored copies
  out = out.replace(/(<script\b[^>]*\ssrc=")\/?([\w.-]+\.js)((?:\?[^"]*)?")/g, (m, pre, name, rest) =>
    flippedScripts.has(name) ? `${pre}/${lang}/${name}${rest}` : m);

  // 5) Arabic letters + header rules, right after the existing fonts
  const head = `<link rel="stylesheet" href="/fonts/arabic.css">\n<style data-keep-ltr>${HEADER_RTL}</style>`;
  out = /<link[^>]+fonts\/fonts\.css[^>]*>/i.test(out)
    ? out.replace(/(<link[^>]+fonts\/fonts\.css[^>]*>)/i, `$1\n${head}`)
    : out.replace(/<\/head>/i, `${head}\n</head>`);
  return out;
}

/** Shared scripts whose mirrored copy differs (site-nav.js is never mirrored: the header stays LTR). */
export function flipSharedScripts(scripts) {
  const out = {};
  for (const [name, code] of Object.entries(scripts)) {
    if (name === 'site-nav.js' || name === 'i18n.js' || /\.min\.js$/.test(name) || name.startsWith('sentry')) continue;
    const flipped = flipScript(code);
    if (flipped !== code) out[name] = flipped;
  }
  return out;
}
