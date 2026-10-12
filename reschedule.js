/* UniSkilled — reschedule requests (shared by student and tutor dashboards).
 *
 * Rescheduling is a request the other side must accept. The session keeps its time until then.
 * All rules (2 moves max, within 30 days of the original date, at least 2 hours ahead, refund
 * effects) are enforced by the reschedule-session Edge Function; this file only shows them.
 *
 * Page contract: the page defines `_sb` (Supabase client), `authedHeaders()`, `__esc()` and
 * `__tzNote()`, and may set `UsResched.onChange` to refresh its lists after an action.
 */
(function () {
  var FN_URL = 'https://orghkbbohnabcietidiv.supabase.co/functions/v1/reschedule-session';
  var MAX_MOVES = 2, MAX_DAYS = 30;
  var state = { sessionId: null, session: null, myId: null, busy: false };

  function esc(v) { return (window.__esc ? window.__esc(v) : String(v == null ? '' : v)); }
  function tzCity(tz) { return String(tz || 'Europe/Berlin').split('/').pop().replace(/_/g, ' '); }
  function fmtWhen(dateStr, timeStr, tz) {
    var d = new Date(String(dateStr) + 'T12:00:00Z');
    var day = isNaN(d) ? String(dateStr) : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return day + ', ' + String(timeStr || '').slice(0, 5) + (window.__tzNote ? window.__tzNote(tz) : '');
  }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function injectStyles() {
    if (document.getElementById('usRsStyles')) return;
    var css = ''
      + '.session-row:has(.us-rs-note){flex-wrap:wrap}'
      + '.us-rs-note{flex-basis:100%;margin-top:0.6rem;padding:0.65rem 0.8rem;border-radius:9px;font-size:0.8rem;line-height:1.45;display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem}'
      + '.us-rs-note.mine{background:#f8fafc;border:1px solid #e2e8f0;color:#334155}'
      + '.us-rs-note.theirs{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}'
      + '.us-rs-note .us-rs-text{flex:1 1 220px}'
      + '.us-rs-btn{font-family:Manrope,sans-serif;font-size:0.8rem;font-weight:700;border-radius:8px;padding:0.45rem 0.8rem;cursor:pointer;min-height:36px}'
      + '.us-rs-btn.primary{background:#1a6bff;color:#fff;border:none}'
      + '.us-rs-btn.ghost{background:#fff;color:#334155;border:1.5px solid #e2e8f0}'
      + '.us-rs-btn:disabled{opacity:0.6;cursor:default}'
      + '#usRsOverlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:1001;align-items:center;justify-content:center;padding:1rem}'
      + '#usRsDialog{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:1.6rem;font-family:Manrope,sans-serif;max-height:90vh;overflow:auto}'
      + '#usRsDialog label{display:block;font-size:0.78rem;font-weight:700;color:#334155;margin-bottom:0.3rem}'
      + '#usRsDialog input{width:100%;box-sizing:border-box;padding:0.6rem;border:1.5px solid #e2e8f0;border-radius:8px;font-family:Manrope,sans-serif;font-size:0.9rem}'
      + '#usRsDialog input:focus,.us-rs-btn:focus-visible{outline:2px solid #1a6bff;outline-offset:2px}'
      + '.us-rs-rules{font-size:0.78rem;color:#5b6474;background:#f8fafc;border-radius:8px;padding:0.6rem 0.75rem;margin:0.8rem 0;line-height:1.5}'
      + '.us-rs-warn{font-size:0.78rem;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:0.6rem 0.75rem;margin:0.8rem 0;line-height:1.5}';
    var s = document.createElement('style');
    s.id = 'usRsStyles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureModal() {
    injectStyles();
    if (document.getElementById('usRsOverlay')) return;
    var o = document.createElement('div');
    o.id = 'usRsOverlay';
    o.innerHTML = ''
      + '<div id="usRsDialog" role="dialog" aria-modal="true" aria-labelledby="usRsTitle">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">'
      + '    <h2 id="usRsTitle" style="font-size:1.05rem;font-weight:800;color:#0f172a;margin:0;">Propose a new time</h2>'
      + '    <button type="button" id="usRsClose" aria-label="Close" style="background:none;border:none;font-size:1.4rem;color:#5b6474;cursor:pointer;line-height:1;min-width:36px;min-height:36px;">×</button>'
      + '  </div>'
      + '  <div id="usRsBody"></div>'
      + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) close(); });
    document.getElementById('usRsClose').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && o.style.display === 'flex') close();
    });
  }

  function close() {
    var o = document.getElementById('usRsOverlay');
    if (o) o.style.display = 'none';
    state.sessionId = null; state.session = null; state.busy = false;
  }

  function changed() {
    if (typeof UsResched.onChange === 'function') UsResched.onChange();
    else location.reload();
  }

  async function call(payload) {
    var headers = await window.authedHeaders();
    var res = await fetch(FN_URL, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
    var data = {};
    try { data = await res.json(); } catch (e) { data = { error: 'Something went wrong. Please try again.' }; }
    if (!res.ok && !data.error) data.error = 'Something went wrong. Please try again.';
    return data;
  }

  function toast(msg, type) {
    if (window.showToast) window.showToast(msg, type || 'success');
  }

  var UsResched = {
    onChange: null,

    // Pending, unexpired requests for these sessions, keyed by session id.
    loadPending: async function (sessionIds) {
      var map = {};
      if (!sessionIds || sessionIds.length === 0) return map;
      try {
        var r = await _sb.from('reschedule_requests')
          .select('id, session_id, requested_by, requester_role, new_date, new_time, expires_at, is_late')
          .in('session_id', sessionIds).eq('status', 'pending');
        (r.data || []).forEach(function (rq) {
          if (new Date(rq.expires_at).getTime() > Date.now()) map[rq.session_id] = rq;
        });
      } catch (e) { /* the dashboard still works without requests */ }
      return map;
    },

    // Button or status note for one confirmed session row.
    rowHtml: function (s, req, myId) {
      injectStyles();
      if (!s || s.status !== 'confirmed') return '';
      var otherName = (s.student_id === myId) ? (s.tutor_name || 'your tutor') : (s.student_name || 'the student');
      if (!req) {
        var startsIn = s.starts_at ? new Date(s.starts_at).getTime() - Date.now() : Infinity;
        if ((s.reschedule_count || 0) >= MAX_MOVES || startsIn < 2 * 3600 * 1000) return '';
        return '<button class="btn-join" style="background:#fff;color:#1a6bff;border:1.5px solid #bfdbfe;margin-left:0.4rem;" onclick="UsResched.open(\'' + esc(s.id) + '\')">Reschedule</button>';
      }
      var when = esc(fmtWhen(req.new_date, req.new_time, s.timezone));
      if (req.requested_by === myId) {
        return '<div class="us-rs-note mine"><span class="us-rs-text">⏳ You asked to move this to <strong>' + when + '</strong>. Waiting for ' + esc(otherName) + ' to reply — the session stays at its current time until then.</span>'
          + '<button class="us-rs-btn ghost" onclick="UsResched.withdraw(\'' + esc(req.id) + '\', this)">Withdraw request</button></div>';
      }
      return '<div class="us-rs-note theirs"><span class="us-rs-text">🔄 ' + esc(otherName) + ' asked to move this session to <strong>' + when + '</strong>.</span>'
        + '<button class="us-rs-btn primary" onclick="UsResched.respond(\'' + esc(req.id) + '\', true, this)">Accept new time</button>'
        + '<button class="us-rs-btn ghost" onclick="UsResched.respond(\'' + esc(req.id) + '\', false, this)">Decline</button></div>';
    },

    open: async function (sessionId) {
      ensureModal();
      var body = document.getElementById('usRsBody');
      body.innerHTML = '<p style="font-size:0.86rem;color:#334155;">Loading…</p>';
      document.getElementById('usRsOverlay').style.display = 'flex';
      state.sessionId = sessionId;

      var sess = await _sb.auth.getSession();
      state.myId = sess && sess.data && sess.data.session ? sess.data.session.user.id : null;
      var r = await _sb.from('sessions')
        .select('id, student_id, tutor_id, student_name, tutor_name, subject, scheduled_date, scheduled_time, timezone, duration_minutes, starts_at, original_starts_at, reschedule_count, status')
        .eq('id', sessionId).maybeSingle();
      var s = r.data;
      if (!s || s.status !== 'confirmed') {
        body.innerHTML = '<p style="font-size:0.86rem;color:#dc2626;">This session can no longer be rescheduled.</p>';
        return;
      }
      state.session = s;
      var isStudent = s.student_id === state.myId;
      var otherName = isStudent ? (s.tutor_name || 'your tutor') : (s.student_name || 'the student');
      var movesLeft = Math.max(0, MAX_MOVES - (s.reschedule_count || 0));
      var original = new Date(s.original_starts_at || s.starts_at || (s.scheduled_date + 'T' + s.scheduled_time));
      var maxDate = new Date(original.getTime() + MAX_DAYS * 24 * 3600 * 1000);
      var startsIn = s.starts_at ? new Date(s.starts_at).getTime() - Date.now() : Infinity;

      var warn = '';
      if (isStudent && startsIn < 24 * 3600 * 1000) {
        warn = '<div class="us-rs-warn">⚠️ This session is less than 24 hours away. If ' + esc(otherName) + ' accepts the new time, the session stays non-refundable — cancelling it later won\'t be refunded.</div>';
      }

      body.innerHTML = ''
        + '<p style="font-size:0.86rem;color:#334155;line-height:1.5;margin:0;">Currently: <strong>' + esc(fmtWhen(s.scheduled_date, s.scheduled_time, s.timezone)) + '</strong>.<br>'
        + 'Your session stays at this time until ' + esc(otherName) + ' accepts the new one. No new payment is needed.</p>'
        + '<div class="us-rs-rules">Times are in <strong>' + esc(tzCity(s.timezone)) + ' time</strong>. A session can be moved up to ' + MAX_MOVES + ' times (' + movesLeft + ' left), to a date within ' + MAX_DAYS + ' days of the original, and at least 2 hours from now.</div>'
        + warn
        + '<div style="display:flex;gap:0.6rem;">'
        + '  <div style="flex:1;"><label for="usRsDate">New date</label><input type="date" id="usRsDate" min="' + ymd(new Date()) + '" max="' + ymd(maxDate) + '"></div>'
        + '  <div style="flex:1;"><label for="usRsTime">New time</label><input type="time" id="usRsTime"></div>'
        + '</div>'
        + '<div id="usRsError" role="alert" style="display:none;font-size:0.8rem;color:#dc2626;margin-top:0.6rem;"></div>'
        + '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem;">'
        + '  <button type="button" id="usRsSubmit" class="us-rs-btn primary" style="padding:0.7rem;font-size:0.86rem;">Send request</button>'
        + '  <button type="button" id="usRsCancel" class="us-rs-btn ghost" style="padding:0.6rem;font-size:0.84rem;">Keep the current time</button>'
        + '</div>';
      document.getElementById('usRsSubmit').addEventListener('click', UsResched.submit);
      document.getElementById('usRsCancel').addEventListener('click', close);
      var dateInput = document.getElementById('usRsDate');
      if (dateInput) dateInput.focus();
    },

    submit: async function () {
      if (state.busy || !state.session) return;
      var d = document.getElementById('usRsDate').value;
      var t = document.getElementById('usRsTime').value;
      var err = document.getElementById('usRsError');
      if (!d || !t) { err.textContent = 'Please choose both a date and a time.'; err.style.display = 'block'; return; }
      err.style.display = 'none';
      var btn = document.getElementById('usRsSubmit');
      state.busy = true; btn.disabled = true; btn.textContent = 'Sending…';
      var data = await call({ action: 'request', session_id: state.session.id, new_date: d, new_time: t });
      state.busy = false; btn.disabled = false; btn.textContent = 'Send request';
      if (data.error) { err.textContent = data.error; err.style.display = 'block'; return; }
      var s = state.session;
      var otherName = (s.student_id === state.myId) ? (s.tutor_name || 'your tutor') : (s.student_name || 'the student');
      document.getElementById('usRsBody').innerHTML = ''
        + '<p style="font-size:0.88rem;color:#334155;line-height:1.5;">✅ Request sent. We\'ve let ' + esc(otherName) + ' know. The session stays at its current time until they accept.</p>'
        + '<button type="button" id="usRsDone" class="us-rs-btn primary" style="width:100%;padding:0.7rem;margin-top:0.8rem;">Done</button>';
      document.getElementById('usRsDone').addEventListener('click', function () { close(); changed(); });
      window.usTrack && window.usTrack('reschedule_requested', {});
    },

    respond: async function (requestId, accept, btn) {
      if (btn) { btn.disabled = true; }
      var data = await call({ action: 'respond', request_id: requestId, accept: !!accept });
      if (data.error) {
        if (btn) btn.disabled = false;
        toast(data.error, 'error');
        changed();
        return;
      }
      toast(accept ? 'New time accepted — the session has been moved.' : 'Declined — the session stays at its current time.', 'success');
      window.usTrack && window.usTrack(accept ? 'reschedule_accepted' : 'reschedule_declined', {});
      changed();
    },

    withdraw: async function (requestId, btn) {
      if (btn) { btn.disabled = true; }
      var data = await call({ action: 'withdraw', request_id: requestId });
      if (data.error) {
        if (btn) btn.disabled = false;
        toast(data.error, 'error');
        return;
      }
      toast('Request withdrawn — the session stays at its current time.', 'success');
      changed();
    },

    close: close,
  };

  window.UsResched = UsResched;
})();
