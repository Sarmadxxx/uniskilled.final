// Notification center (notifications.js): every notification type must land in the right
// dashboard section and open the right page. Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../notifications.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(src, { window, document: { title: '' } });
const { classify, destination } = window.USKNotify;

test('types map to the right section and colour', () => {
  const cases = {
    booking_request: ['requests', 'bookings'],
    request_nudge: ['requests', 'bookings'],
    reschedule_requested: ['requests', 'bookings'],
    payment_received: ['sessions', 'payments'],
    awaiting_payment: ['sessions', 'payments'],
    payment_expired: ['sessions', 'alert'],
    booking_confirmed: ['sessions', 'bookings'],
    session_cancelled: ['sessions', 'alert'],
    call_started: ['sessions', 'bookings'],
    dispute_opened: ['sessions', 'alert'],
    new_message: ['messages', 'messages'],
    group_session_cancelled: ['groupSessions', 'alert'],
    new_review: ['reviews', 'reviews'],
    rate_reminder: ['reviews', 'reviews'],
    referral_qualified: ['referrals', 'payments'],
    course_request_match: ['subjectRequests', 'bookings'],
    university_verified: ['other', 'other'],
  };
  for (const [type, [section, cat]] of Object.entries(cases)) {
    assert.deepEqual({ ...classify(type) }, { section, cat }, type);
  }
});

test('tutor: bare dashboard links open the matching tab', () => {
  const d = (type) => destination({ type, link: 'tutor-dashboard.html' }, 'tutor');
  assert.equal(d('booking_request'), 'tutor-dashboard.html?tab=requests');
  assert.equal(d('payment_received'), 'tutor-dashboard.html?tab=sessions');
  assert.equal(d('group_session_cancelled'), 'tutor-dashboard.html?tab=groupSessions');
  assert.equal(d('new_review'), 'tutor-dashboard.html?tab=reviews');
  assert.equal(d('university_verified'), 'tutor-dashboard.html?tab=overview');
});

test('specific links are kept (pay, classroom, rate, admin)', () => {
  for (const link of ['complete-payment.html?session=abc', 'classroom.html?session=abc', 'rate-lesson.html?session=abc', 'admin.html?tab=transactions']) {
    assert.equal(destination({ type: 'awaiting_payment', link }, 'student'), link);
  }
});

test('messages always open the inbox; student group alerts open group sessions', () => {
  assert.equal(destination({ type: 'new_message', link: '' }, 'student'), 'messages.html');
  assert.equal(destination({ type: 'new_message', link: 'tutor-dashboard.html' }, 'tutor'), 'messages.html');
  assert.equal(destination({ type: 'group_session_cancelled', link: 'student-dashboard.html' }, 'student'), 'group-sessions.html');
  assert.equal(destination({ type: 'payment_confirmed', link: '' }, 'student'), 'student-dashboard.html');
});
