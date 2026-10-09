/* UniSkilled — small shared UI helpers.
   showToast(message, type, opts)
     type: 'success' | 'error' | 'info' (default 'info')
     opts.afterReload: true → message is shown after the next page load
                       (use right before location.reload() / a redirect)
   Toasts are announced to screen readers and never block the page like alert(). */
(function () {
  var KEY = 'uniskilled_flash';

  function ensureStyles() {
    if (document.getElementById('us-toast-css')) return;
    var st = document.createElement('style');
    st.id = 'us-toast-css';
    st.textContent =
      '#us-toasts{position:fixed;z-index:10000;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;gap:10px;' +
        'width:min(440px,calc(100vw - 32px));pointer-events:none}' +
      '.us-toast{pointer-events:auto;display:flex;gap:12px;align-items:flex-start;background:#111827;color:#fff;border-radius:12px;' +
        'padding:14px 16px;font:500 14.5px/1.45 "Manrope",system-ui,sans-serif;box-shadow:0 12px 32px rgba(17,24,39,.28);' +
        'border-left:4px solid #1a6bff;animation:usToastIn .22s ease-out}' +
      '.us-toast.success{border-left-color:#10b981}.us-toast.error{border-left-color:#ef4444}' +
      '.us-toast p{flex:1;margin:0}' +
      '.us-toast button{flex:none;background:none;border:0;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:6px}' +
      '.us-toast button:hover{color:#fff}' +
      '@keyframes usToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '@media (prefers-reduced-motion:reduce){.us-toast{animation:none}}';
    document.head.appendChild(st);
  }

  function host() {
    var h = document.getElementById('us-toasts');
    if (!h) {
      h = document.createElement('div');
      h.id = 'us-toasts';
      h.setAttribute('role', 'status');
      h.setAttribute('aria-live', 'polite');
      document.body.appendChild(h);
    }
    return h;
  }

  function render(message, type) {
    ensureStyles();
    var t = document.createElement('div');
    t.className = 'us-toast ' + (type || 'info');
    if (type === 'error') t.setAttribute('role', 'alert');
    var p = document.createElement('p');
    p.textContent = String(message == null ? '' : message);
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '×';
    x.onclick = function () { t.remove(); };
    t.appendChild(p); t.appendChild(x);
    host().appendChild(t);
    // Errors stay longer; long messages get more reading time
    var ms = Math.min(12000, (type === 'error' ? 6000 : 4000) + String(message).length * 40);
    setTimeout(function () { t.remove(); }, ms);
  }

  window.showToast = function (message, type, opts) {
    if (opts && opts.afterReload) {
      try { sessionStorage.setItem(KEY, JSON.stringify({ m: message, t: type })); return; } catch (e) {}
    }
    if (document.body) render(message, type);
    else document.addEventListener('DOMContentLoaded', function () { render(message, type); });
  };

  // Show any message saved before a reload/redirect
  function flush() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      sessionStorage.removeItem(KEY);
      var f = JSON.parse(raw);
      render(f.m, f.t);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', flush); else flush();
})();
