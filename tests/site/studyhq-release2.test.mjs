// Study HQ release 2 (studyhq-logic.js): one exam list from three sources, deadlines grouped the way
// students think about them, start-by dates, busy weeks, a review cap, the one-line add, the phone
// calendar file, tutor ranking and the "Exam help" box, which never says a student is struggling.
// Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../studyhq-logic.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(src, { window, globalThis: window });
const H = window.StudyHQ;
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

const NOW = new Date(2026, 10, 26, 14, 0); // Thu 26 Nov 2026, 14:00 local
const at = (d, h = 23, m = 59) => new Date(2026, 10, d, h, m).toISOString(); // a day in Nov 2026 (32 = 2 Dec)
const day = n => H.iso(H.addDays(new Date(2026, 10, 26), n));
const COURSES = ['STAT 201', 'ECON 110', 'EUS 140', 'CS 102'];

/* ------------------------------------------------------------ mergeExams */
test('mergeExams: the same exam from planner, course and lesson shows once, planner wins', () => {
  const ex = H.mergeExams({
    planner: [{ id: 'p1', title: 'STAT final', course_code: 'STAT 201', course_key: 'stat201', exam_date: day(12), topics: ['Tests'] }],
    courses: [{ id: 'c1', courseId: 'f1', title: 'STAT 201', course_code: 'STAT 201', course_key: 'stat201', exam_date: day(12) },
              { id: 'c2', courseId: 'f2', title: 'ECON 110', course_code: 'ECON 110', course_key: 'econ110', exam_date: day(8) }],
    sessions: [{ id: 's1', subject: 'Stat 201', exam_date: day(12) }, { id: 's2', subject: 'Chemistry', exam_date: day(30) }, { id: 's3', subject: 'X', exam_date: null }]
  });
  assert.equal(ex.length, 3);
  same(ex.map(e => e.course_key), ['econ110', 'stat201', 'chemistry']);
  const stat = ex.find(e => e.course_key === 'stat201');
  assert.equal(stat.id, 'p1');
  assert.equal(stat.source, 'planner');
  same(stat.sources.sort(), ['course', 'lesson', 'planner']);
  assert.equal(stat.courseId, 'f1', 'keeps the course link so the date can still be changed there');
  same(stat.topics, ['Tests']);
});

test('mergeExams: two exams of one course on different days stay two exams', () => {
  const ex = H.mergeExams({ courses: [{ id: 'a', title: 'ECON', course_code: 'ECON 110', exam_date: day(8) }],
                            planner: [{ id: 'b', title: 'ECON final', course_code: 'ECON 110', exam_date: day(40) }] });
  assert.equal(ex.length, 2);
});

/* ------------------------------------------------------------ startBy */
test('startBy: never after the due date, never in the past', () => {
  const sb = H.startBy({ kind: 'assignment', due_at: at(30, 12, 0), estimate_min: 45 }, { now: NOW });
  assert.equal(sb.iso, '2026-11-28'); // 1 day of work + 1 spare day before Mon 30 Nov
  const tight = H.startBy({ kind: 'assignment', due_at: at(27), estimate_min: 600 }, { now: NOW });
  assert.equal(tight.iso, H.iso(H.startOfDay(NOW)));
  assert.equal(tight.today, true);
  assert.equal(H.startBy({ kind: 'task' }, { now: NOW }), null);
  const noEst = H.startBy({ kind: 'assignment', due_at: at(48) }, { now: NOW }); // default 4 h estimate
  assert.ok(noEst.date < new Date(at(48)));
});

/* ------------------------------------------------------------ deadlineList */
const ITEMS = [
  { id: 'lab3', kind: 'assignment', title: 'Lab 3 reflection', course_label: 'CS 102', due_at: at(24), status: 'todo' },
  { id: 'ps7', kind: 'assignment', title: 'Problem set 7', course_label: 'STAT 201', due_at: at(27), status: 'doing', weight_pct: 10, estimate_min: 100 },
  { id: 'read', kind: 'assignment', title: 'Reading response', course_label: 'ECON 110', due_at: at(30, 12, 0), status: 'todo', estimate_min: 45 },
  { id: 'old', kind: 'assignment', title: 'Ancient', due_at: at(-10), status: 'todo' },
  { id: 'done', kind: 'assignment', title: 'Finished', due_at: at(27), status: 'done' },
  { id: 'note', kind: 'note', title: 'A note', due_at: at(27) },
  { id: 'essay', kind: 'assignment', title: 'Essay', course_label: 'EUS 140', due_at: new Date(2026, 11, 18, 23, 59).toISOString(), status: 'todo', estimate_min: 600, weight_pct: 30 }
];
const EXAMS = [{ id: 'econx', title: 'Midterm', course_code: 'ECON 110', exam_date: day(8) },
               { id: 'statx', title: 'Final', course_code: 'STAT 201', exam_date: day(12) },
               { id: 'past', title: 'Old exam', course_code: 'CS 102', exam_date: day(-2) }];
