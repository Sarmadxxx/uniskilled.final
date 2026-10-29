// Exam planner (exam-plan.js): the revision plan must stay inside the study days the student picked,
// never land on or after the exam day, cover every topic, and end with practice.
// Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../exam-plan.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(src, { window, globalThis: window });
const { buildPlan, parse } = window.UskExamPlan;
const dow = s => { const w = parse(s).getDay(); return w === 0 ? 7 : w; };

const TOPICS = ['Limits', 'Derivatives', 'Integrals', 'Series', 'Vectors'];

test('a four-week plan covers every topic: learned, reviewed, then practice at the end', () => {
  // 2026-11-02 is a Monday; exam four weeks later
  const r = buildPlan({ topics: TOPICS, examDate: '2026-11-30', studyDays: [1, 2, 3, 4, 5], today: '2026-11-02' });
  assert.equal(r.ok, true);
  for (const t of TOPICS) {
    assert.ok(r.tasks.some(x => x.topic === t && x.kind === 'learn'), `${t} is learned`);
    assert.ok(r.tasks.filter(x => x.topic === t && x.kind === 'review').length >= 2, `${t} is reviewed twice`);
  }
  const last = r.tasks[r.tasks.length - 1];
  assert.equal(last.kind, 'practice');
  assert.equal(last.day, '2026-11-27');                       // last Friday before the Monday exam
  // learning a topic always comes before reviewing it
  for (const t of TOPICS) {
    const learn = r.tasks.find(x => x.topic === t && x.kind === 'learn').day;
    assert.ok(r.tasks.filter(x => x.topic === t && x.kind === 'review').every(x => x.day > learn));
  }
});

test('only the chosen weekdays, never on or after the exam day, never one topic twice a day', () => {
  const r = buildPlan({ topics: TOPICS, examDate: '2026-12-15', studyDays: [2, 4, 6], today: '2026-11-02' });
  assert.equal(r.ok, true);
  const seen = new Set();
  for (const t of r.tasks) {
    assert.ok([2, 4, 6].includes(dow(t.day)), `${t.day} is a chosen weekday`);
    assert.ok(t.day < '2026-12-15' && t.day >= '2026-11-02');
    const k = t.day + t.topic;
    assert.ok(!seen.has(k), `no duplicate ${k}`);
    seen.add(k);
  }
});

test('an exam tomorrow still gets a plan for today', () => {
  const r = buildPlan({ topics: TOPICS, examDate: '2026-11-03', studyDays: [1, 2, 3, 4, 5, 6, 7], today: '2026-11-02' });
  assert.equal(r.ok, true);
  assert.equal(r.days.length, 1);
  assert.ok(r.tasks.every(t => t.day === '2026-11-02'));
  assert.equal(r.tasks.filter(t => t.kind === 'learn').length, TOPICS.length);
});

test('topics already learned are not scheduled to learn again, only to review', () => {
  const r = buildPlan({ topics: TOPICS, examDate: '2026-11-30', studyDays: [1, 2, 3, 4, 5], today: '2026-11-16', learned: ['limits', 'Derivatives'] });
  assert.equal(r.ok, true);
  assert.ok(!r.tasks.some(t => t.kind === 'learn' && ['Limits', 'Derivatives'].includes(t.topic)));
  assert.ok(r.tasks.some(t => t.kind === 'review' && t.topic === 'Limits'));
});

test('clear messages for impossible plans', () => {
  assert.equal(buildPlan({ topics: [], examDate: '2026-11-30', studyDays: [1], today: '2026-11-02' }).ok, false);
  assert.equal(buildPlan({ topics: TOPICS, examDate: '2026-11-02', studyDays: [1], today: '2026-11-02' }).ok, false);
  assert.equal(buildPlan({ topics: TOPICS, examDate: '2026-11-30', studyDays: [], today: '2026-11-02' }).ok, false);
  // only Sundays chosen, exam on Saturday the same week → no study day left
  const r = buildPlan({ topics: TOPICS, examDate: '2026-11-07', studyDays: [7], today: '2026-11-02' });
  assert.equal(r.ok, false);
  assert.match(r.error, /no study days/i);
  assert.equal(buildPlan({ topics: Array.from({ length: 31 }, (_, i) => 'T' + i), examDate: '2026-11-30', studyDays: [1], today: '2026-11-02' }).ok, false);
});

test('duplicate topics are merged and the plan stays well under the 400-task limit', () => {
  const many = Array.from({ length: 30 }, (_, i) => 'Topic ' + i).concat(['topic 0']);
  const r = buildPlan({ topics: many, examDate: '2027-06-30', studyDays: [1, 2, 3, 4, 5, 6, 7], today: '2026-11-02' });
  assert.equal(r.ok, true);
  assert.equal(new Set(r.tasks.filter(t => t.kind === 'learn').map(t => t.topic)).size, 30);
  assert.ok(r.tasks.length < 400);
});
