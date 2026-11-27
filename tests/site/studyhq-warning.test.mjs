// Study Campus early warning (studyhq-logic.js): one calm warning, only when the student's own plan
// shows they are falling behind. Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../../studyhq-logic.js', import.meta.url), 'utf8'), { window, globalThis: window });
const H = window.StudyHQ;
const now = new Date(2026, 10, 27, 15, 0);
const day = (n) => H.iso(H.addDays(H.startOfDay(now), n));
const at = (n, h = 12) => new Date(2026, 10, 27 + n, h).toISOString();
const exam = (id, n, code) => ({ id, title: code + ' exam', course_code: code, exam_date: day(n) });
const step = (n, done) => ({ day: day(n), topic: 'Topic ' + n, done_at: done ? at(n) : null });

test('on schedule: no warning', () => {
  const w = H.earlyWarning({ exams: [exam('a', 9, 'STAT')], tasksByExam: { a: [step(-3, true), step(-1, true), step(0), step(3)] }, items: [], now });
  assert.equal(w, null);
});

test('two revision steps overdue before an exam: warning with the first topic', () => {
  const w = H.earlyWarning({ exams: [exam('a', 9, 'STAT')], tasksByExam: { a: [step(-3), step(-1), step(2, false), step(5)] }, items: [], now });
  assert.equal(w.kind, 'exam');
  assert.equal(w.course, 'STAT');
  assert.equal(w.behind, 2);
  assert.equal(w.open, 4);
  assert.equal(w.daysLeft, 9);
  assert.equal(w.first, 'Topic -3');
  assert.equal(w.level, 'medium');
});

test('one step behind is enough when the exam is a week away or less; nearest exam wins', () => {
  const w = H.earlyWarning({ exams: [exam('a', 12, 'ECON'), exam('b', 5, 'CS')], tasksByExam: { a: [step(-2), step(-1)], b: [step(-1), step(2)] }, items: [], now });
  assert.equal(w.course, 'CS');
  assert.equal(w.level, 'high');
});

test('exams more than 21 days away or already past do not warn', () => {
  assert.equal(H.earlyWarning({ exams: [exam('a', 30, 'X'), exam('b', -1, 'Y')], tasksByExam: { a: [step(-3), step(-2)], b: [step(-3), step(-2)] }, items: [], now }), null);
});

test('three things slipped in the last week: a slipped warning; older ones are ignored', () => {
  const items = [
    { kind: 'task', title: 'A', planned_for: day(-2), status: 'todo' },
    { kind: 'assignment', title: 'B', due_at: at(-1), status: 'todo' },
    { kind: 'task', title: 'C', planned_for: day(-5), status: 'doing' },
    { kind: 'task', title: 'Old', planned_for: day(-12), status: 'todo' },
    { kind: 'task', title: 'Done', planned_for: day(-1), status: 'done' },
  ];
  const w = H.earlyWarning({ exams: [], tasksByExam: {}, items, now });
  assert.equal(w.kind, 'slipped');
  assert.equal(w.n, 3);
  assert.deepEqual([...w.titles], ['C', 'A']);
  items.pop(); items.splice(0, 1);
  assert.equal(H.earlyWarning({ exams: [], tasksByExam: {}, items, now }), null);
});

test('the warning names its first overdue step, and Do next puts that step first', () => {
  const exams = [exam('a', 9, 'STAT')];
  const tasksByExam = { a: [{ id: 's1', day: day(-2), topic: 'CI', done_at: null }, { id: 's2', day: day(-1), topic: 'Practice', done_at: null }] };
  const items = [{ id: 'i1', kind: 'task', title: 'Tight task', planned_for: day(0), estimate_min: 45, status: 'todo' },
                 { id: 'i2', kind: 'assignment', title: 'Late lab', due_at: at(-2), weight_pct: 30, status: 'todo' }];
  const w = H.earlyWarning({ exams, tasksByExam, items, now });
  assert.equal(w.firstId, 's1');
  const plan = H.dayPlan({ items, exams, tasksByExam, minutes: 60, now, pin: w.firstId });
  assert.equal(plan.steps[0].id, 's1');
  assert.ok(plan.steps[0].reasons.some((r) => r.k === 'behind'));
});