const TASKS = { statx: [{ id: 't1', topic: 'Hypothesis tests', done_at: null, unsure: true }, { id: 't2', topic: 'Sampling', done_at: '2026-11-20', unsure: false }] };

test('deadlineList: groups overdue, this week, next week, later; leaves out done, notes and very old items', () => {
  const L = H.deadlineList({ items: ITEMS, exams: EXAMS, tasksByExam: TASKS, now: NOW });
  const g = Object.fromEntries(L.groups.map(x => [x.key, x.rows.map(r => r.id)]));
  same(g.overdue, ['lab3']);
  same(g.week, ['ps7']); // due 23:59 tomorrow
  same(g.next, ['read', 'econx']);
  same(g.later, ['statx', 'essay']);
  assert.equal(L.doneThisWeek, 1);
  assert.equal(L.oldOverdue, 1);
  same(L.counts, { all: 6, exam: 2, work: 4, soon: 2 });
  const stat = L.rows.find(r => r.id === 'statx');
  same(stat.plan, { done: 1, total: 2 });
  same(stat.unsure, ['Hypothesis tests']);
  assert.equal(L.rows.find(r => r.id === 'read').startBy.iso, '2026-11-28');
  assert.equal(L.rows.find(r => r.id === 'ps7').startBy, null, 'no start-by once the start day is today');
});

test('deadlineList: an exam today is in this week with 0 days, never negative', () => {
  const L = H.deadlineList({ exams: [{ id: 'x', title: 'Today', course_code: 'A 1', exam_date: day(0) }], now: NOW });
  assert.equal(L.rows[0].days, 0);
  assert.equal(L.rows[0].group, 'week');
});

/* ------------------------------------------------------------ busyWeeks */
test('busyWeeks: exam counts 2, assignment 1, small task 0.5, and flags the busiest week', () => {
  const L = H.deadlineList({ items: ITEMS.concat([{ id: 'lab4', kind: 'assignment', title: 'Lab 4', due_at: at(32), status: 'todo' },
    { id: 'tk', kind: 'task', title: 'Email prof', due_at: at(31), status: 'todo' }]), exams: EXAMS, now: NOW });
  const B = H.busyWeeks({ rows: L.rows, now: NOW });
  assert.equal(B.weeks.length, 6);
  assert.equal(B.weeks[0].iso, '2026-11-23');
  assert.equal(B.weeks[0].points, 1); // ps7 (lab3 is overdue, not counted)
  assert.equal(B.weeks[1].points, 4.5); // read 1 + lab4 1 + task 0.5 + ECON exam 2
  assert.equal(B.weeks[1].busy, true);
  assert.equal(B.busiest, 1);
  assert.equal(B.weeks[4].points, 0);
});

/* ------------------------------------------------------------ capReview */
test('capReview: at most 15 cards today, the rest wait', () => {
  const q = { due: Array.from({ length: 12 }, (_, i) => ({ id: 'd' + i })), fresh: Array.from({ length: 10 }, (_, i) => ({ id: 'n' + i })), waitingNew: 4 };
  const c = H.capReview(q);
  assert.equal(c.total, 15);
  assert.equal(c.cards[0].id, 'd0', 'due cards come first');
  assert.equal(c.waiting, 7 + 4);
  assert.equal(H.capReview({ due: [], fresh: [] }).minutes, 0);
});

