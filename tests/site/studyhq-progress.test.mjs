// Study Campus "My progress" (studyhq-logic.js): this week against last week, counted only from
// what the student really did, the list of finished work, and research.
// Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../studyhq-logic.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(src, { window, globalThis: window });
const H = window.StudyHQ;

// Thursday 26 Nov 2026, 15:00. The week starts on Monday 23 Nov.
const now = new Date(2026, 10, 26, 15, 0);
const at = (d, h = 12) => new Date(2026, 10, d, h).toISOString();

test('this week and last week count only real, finished work', () => {
  const items = [
    { kind: 'task', status: 'done', done_at: at(23) },
    { kind: 'assignment', status: 'done', due_at: at(25, 23), done_at: at(24) },      // on time
    { kind: 'assignment', status: 'done', due_at: at(24, 9), done_at: at(24, 20) },    // late
    { kind: 'assignment', status: 'todo', due_at: at(30) },                           // not due yet: not counted
    { kind: 'task', status: 'done', done_at: at(17) },                                // last week
    { kind: 'note', created_at: at(25) },
    { kind: 'task', status: 'todo' },
  ];
  const log = [{ type: 'review', n: 12, at: at(26, 9) }, { type: 'review', n: 5, at: at(18) }, { type: 'focus', minutes: 25, at: at(26, 10) }];
  const p = H.productivity({ items, log, now });
  assert.equal(p.thisWeek.done, 3);
  assert.equal(p.thisWeek.due, 2);
  assert.equal(p.thisWeek.onTime, 1);
  assert.equal(p.thisWeek.quiz, 12);
  assert.equal(p.thisWeek.notes, 1);
  assert.equal(p.thisWeek.focus, 25);
  assert.equal(p.thisWeek.studyDays, 4); // Mon, Tue, Wed, Thu
  assert.deepEqual([...p.thisWeek.days], [1, 2, 1, 2, 0, 0, 0]);
  assert.equal(p.lastWeek.done, 1);
  assert.equal(p.lastWeek.quiz, 5);
  assert.equal(p.trend.done, 'up');
  assert.equal(p.dayOfWeek, 3);
  assert.equal(p.empty, false);
});

test('a new student sees an empty state, not zeros dressed up as a score', () => {
  const p = H.productivity({ items: [], log: [], now });
  assert.equal(p.empty, true);
  assert.equal(p.thisWeek.studyDays, 0);
});

test('accomplishments list finished work newest first and say where each came from', () => {
  const list = H.accomplishments({
    items: [
      { kind: 'assignment', title: 'Lab 5', status: 'done', due_at: at(20), done_at: at(19) },
      { kind: 'task', title: 'Read ch. 7', status: 'todo' },
      { kind: 'achievement', id: 'a1', title: 'Presented at seminar', created_at: at(25) },
      { kind: 'research', title: 'Price caps in Berlin', status: 'done', done_at: at(24) },
      { kind: 'research', title: 'Still going', status: 'todo', created_at: at(24) },
    ],
    exams: [{ id: 'x', title: 'STAT 201 final' }],
    tasksByExam: { x: [{ done_at: at(22) }, { done_at: at(21) }] },
    sessions: [{ status: 'completed', subject: 'Statistics', duration_minutes: 60, completed_at: at(18) }, { status: 'confirmed' }],
  });
  assert.deepEqual([...list.map((e) => e.type)], ['achievement', 'research', 'plan', 'assignment', 'lesson']);
  assert.equal(list[3].onTime, true);
  assert.equal(list[0].source, 'self');
  assert.equal(list[4].source, 'record');
});

test('research lists open topics first and counts their sources', () => {
  const r = H.researchList([
    { kind: 'research', id: 1, title: 'Done one', status: 'done', updated_at: at(26) },
    { kind: 'research', id: 2, title: 'Open one', status: 'todo', url: 'https://a.org/x', body: 'see https://b.org and https://a.org/x', updated_at: at(20) },
    { kind: 'note', id: 3, title: 'not research' },
  ]);
  assert.deepEqual([...r.map((x) => x.id)], [2, 1]);
  assert.equal(r[0].sources, 2);
});
