/* UniSkilled Study Campus — the greeting sky (morning, afternoon, evening, night).
 *
 * Drawn as an SVG string from the student's own clock: no images, no libraries, nothing loaded.
 * Layers: atmosphere gradient, sun or moon with haze, textured clouds (feTurbulence), stars and a faint
 * Milky Way at night, two skyline layers for depth, and a soft scrim on the left so text stays readable.
 * A fixed random seed means the same period always draws the same picture. Stars with class "tw" twinkle;
 * the page turns that off for students who ask for reduced motion.
 */
(function (root) {
  'use strict';
  var W = 1000, H = 240;

  function rng(seed) { // mulberry32: small, fast, deterministic
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }
  function f1(n) { return Math.round(n * 10) / 10; }

  function skyline(fill, o) {
    o = o || {};
    var r = rng(o.seed || 7), scale = o.scale || 1, base = o.base || 0, parts = [], wins = [], x = -4;
    while (x < W) {
      var w = pick(r, [16, 20, 24, 28, 34, 42]), h = pick(r, [14, 20, 26, 32, 38, 46, 54]);
      if (r() < 0.10) h += 26;
      h = Math.round(h * scale);
      var y = H - base - h;
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + (w + 1) + '" height="' + (h + base) + '"/>');
      if (r() < 0.16) parts.push('<rect x="' + (x + Math.floor(w / 2) - 1) + '" y="' + (y - Math.round(9 * scale)) + '" width="1.6" height="' + Math.round(9 * scale) + '"/>');
      if (o.lit) for (var wy = y + 5; wy < H - 4; wy += 6) for (var wx = x + 3; wx < x + w - 3; wx += 5) if (r() < o.lit) wins.push('<rect x="' + wx + '" y="' + wy + '" width="2" height="2.6" opacity="' + pick(r, [0.5, 0.75, 0.95]) + '"/>');
      x += w;
    }
    return '<g fill="' + fill + '" opacity="' + (o.opacity == null ? 1 : o.opacity) + '">' + parts.join('') + '</g>' + (wins.length ? '<g fill="' + (o.windows || '#FFD98A') + '">' + wins.join('') + '</g>' : '');
  }
  function trees(fill) {
    var r = rng(3), out = [], tx = -10;
    while (tx < W + 20) { var rad = 6 + r() * 6; out.push('<circle cx="' + f1(tx) + '" cy="' + f1(H + 2 + (r() * 6 - 3)) + '" r="' + f1(rad) + '"/>'); tx += rad * 1.25; }
    return '<g fill="' + fill + '">' + out.join('') + '</g>';
  }
  function stars(n, seed, topFrac, bright) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = r() * W, y = Math.pow(r(), 1.6) * H * topFrac, rad = pick(r, [0.45, 0.55, 0.7, 0.8, 0.95, 1.1, 1.35, 1.7]) * (bright || 1);
      var col = pick(r, ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#DDE6FF', '#FFF1D6']), op = 0.45 + r() * 0.55;
      out.push('<circle' + (i % 5 === 0 ? ' class="tw"' : '') + ' cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + rad.toFixed(2) + '" fill="' + col + '" opacity="' + op.toFixed(2) + '" style="animation-delay:' + ((i % 9) * 0.45).toFixed(2) + 's"/>');
      if (rad > 1.3) out.push('<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(rad * 3.2) + '" fill="' + col + '" opacity=".12"/>');
    }
    return '<g>' + out.join('') + '</g>';
  }
  function clouds(id, seed, freq, oct, slope, offset, color, opacity, band, shade, blur, dy) {
    return '<filter id="' + id + 'f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="' + oct + '" seed="' + seed + '"/>' +
      '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ' + slope + ' 0 0 0 -' + offset + '"/><feGaussianBlur stdDeviation="' + blur + '"/><feComposite in2="SourceGraphic" operator="in"/></filter>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="' + band[0] + '" stop-color="#fff" stop-opacity="0"/><stop offset="' + band[1] + '" stop-color="#fff"/><stop offset="' + band[2] + '" stop-color="#fff"/><stop offset="' + band[3] + '" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="' + id + 'm"><rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'g)"/></mask>' +
      (shade ? '<rect width="' + W + '" height="' + H + '" fill="' + shade + '" filter="url(#' + id + 'f)" mask="url(#' + id + 'm)" transform="translate(0 ' + dy + ')" opacity="' + (opacity * 0.6).toFixed(2) + '"/>' : '') +
      '<rect width="' + W + '" height="' + H + '" fill="' + color + '" filter="url(#' + id + 'f)" mask="url(#' + id + 'm)" opacity="' + opacity + '"/>';
  }
  function grad(id, stops) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' + stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</linearGradient><rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  }
  function scrim(id, col, k) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + col + '" stop-opacity="' + k + '"/><stop offset=".42" stop-color="' + col + '" stop-opacity="' + (k * 0.45).toFixed(2) + '"/><stop offset=".68" stop-color="' + col + '" stop-opacity="0"/></linearGradient><rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  }
  function haze(id, col, k) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="' + col + '" stop-opacity="0"/><stop offset="1" stop-color="' + col + '" stop-opacity="' + k + '"/></linearGradient><rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  }
  function sun(id, cx, cy, core, glow, gr, cr, k) {
    return '<radialGradient id="' + id + 'g" cx="' + cx + '" cy="' + cy + '" r="' + gr + '" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="' + glow + '" stop-opacity="' + k + '"/><stop offset=".3" stop-color="' + glow + '" stop-opacity="' + (k * 0.35).toFixed(2) + '"/><stop offset="1" stop-color="' + glow + '" stop-opacity="0"/></radialGradient><rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'g)"/>' +
      '<radialGradient id="' + id + 'd" cx="' + cx + '" cy="' + cy + '" r="' + f1(cr * 1.7) + '" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="' + core + '"/><stop offset="1" stop-color="' + core + '" stop-opacity="0"/></radialGradient><circle cx="' + cx + '" cy="' + cy + '" r="' + f1(cr * 1.7) + '" fill="url(#' + id + 'd)"/>';
  }
  function moon(id) {
    return '<radialGradient id="' + id + 'h" cx="950" cy="62" r="120" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#DCE4FF" stop-opacity=".35"/><stop offset="1" stop-color="#DCE4FF" stop-opacity="0"/></radialGradient><rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'h)"/>' +
      '<radialGradient id="' + id + 'd" cx="943" cy="56" r="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFDF2"/><stop offset=".8" stop-color="#EDE8D4"/><stop offset="1" stop-color="#D9D3BC"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><circle cx="950" cy="62" r="24"/></clipPath><circle cx="950" cy="62" r="24" fill="url(#' + id + 'd)"/>' +
      '<filter id="' + id + 'k" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .45  0 0 0 0 .5  0 0 0 -2.2 1.3"/></filter>' +
      '<rect x="920" y="32" width="60" height="60" filter="url(#' + id + 'k)" clip-path="url(#' + id + 'c)" opacity=".35"/>' +
      '<circle cx="942" cy="56" r="5" fill="#C9C3AC" opacity=".35" clip-path="url(#' + id + 'c)"/><circle cx="958" cy="70" r="3.5" fill="#C9C3AC" opacity=".3"/><circle cx="956" cy="51" r="2.5" fill="#C9C3AC" opacity=".3"/>';
  }
  function milkyWay(id) {
    return '<filter id="' + id + 'f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="5" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 .75  0 0 0 0 .78  0 0 0 0 1  0 0 0 -1.2 .9"/><feGaussianBlur stdDeviation="1.2"/></filter>' +
      '<radialGradient id="' + id + 'g" cx="620" cy="90" r="380" gradientUnits="userSpaceOnUse" gradientTransform="rotate(-18 620 90) scale(1 .28) translate(0 230)"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<mask id="' + id + 'm"><rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'g)"/></mask><rect width="' + W + '" height="' + H + '" filter="url(#' + id + 'f)" mask="url(#' + id + 'm)" opacity=".38"/>';
  }

  // Text colours that stay readable on each sky (checked at 4.5:1 or better over the scrim).
  var INK = {
    morning: { ink: '#101935', soft: '#30406E', dark: false },
    afternoon: { ink: '#0B1533', soft: '#1E3263', dark: false },
    evening: { ink: '#FFFFFF', soft: '#E6DDF5', dark: true },
    night: { ink: '#FFFFFF', soft: '#BFC9EE', dark: true }
  };

  function scene(period) {
    var p = 'sky' + period.charAt(0), body;
    if (period === 'morning') body = grad(p + 'a', [[0, '#5E9BD6'], [0.42, '#9CC5EA'], [0.68, '#EED8C2'], [0.86, '#F8C796'], [1, '#F6B07A']]) +
      sun(p + 's', 905, 150, '#FFF6DA', '#FFD7A0', 430, 21, 0.8) +
      clouds(p + 'c', 3, '0.0045 0.03', 5, 2.2, 0.95, '#FFF6EE', 0.95, [0.05, 0.2, 0.5, 0.7], '#E7A88E', 0.9, 3) +
      skyline('#B7A9C4', { seed: 21, scale: 0.75, base: 6, opacity: 0.7 }) + haze(p + 'h', '#F6C9A4', 0.55) +
      skyline('#7F7898', { seed: 11, scale: 0.55 }) + trees('#6E6888') + scrim(p + 'r', '#F4F8FF', 0.5);
    else if (period === 'afternoon') body = grad(p + 'a', [[0, '#1B66C9'], [0.48, '#4F98E6'], [0.82, '#9CCBF3'], [1, '#CFE6FA']]) +
      sun(p + 's', 930, 42, '#FFFDF0', '#FFFFFF', 340, 19, 0.65) +
      clouds(p + 'c', 9, '0.0065 0.013', 6, 2.6, 1.15, '#FFFFFF', 1.0, [0.08, 0.28, 0.62, 0.82], '#8FA9CC', 0.6, 6) +
      skyline('#9DB8DA', { seed: 21, scale: 0.75, base: 6, opacity: 0.75 }) + haze(p + 'h', '#D8EAFA', 0.5) +
      skyline('#6C8AB4', { seed: 11, scale: 0.55 }) + trees('#5D7BA5') + scrim(p + 'r', '#EAF4FF', 0.42);
    else if (period === 'evening') body = grad(p + 'a', [[0, '#141A45'], [0.3, '#3E2F6E'], [0.55, '#9C4C78'], [0.78, '#E9775A'], [0.92, '#FBA65E'], [1, '#FFC27A']]) +
      stars(40, 5, 0.38, 0.9) + sun(p + 's', 880, 214, '#FFD9A0', '#FF8A4C', 460, 26, 0.85) +
      clouds(p + 'c', 21, '0.004 0.045', 5, 2.3, 1.0, '#FFB38A', 0.75, [0.2, 0.38, 0.6, 0.74], '#6B3466', 0.7, 3) +
      skyline('#4A2C55', { seed: 21, scale: 0.75, base: 6, opacity: 0.8 }) +
      skyline('#22163A', { seed: 11, scale: 0.62, lit: 0.06, windows: '#FFC873' }) + trees('#1C1230') + scrim(p + 'r', '#120E30', 0.55);
    else body = grad(p + 'a', [[0, '#03061A'], [0.55, '#0B1438'], [0.85, '#1A2556'], [1, '#2A3168']]) +
      milkyWay(p + 'w') + stars(190, 17, 0.92) + moon(p + 'm') +
      skyline('#0E1330', { seed: 21, scale: 0.75, base: 6, lit: 0.04, windows: '#E9C27A' }) +
      skyline('#05081A', { seed: 11, scale: 0.62, lit: 0.1, windows: '#FFD58A' }) + trees('#04061A') + scrim(p + 'r', '#03061A', 0.45);
    return '<svg class="shq-sky-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  var cache = {};
  var api = {
    scene: function (period) { return cache[period] || (cache[period] = scene(period)); },
    ink: function (period) { return INK[period] || INK.afternoon; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StudyHQSky = api;
})(typeof window !== 'undefined' ? window : globalThis);
