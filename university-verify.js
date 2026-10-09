/* UniSkilled — tutor university-email verification card.
   initUniVerify(supabaseClient, mountElement)
   Shows on the tutor dashboard until the tutor is verified. Talks to the verify-university Edge Function;
   the Verified badge itself can only be set server-side. */
(function () {
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var CSS =
    '.uv-card{background:#fff;border-radius:14px;border:1px solid var(--border,#e2e8f0);border-left:4px solid #1a6bff;padding:1.2rem 1.4rem;margin-bottom:1.2rem}' +
    '.uv-card h3{font-size:1rem;font-weight:800;margin:0 0 .3rem;color:var(--ink,#0f172a)}' +
    '.uv-card p{font-size:.85rem;color:var(--mid,#64748b);line-height:1.55;margin:0}' +
    '.uv-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.9rem}' +
    '.uv-row input{flex:1 1 220px;min-width:0;font:500 .9rem "Manrope",sans-serif;padding:.7rem .85rem;border:1.5px solid var(--border,#e2e8f0);border-radius:9px;color:var(--ink,#0f172a);outline:none}' +
    '.uv-row input:focus{border-color:#1a6bff;box-shadow:0 0 0 3px rgba(26,107,255,.12)}' +
    '.uv-row input.code{letter-spacing:.35em;font-weight:800;font-size:1.05rem;max-width:190px}' +
    '.uv-btn{font:700 .85rem "Manrope",sans-serif;border:0;border-radius:9px;padding:.7rem 1.15rem;cursor:pointer;background:#1a6bff;color:#fff;min-height:44px}' +
    '.uv-btn[disabled]{opacity:.6;cursor:default}' +
    '.uv-link{background:none;border:0;padding:.35rem 0;font:600 .8rem "Manrope",sans-serif;color:#1a6bff;cursor:pointer}' +
    '.uv-msg{font-size:.82rem;margin-top:.6rem;min-height:1em}.uv-msg.err{color:#dc2626}.uv-msg.ok{color:#059669}' +
    '.uv-done{display:flex;align-items:center;gap:.5rem;font-size:.85rem;font-weight:700;color:#059669;background:#ecfdf5;border-radius:10px;padding:.7rem 1rem;margin-bottom:1.2rem}';

  function call(sb, body) {
    return sb.functions.invoke('verify-university', { body: body }).then(function (r) {
      if (!r.error) return r.data || {};
      // Non-2xx: read the JSON error the function sent back
      var ctx = r.error && r.error.context;
      if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { j = j || {}; j._failed = true; return j; }, function () { return { _failed: true, error: 'Something went wrong. Please try again.' }; });
      return { _failed: true, error: 'Could not reach the server. Check your connection and try again.' };
    });
  }

  window.initUniVerify = function (sb, mount) {
    if (!sb || !mount) return;
    if (!document.getElementById('uv-css')) { var st = document.createElement('style'); st.id = 'uv-css'; st.textContent = CSS; document.head.appendChild(st); }
    var state = { email: '' };

    function msg(text, kind) { var m = mount.querySelector('.uv-msg'); if (m) { m.textContent = text || ''; m.className = 'uv-msg' + (kind ? ' ' + kind : ''); } }
    function busy(btn, on, label) { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; }

    function sideLink(show) { var l = document.getElementById('sideVerifyLink'); if (l) l.style.display = show ? 'inline-block' : 'none'; }
    // Sidebar link (first thing on a phone) jumps to the card
    var sl = document.getElementById('sideVerifyLink');
    if (sl) sl.addEventListener('click', function (e) { e.preventDefault(); var c = document.getElementById('verify'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); var i = c.querySelector('input'); if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 400); } });

    function renderVerified(uni) {
      sideLink(false);
      mount.innerHTML = '<div class="uv-done" role="status">✓ University verified' + (uni ? ' · ' + esc(uni) : '') + ' — your profile shows the Verified badge.</div>';
    }

    function renderStart(prefill) {
      sideLink(true);
      mount.innerHTML =
        '<section class="uv-card" id="verify" aria-labelledby="uvTitle">' +
          '<h3 id="uvTitle">Get your Verified badge</h3>' +
          '<p>Students look for tutors verified by their university. Enter your <strong>university</strong> email and we\'ll send you a code. Your login email stays the same.</p>' +
          '<form class="uv-row" novalidate>' +
            '<label for="uvEmail" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">University email</label>' +
            '<input id="uvEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@your-university.edu" value="' + esc(prefill || '') + '">' +
            '<button class="uv-btn" type="submit">Send code</button>' +
          '</form>' +
          '<div class="uv-msg" role="status" aria-live="polite"></div>' +
          '<div id="uvNotListed"></div>' +
        '</section>';
      mount.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = mount.querySelector('#uvEmail').value.trim();
        var btn = mount.querySelector('.uv-btn');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg('Enter your full university email address.', 'err'); return; }
        busy(btn, true, 'Sending…'); msg('');
        call(sb, { action: 'send', email: email }).then(function (r) {
          busy(btn, false, 'Send code');
          if (r.verified) return renderVerified(r.university);
          if (r.error === 'not_listed') { msg(r.message, 'err'); return renderNotListed(email); }
          if (r._failed || r.error) return msg(r.error || 'Something went wrong. Please try again.', 'err');
          state.email = email;
          renderCode(r.sent_to, r.university, r.expires_in_min);
        });
      });
    }

    function renderNotListed(email) {
      var box = mount.querySelector('#uvNotListed');
      box.innerHTML =
        '<form class="uv-row" novalidate style="margin-top:.4rem">' +
          '<label for="uvUni" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">University name</label>' +
          '<input id="uvUni" type="text" placeholder="Your university\'s full name" autocomplete="organization">' +
          '<button class="uv-btn" type="submit" style="background:#0f172a">Ask us to add it</button>' +
        '</form>';
      box.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var uni = box.querySelector('#uvUni').value.trim(), btn = box.querySelector('.uv-btn');
        if (uni.length < 3) { msg('Enter your university\'s name.', 'err'); return; }
        busy(btn, true, 'Sending…');
        call(sb, { action: 'request_domain', email: email, university: uni }).then(function (r) {
          busy(btn, false, 'Ask us to add it');
          if (r._failed || r.error) return msg(r.error || 'Something went wrong. Please try again.', 'err');
          box.innerHTML = ''; msg(r.message || "Thanks — we'll review it and email you.", 'ok');
        });
      });
    }

    function renderCode(sentTo, uni, mins) {
      sideLink(true);
      mount.innerHTML =
        '<section class="uv-card" id="verify" aria-labelledby="uvTitle">' +
          '<h3 id="uvTitle">Check your university inbox</h3>' +
          '<p>We sent a 6-digit code to <strong>' + esc(sentTo || 'your university email') + '</strong>' + (uni ? ' (' + esc(uni) + ')' : '') +
          '. It expires in ' + esc(mins || 15) + ' minutes. University mail filters can be slow — check spam or quarantine too.</p>' +
          '<form class="uv-row" novalidate>' +
            '<label for="uvCode" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">6-digit code</label>' +
            '<input id="uvCode" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="000000">' +
            '<button class="uv-btn" type="submit">Verify</button>' +
          '</form>' +
          '<div class="uv-msg" role="status" aria-live="polite"></div>' +
          '<div style="display:flex;gap:1.2rem;flex-wrap:wrap;margin-top:.3rem">' +
            '<button type="button" class="uv-link" data-resend>Send a new code</button>' +
            '<button type="button" class="uv-link" data-change>Use a different email</button>' +
          '</div>' +
        '</section>';
      var input = mount.querySelector('#uvCode');
      input.focus();
      input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
      mount.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var code = input.value, btn = mount.querySelector('.uv-btn');
        if (code.length !== 6) { msg('Enter all 6 digits.', 'err'); return; }
        busy(btn, true, 'Checking…'); msg('');
        call(sb, { action: 'confirm', code: code }).then(function (r) {
          busy(btn, false, 'Verify');
          if (r.verified) {
            renderVerified(r.university);
            if (window.showToast) showToast('You\'re verified — your profile now shows the Verified badge.', 'success');
            return;
          }
          msg(r.error || 'Something went wrong. Please try again.', 'err');
        });
      });
      mount.querySelector('[data-resend]').addEventListener('click', function () {
        if (!state.email) return renderStart('');
        msg('Sending a new code…');
        call(sb, { action: 'send', email: state.email }).then(function (r) {
          if (r._failed || r.error) return msg(r.error || 'Something went wrong.', 'err');
          msg('New code sent.', 'ok');
        });
      });
      mount.querySelector('[data-change]').addEventListener('click', function () { renderStart(''); });
    }

    function focusIfLinked() {
      if (location.hash === '#verify') { var c = document.getElementById('verify'); if (c) { c.scrollIntoView({ block: 'center' }); var i = c.querySelector('input'); if (i) i.focus({ preventScroll: true }); } }
    }
    call(sb, { action: 'status' }).then(function (r) {
      setTimeout(focusIfLinked, 0);
      if (r.verified) return renderVerified(r.university);
      if (r.pending) return renderCode(r.pending.email, r.pending.university, Math.max(1, Math.round((new Date(r.pending.expires_at) - Date.now()) / 60000)));
      if (r._failed && /tutor profile/i.test(r.error || '')) { mount.innerHTML = ''; return; }
      renderStart('');
    });
  };
})();
