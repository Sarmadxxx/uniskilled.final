/* UniSkilled — review display shared by the tutor profile and the tutor dashboard.
 *
 * - Reviewer shown as first name + last initial (privacy).
 * - "Verified lesson" badge when the review is tied to a paid lesson.
 * - Quick tags, the review text, and the tutor's public reply.
 * - On the tutor's own dashboard: reply / edit reply / remove reply.
 * - Fewer than 3 reviews → "New tutor" instead of an average.
 */
(function () {
  'use strict';
  var MIN_SHOWN = 3;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shortName(n) {
    var p = String(n || 'Student').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0].toUpperCase() + '.' : p[0];
  }
  function date(d) { try { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }

  function summary(reviews) {
    var n = (reviews || []).length;
    var avg = n ? reviews.reduce(function (a, r) { return a + r.rating; }, 0) / n : 0;
    return {
      count: n, avg: avg, isNew: n < MIN_SHOWN,
      label: n < MIN_SHOWN ? ('New tutor' + (n ? ' · ' + n + ' review' + (n === 1 ? '' : 's') : '')) : ('⭐ ' + avg.toFixed(1) + ' (' + n + ' reviews)'),
      rating: n < MIN_SHOWN ? 'New' : avg.toFixed(1),
    };
  }

  function itemHtml(r, opts) {
    var tags = (r.tags || []).map(function (t) {
      return '<span style="display:inline-block;font-size:0.72rem;font-weight:700;padding:3px 9px;border-radius:999px;background:#eef4ff;color:#1a56db;margin:0 4px 4px 0">' + esc(t) + '</span>';
    }).join('');
    var reply = r.tutor_reply
      ? '<div style="margin-top:0.6rem;padding:0.6rem 0.8rem;border-left:3px solid #1a6bff;background:#f8fafc;border-radius:6px">' +
          '<div style="font-size:0.72rem;font-weight:800;color:#334155;margin-bottom:2px">Reply from the tutor' + (r.tutor_reply_at ? ' · ' + esc(date(r.tutor_reply_at)) : '') + '</div>' +
          '<div style="font-size:0.85rem;color:#334155;white-space:pre-wrap">' + esc(r.tutor_reply) + '</div></div>'
      : '';
    var replyUi = opts && opts.replyable
      ? '<div class="us-reply" data-id="' + esc(r.id) + '" style="margin-top:0.5rem">' +
          '<button type="button" class="us-reply-open" style="background:none;border:0;color:#1a6bff;font-weight:700;font-size:0.8rem;cursor:pointer;padding:0">' + (r.tutor_reply ? 'Edit your reply' : 'Reply publicly') + '</button>' +
          '<div class="us-reply-form" style="display:none;margin-top:0.4rem">' +
            '<textarea maxlength="1000" style="width:100%;min-height:70px;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px;font:inherit;font-size:0.85rem" placeholder="Thank the student or add context. Your reply is public.">' + esc(r.tutor_reply || '') + '</textarea>' +
            '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">' +
              '<button type="button" class="us-reply-save" style="background:#1a6bff;color:#fff;border:0;border-radius:8px;padding:7px 14px;font-weight:800;font-size:0.8rem;cursor:pointer">Publish reply</button>' +
              (r.tutor_reply ? '<button type="button" class="us-reply-del" style="background:#fff;color:#b91c1c;border:1.5px solid #fecaca;border-radius:8px;padding:7px 12px;font-weight:700;font-size:0.8rem;cursor:pointer">Remove reply</button>' : '') +
              '<button type="button" class="us-reply-cancel" style="background:none;border:0;color:#64748b;font-weight:700;font-size:0.8rem;cursor:pointer">Cancel</button>' +
            '</div><div class="us-reply-err" style="color:#b91c1c;font-size:0.8rem;margin-top:4px"></div></div></div>'
      : '';
    return '<div class="review-item" style="padding:1rem 1.4rem;border-bottom:1px solid var(--border,#e2e8f0)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:0.25rem">' +
        '<span style="font-weight:800">' + esc(shortName(r.student_name)) +
          (r.session_id ? ' <span title="This student booked and paid for a lesson with this tutor" style="font-size:0.68rem;font-weight:800;color:#059669;background:#ecfdf5;padding:2px 7px;border-radius:999px;margin-left:4px">✓ Verified lesson</span>' : '') + '</span>' +
        '<span style="font-size:0.72rem;color:#94a3b8">' + esc(date(r.created_at)) + (r.updated_at ? ' · edited' : '') + '</span>' +
      '</div>' +
      '<div style="color:#f59e0b;letter-spacing:1px;margin-bottom:0.35rem" aria-label="' + r.rating + ' out of 5">' + '★'.repeat(r.rating) + '<span style="color:#e2e8f0">' + '★'.repeat(5 - r.rating) + '</span></div>' +
      (tags ? '<div>' + tags + '</div>' : '') +
      (r.comment ? '<div style="font-size:0.88rem;color:#334155;white-space:pre-wrap;line-height:1.5">' + esc(r.comment) + '</div>' : '') +
      reply + replyUi +
    '</div>';
  }

  function listHtml(reviews, opts) { return (reviews || []).map(function (r) { return itemHtml(r, opts); }).join(''); }

  // Wire up the reply buttons (tutor dashboard). onDone() reloads the list.
  function bindReplies(container, sb, onDone) {
    container.querySelectorAll('.us-reply').forEach(function (box) {
      var form = box.querySelector('.us-reply-form'), err = box.querySelector('.us-reply-err');
      box.querySelector('.us-reply-open').onclick = function () { form.style.display = form.style.display === 'none' ? 'block' : 'none'; };
      box.querySelector('.us-reply-cancel').onclick = function () { form.style.display = 'none'; };
      async function save(text) {
        err.textContent = '';
        var res = await sb.rpc('reply_to_review', { p_review_id: box.dataset.id, p_reply: text });
        if (res.error) { err.textContent = 'Your reply couldn\'t be saved. Please try again.'; return; }
        onDone && onDone();
      }
      box.querySelector('.us-reply-save').onclick = function () { save(box.querySelector('textarea').value); };
      var del = box.querySelector('.us-reply-del');
      if (del) del.onclick = function () { if (confirm('Remove your public reply?')) save(''); };
    });
  }

  window.UsReviews = { summary: summary, listHtml: listHtml, bindReplies: bindReplies, shortName: shortName, MIN_SHOWN: MIN_SHOWN };
})();