/* ------------------------------------------------------------ skyPeriod */
test('skyPeriod follows the clock', () => {
  same([4, 5, 11, 12, 16, 17, 20, 21, 0].map(H.skyPeriod),
    ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
});

/* ------------------------------------------------------------ parseQuickAdd */
test('parseQuickAdd understands everyday phrases and never guesses a missing date', () => {
  const P = t => { const r = H.parseQuickAdd(t, { now: NOW, courses: COURSES }); return [r.ok, r.kind, r.title, r.course_label, r.date, r.time, r.weight_pct]; };
  same(P('EUS essay due 18 Dec 30%'), [true, 'assignment', 'Essay', 'EUS 140', '2026-12-18', null, 30]);
  same(P('STAT exam 8.12. 10:00'), [true, 'exam', 'Exam', 'STAT 201', '2026-12-08', '10:00', null]);
  same(P('lab 4 cs102 friday'), [true, 'assignment', 'Lab 4', 'CS 102', '2026-11-27', null, null]);
  same(P('ECON reading response Mon 12:00 5%'), [true, 'assignment', 'Reading response', 'ECON 110', '2026-11-30', '12:00', 5]);
  same(P('Problem set 8 due tomorrow'), [true, 'assignment', 'Problem set 8', null, '2026-11-27', null, null]);
  same(P('midterm ECON 110 on 4 December at 09:00'), [true, 'exam', 'Midterm', 'ECON 110', '2026-12-04', '09:00', null]);
  same(P('reflection CS 102 in 3 days'), [true, 'assignment', 'Reflection', 'CS 102', '2026-11-29', null, null]);
  same(P('Hausarbeit bis 15.01.2027 40%'), [true, 'assignment', 'Hausarbeit', null, '2027-01-15', null, 40]);
  same(P('quiz 2026-12-03'), [true, 'assignment', 'Quiz', null, '2026-12-03', null, null]);
  same(P('Presentation next tuesday 15%'), [true, 'assignment', 'Presentation', null, '2026-12-01', null, 15]);
  same(P('oral exam EUS 21 Jan'), [true, 'exam', 'Oral exam', 'EUS 140', '2027-01-21', null, null]);
  same(P('Klausur MATH 101 am 12.02.'), [true, 'exam', 'Klausur', 'MATH 101', '2027-02-12', null, null]);
  const none = H.parseQuickAdd('Essay', { now: NOW, courses: COURSES });
  assert.equal(none.ok, false);
  same(none.missing, ['date']);
  assert.equal(H.parseQuickAdd('   ', { now: NOW }).ok, false);
});

/* ------------------------------------------------------------ toICS */
test('toICS: a valid calendar file with escaped text, folded lines and no overdue items', () => {
  const L = H.deadlineList({ items: ITEMS, exams: EXAMS, now: NOW });
  const ics = H.toICS(L.rows, { now: NOW });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, L.rows.length - 1); // lab3 is overdue
  assert.ok(!ics.includes('Lab 3'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261204'));
  assert.ok(ics.includes('TRIGGER:-P1D'));
  assert.ok(ics.split('\r\n').every(l => l.length <= 75));
  const odd = H.toICS([{ type: 'assignment', id: 'z', title: 'A, B; C\\D', course: null, due: new Date(at(28)), group: 'week', weight: null }], { now: NOW });
  assert.ok(odd.includes('SUMMARY:Due: A\\, B\\; C\\\\D'));
});

/* ------------------------------------------------------------ rankTutors */
test('rankTutors: only real course matches, no suspended or inactive tutors, stars only from 3 reviews, same order as course.html', () => {
  const T = H.rankTutors({
    rows: [{ tutor_id: 'a', course_code: 'STAT 201' }, { tutor_id: 'b', course_code: 'STAT 201', university: 'FU Berlin' }, { tutor_id: 'c', course_code: 'STAT 201' }, { tutor_id: 'd', course_code: 'STAT 201' }],
    profiles: [{ user_id: 'a', is_active: true, hourly_rate: 20, university_verified_at: '2026-01-01' }, { user_id: 'b', is_active: true, hourly_rate: 18 },
               { user_id: 'c', is_active: false }, { user_id: 'd', is_active: true }, { user_id: 'e', is_active: true }],
    people: [{ id: 'a', full_name: 'Ann' }, { id: 'b', full_name: 'Ben' }, { id: 'c', full_name: 'Cy' }, { id: 'e', full_name: 'Eve' }], // d suspended
    reviews: [{ tutor_id: 'a', rating: 5 }, { tutor_id: 'a', rating: 5 }, { tutor_id: 'a', rating: 4 }, { tutor_id: 'b', rating: 5 }],
    myUni: 'FU Berlin'
  });
  same(T.map(t => t.id), ['b', 'a']); // own university first, then verified
  assert.equal(T.find(t => t.id === 'a').stars, 4.7);
  assert.equal(T.find(t => t.id === 'b').stars, null);
});

/* ------------------------------------------------------------ examHelp */
test('examHelp: a tutor card only on a real match, otherwise an ask-for-a-tutor card; never struggle wording', () => {
  const tutor = { id: 'a', name: 'Ann' };
  const E = H.examHelp({ exams: H.mergeExams({ courses: EXAMS.map(x => ({ ...x, course_key: H.courseKey(x.course_code) })) }), tutorsByKey: { stat201: [tutor] },
                         tasksByExam: TASKS, requested: ['econ110'], finished: ['MATH 101'], now: NOW });
  assert.equal(E.cards.length, 2);
  assert.equal(E.cards[0].type, 'request');
  assert.equal(E.cards[0].course, 'ECON 110');
  assert.equal(E.cards[0].requested, true);
  assert.equal(E.cards[1].type, 'tutor');
  assert.equal(E.cards[1].tutor.id, 'a');
  same(E.invite, { course: 'MATH 101' });
  const far = H.examHelp({ exams: [{ id: 'z', title: 'Far', course_code: 'Z 1', exam_date: day(60) }], now: NOW });
  assert.equal(far.cards.length, 0, 'nothing for exams more than 6 weeks away');
  assert.ok(!/struggl|behind|failing|weak/i.test(JSON.stringify(E)));
});
