// Study HQ (studyhq-logic.js): courses join up correctly, "What next" is explainable and
// deterministic, never suggests work that cannot be done now, and achievements never call a
// self-reported item verified.
// Run: node --test tests/site/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../studyhq-logic.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(src, { window, globalThis: window });
const H = window.StudyHQ;
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

const NOW = new Date(2026, 10, 23, 9, 0); // Mon 23 Nov 2026, 09:00 local
const inDays = (n, h = 23) => new Date(2026, 10, 23 + n, h, 0).toISOString();
const day = n => H.iso(new Date(2026, 10, 23 + n));
let seq = 0;
const item = o => ({ id: 'i' + (++seq), kind: 'assignment', status: 'todo', created_at: '2026-11-01T00:00:00Z', ...o });

test('courseKey matches the database normalisation', () => {
  assert.equal(H.courseKey('MATH 101'), 'math101');
  assert.equal(H.courseKey(' Stat-101 '), 'stat101');
  assert.equal(H.courseKey('Économie'), 'économie');
  assert.equal(H.courseKey('إحصاء ١٠١'), 'إحصاء١٠١');
  assert.equal(H.courseKey('  '), null);
});

test('buildCourses joins follows, exams, items and lessons by course key', () => {
  const r = H.buildCourses({
    follows: [{ id: 'f1', course_code: 'STAT 101', course_key: 'stat101' }],
    exams: [{ id: 'e1', title: 'Stats final', course_code: 'stat101', exam_date: day(10) }],
    items: [item({ course_label: 'Stat101', title: 'Problem set 3' }), item({ course_label: 'History 2', title: 'Essay' })],
    sessions: [{ subject: 'STAT 101', status: 'completed' }, { subject: 'Chemistry', status: 'confirmed' }, { subject: 'Physics', status: 'declined' }]
  });
  same(r.list.map(c => c.key), ['stat101', 'history2']); // followed course first
  const stat = r.byKey.stat101;
  assert.equal(stat.label, 'STAT 101');
  assert.equal(stat.exams.length, 1);
  assert.equal(stat.items.length, 1);
  assert.equal(stat.sessions.length, 1);
  same(r.suggestions.map(s => s.key), ['chemistry']); // declined lessons are ignored
});

test('courseProgress counts assignments and revision, lists unsure topics once', () => {
  const c = H.buildCourses({
    follows: [{ id: 'f1', course_code: 'BIO 1' }],
    exams: [{ id: 'e1', title: 'Bio exam', course_code: 'BIO 1', exam_date: day(5) }],
    items: [item({ course_label: 'BIO 1', status: 'done' }), item({ course_label: 'BIO 1', due_at: inDays(2) }), item({ course_label: 'BIO 1', kind: 'note', title: 'n' })]
  }).byKey.bio1;
  const tasks = { e1: [{ id: 't1', topic: 'Cells', done_at: '2026-11-20', unsure: false }, { id: 't2', topic: 'Genes', unsure: true }, { id: 't3', topic: 'Genes', unsure: true }] };
  const p = H.courseProgress(c, tasks, NOW);
  assert.equal(p.total, 5);
  assert.equal(p.done, 2);
  assert.equal(p.pct, 40);
  same(p.unsure.map(u => u.topic), ['Genes']);
  assert.equal(p.next.kind, 'assignment');
  assert.equal(p.notes, 1);
});

// ---------------------------------------------------------------- What next scenarios
const wn = o => H.whatNext({ now: NOW, minutesFree: 60, ...o });

test('no work at all: asks the student to add something', () => {
  assert.equal(wn({ items: [] }).state, 'no_items');
});

test('under 15 minutes: no suggestion', () => {
  const r = wn({ items: [item({ due_at: inDays(1) })], minutesFree: 10 });
  assert.equal(r.state, 'too_little_time');
  assert.equal(r.pick, null);
});

test('very limited time: the session never exceeds the time the student has', () => {
  const r = wn({ minutesFree: 20, items: [item({ title: 'Essay', due_at: inDays(4), estimate_min: 180 }), item({ kind: 'task', title: 'Reading', due_at: inDays(2), estimate_min: 20 })] });
  assert.equal(r.pick.title, 'Reading');
  assert.ok(r.pick.minutes <= 20);
  r.alternates.forEach(a => assert.ok(a.minutes <= 20));
});

test('several urgent deadlines: the heavier one wins', () => {
  const r = wn({ items: [item({ title: 'A', due_at: inDays(1), weight_pct: 10 }), item({ title: 'B', due_at: inDays(1), weight_pct: 40 }), item({ title: 'C', due_at: inDays(1) })] });
  assert.equal(r.pick.title, 'B');
  assert.ok(r.pick.reasons.some(x => x.k === 'weight'));
});

test('a heavy assessment far away does not beat a quiz due tomorrow', () => {
  const r = wn({ items: [item({ title: 'Project', due_at: inDays(20), weight_pct: 50 }), item({ title: 'Quiz', due_at: inDays(1), weight_pct: 5, estimate_min: 30 })] });
  assert.equal(r.pick.title, 'Quiz');
});

test('missing estimate: uses a default and says so', () => {
  const r = wn({ items: [item({ title: 'Report', due_at: inDays(3) })] });
  assert.ok(r.pick.reasons.some(x => x.k === 'no_estimate'));
});

test('unsure exam topics are lifted', () => {
  const r = wn({
    items: [item({ title: 'Essay', due_at: inDays(10), estimate_min: 60 })],
    exams: [{ id: 'e1', title: 'Calc final', course_code: 'MATH 1', exam_date: day(9) }],
    tasksByExam: { e1: [{ id: 't1', topic: 'Integrals', day: day(0), kind: 'learn', unsure: true }] }
  });
  assert.equal(r.pick.type, 'exam_task');
  assert.ok(r.pick.reasons.some(x => x.k === 'unsure'));
});

test('blocked work is held, never picked', () => {
  const r = wn({ items: [item({ title: 'Lab', due_at: inDays(0), status: 'blocked' }), item({ title: 'Read', due_at: inDays(5), estimate_min: 30 })] });
  assert.equal(r.pick.title, 'Read');
  assert.equal(r.held[0].reason, 'blocked');
});

test('only blocked work: nothing to pick', () => {
  const r = wn({ items: [item({ title: 'Lab', due_at: inDays(0), status: 'blocked' })] });
  assert.equal(r.pick, null);
  assert.equal(r.held.length, 1);
});

test('work overdue by more than a week is held for the student to confirm', () => {
  const r = wn({ items: [item({ title: 'Old', due_at: inDays(-9) }), item({ title: 'New', due_at: inDays(3), estimate_min: 30 })] });
  assert.equal(r.pick.title, 'New');
  assert.equal(r.held[0].reason, 'long_overdue');
});

test('revision planned for later days is not offered today', () => {
  const r = wn({ exams: [{ id: 'e1', title: 'X', exam_date: day(20) }], tasksByExam: { e1: [{ id: 't1', topic: 'Later', day: day(3), kind: 'learn' }] }, items: [item({ title: 'Now', due_at: inDays(2), estimate_min: 30 })] });
  assert.equal(r.pick.title, 'Now');
  assert.equal(r.alternates.length, 0);
});

test('already ahead: says so instead of inventing work', () => {
  const r = wn({ items: [item({ title: 'Far', due_at: inDays(25), estimate_min: 60 })] });
  assert.equal(r.state, 'ahead');
  assert.equal(r.pick, null);
});

test('not enough time left before the deadline is flagged at risk', () => {
  const r = wn({ dailyMinutes: 120, items: [item({ title: 'Thesis chapter', due_at: new Date(2026, 10, 24, 9).toISOString(), estimate_min: 600 })] });
  assert.ok(r.pick.reasons.some(x => x.k === 'at_risk'));
});

test('equal scores: deterministic order (weight, then older, then id), whatever the input order', () => {
  const a = item({ id: 'b', title: 'B', due_at: inDays(2), estimate_min: 30, created_at: '2026-11-02T00:00:00Z' });
  const b = item({ id: 'a', title: 'A', due_at: inDays(2), estimate_min: 30, created_at: '2026-11-02T00:00:00Z' });
  const c = item({ id: 'c', title: 'C', due_at: inDays(2), estimate_min: 30, created_at: '2026-11-01T00:00:00Z' });
  const first = wn({ items: [a, b, c] });
  for (let i = 0; i < 50; i++) {
    const shuffled = [a, b, c].sort(() => Math.random() - 0.5);
    const r = wn({ items: shuffled });
    assert.deepEqual([r.pick.id, ...r.alternates.map(x => x.id)], [first.pick.id, ...first.alternates.map(x => x.id)]);
  }
  same([first.pick.id, ...first.alternates.map(x => x.id)], ['c', 'a', 'b']);
});

test('alternates prefer other courses', () => {
  const r = wn({ items: [
    item({ title: 'M1', course_label: 'Math', due_at: inDays(1), estimate_min: 30, weight_pct: 30 }),
    item({ title: 'M2', course_label: 'Math', due_at: inDays(1), estimate_min: 30, weight_pct: 25 }),
    item({ title: 'H1', course_label: 'History', due_at: inDays(4), estimate_min: 30 })
  ] });
  assert.equal(r.pick.title, 'M1');
  assert.equal(r.alternates[0].title, 'H1');
});

// ---------------------------------------------------------------- week and achievements
test('weekPlan places deadlines, plans, revision and lessons on the right days', () => {
  const days = H.weekPlan({
    start: NOW,
    items: [item({ kind: 'task', planned_for: day(1), estimate_min: 45 }), item({ due_at: inDays(2, 12) })],
    exams: [{ id: 'e1', title: 'Exam', exam_date: day(6) }],
    tasksByExam: { e1: [{ id: 't', topic: 'x', day: day(0) }] },
    sessions: [{ status: 'confirmed', scheduled_date: day(3), scheduled_time: '10:00', duration_minutes: 60 }, { status: 'cancelled', scheduled_date: day(3) }]
  });
  assert.equal(days.length, 7);
  assert.equal(days[0].entries[0].type, 'revision');
  assert.equal(days[1].minutes, 45);
  assert.equal(days[2].entries[0].type, 'due');
  assert.equal(days[3].entries.length, 1);
  assert.equal(days[6].entries[0].type, 'exam');
});

test('achievements: only university verification is "verified"; self-reported stays self-reported', () => {
  const list = H.achievements({
    user: { university_email_verified: true }, profile: { university: 'TU Berlin' },
    sessions: [{ status: 'completed', duration_minutes: 60 }, { status: 'confirmed' }],
    items: [item({ kind: 'achievement', title: 'Dean’s list' }), item({ status: 'done' })],
    exams: [{ id: 'e1', title: 'Calc' }], tasksByExam: { e1: [{ done_at: 'x' }] }
  });
  same(list.map(a => a.level + ':' + a.key), ['verified:uni_email', 'record:lessons', 'self:plan_done', 'self:assignments', 'self:self']);
  assert.equal(list.find(a => a.key === 'self').level, 'self');
  const none = H.achievements({ user: { university_email_verified: false }, items: [item({ kind: 'achievement', title: 'x' })] });
  assert.ok(none.every(a => a.level !== 'verified'));
});

test('wording uses calendar days: due tonight is "today", planned work says planned', () => {
  const r = wn({ items: [item({ title: 'Tonight', due_at: inDays(0, 23), estimate_min: 30, weight_pct: 40 }), item({ kind: 'task', title: 'Plan', planned_for: day(0), estimate_min: 30 })] });
  const t = r.pick.title === 'Tonight' ? r.pick : r.alternates.find(a => a.title === 'Tonight');
  const p = r.pick.title === 'Plan' ? r.pick : r.alternates.find(a => a.title === 'Plan');
  assert.ok(t.reasons.some(x => x.k === 'due' && x.days === 0));
  assert.ok(p.reasons.some(x => x.k === 'planned' && x.days === 0));
  assert.ok(!p.reasons.some(x => x.k === 'due'));
});

/* ---------------- daily learning (prototype) ---------------- */
const note = o => ({ id: 'n' + (++seq), kind: 'note', course_label: 'STAT 201', created_at: '2026-11-20T10:00:00Z', ...o });

test('parseCards reads Q/A, term :: definition and cloze lines, and nothing else', () => {
  const n = note({ title: 'Week 7 #inference', body: 'Q: When do we use t instead of z?\nA: When sigma is unknown.\nStandard error :: sd / sqrt(n)\nA 95% interval uses {{1.96}} for z.\nJust a sentence.\nQ: dangling question' });
  const cards = H.parseCards(n);
  same(cards.map(c => [c.kind, c.front, c.back]), [
    ['qa', 'When do we use t instead of z?', 'When sigma is unknown.'],
    ['term', 'Standard error', 'sd / sqrt(n)'],
    ['cloze', 'A 95% interval uses _____ for z.', '1.96']
  ]);
  same(cards[0].tags, ['inference']);
  // ids are stable, so review history survives edits elsewhere in the note
  assert.equal(H.parseCards({ ...n, body: n.body + '\nmore text' })[0].id, cards[0].id);
  assert.equal(H.parseCards({ id: 'x', body: '' }).length, 0);
});

test('reviewNext moves a known card up and sends a missed one back to tomorrow', () => {
  let st = H.reviewNext(null, true, NOW);
  same(st, { box: 1, due: day(1), reviews: 1, right: 1, last: day(0) });
  st = H.reviewNext(st, true, NOW); assert.equal(st.due, day(2));
  st = H.reviewNext(st, true, NOW); assert.equal(st.due, day(4));
  st = H.reviewNext(st, false, NOW); same([st.box, st.due, st.reviews, st.right], [1, day(1), 4, 3]);
  let top = { box: 6 }; assert.equal(H.reviewNext(top, true, NOW).box, 6);
});

test('reviewQueue: due cards first, a daily cap on new ones, and exams pull cards forward', () => {
  const cards = [1, 2, 3, 4, 5].map(i => ({ id: 'c' + i, course: i < 4 ? 'STAT 201' : 'HIST 230', tags: [] }));
  const states = { c1: { box: 2, due: day(0), last: day(-2) }, c2: { box: 4, due: day(10), last: day(-1) }, c3: { box: 3, due: day(-1), last: day(-5) } };
  let q = H.reviewQueue({ cards, states, now: NOW, newPerDay: 1 });
  same(q.due.map(c => c.id), ['c3', 'c1']);
  same(q.fresh.map(c => c.id), ['c4']);
  same([q.total, q.waitingNew, q.minutes], [3, 1, 1]);
  // STAT exam in 5 days: c2 (due in 10 days) is brought forward to the day before the exam
  const exams = [{ id: 'e', course_code: 'STAT 201', exam_date: day(5) }];
  q = H.reviewQueue({ cards, states, exams, now: new Date(2026, 10, 27, 9), newPerDay: 0 });
  assert.ok(q.due.some(c => c.id === 'c2'));
  q = H.reviewQueue({ cards, states, exams, now: NOW, newPerDay: 0 });
  assert.ok(!q.due.some(c => c.id === 'c2'), 'not before the day before the exam');
  same(H.reviewQueue({ cards: [], now: NOW }), { due: [], fresh: [], waitingNew: 0, total: 0, minutes: 0 });
});

test('todayClasses shows only today, in order, and asks for notes only after a class ended', () => {
  const at11 = new Date(2026, 10, 23, 11, 30); // Monday 11:30
  const timetable = [
    { id: 't1', course_label: 'ECON 110', weekday: 1, start: '14:00', end: '15:30' },
    { id: 't2', course_label: 'STAT 201', weekday: 1, start: '08:15', end: '09:45' },
    { id: 't3', course_label: 'CS 102', weekday: 1, start: '10:00', end: '11:00' },
    { id: 't4', course_label: 'HIST 230', weekday: 2, start: '08:00', end: '10:00' }
  ];
  const items = [note({ course_label: 'stat-201', created_at: new Date(2026, 10, 23, 10, 0).toISOString() })];
  const c = H.todayClasses({ timetable, items, now: at11 });
  same(c.map(x => [x.course, x.state, x.needsCapture]), [['STAT 201', 'done', false], ['CS 102', 'done', true], ['ECON 110', 'next', false]]);
});

test('learningRecord counts this week only, with recall rate and no streak', () => {
  const log = [
    { at: new Date(2026, 10, 23, 8).toISOString(), type: 'review', n: 10, right: 8 },
    { at: new Date(2026, 10, 23, 9).toISOString(), type: 'focus', minutes: 25 },
    { at: new Date(2026, 10, 25, 9).toISOString(), type: 'focus', minutes: 50 },
    { at: new Date(2026, 10, 20, 9).toISOString(), type: 'focus', minutes: 99 } // last week
  ];
  const r = H.learningRecord({ log, now: new Date(2026, 10, 25, 20) });
  same([r.activeDays, r.focusMinutes, r.reviewed, r.recall], [2, 75, 10, 80]);
  assert.equal(r.days.length, 7);
  assert.equal(r.days[0].minutes, 25);
  assert.equal(H.learningRecord({ log: [], now: NOW }).recall, null);
});

test('conceptMap joins #tags and [[links]] across notes and courses, with card strength', () => {
  const a = note({ title: 'CI', body: 'About [[Confidence intervals]] #inference\nQ: z for 95%?\nA: 1.96' });
  const b = note({ course_label: 'ECON 110', body: 'Uses #Inference too' });
  const cards = H.parseCards(a);
  const m = H.conceptMap({ items: [a, b], cards, states: { [cards[0].id]: { box: 3 } } });
  same(m.map(x => [x.key, x.notes, x.courses.length, x.strength]), [['inference', 2, 2, 50], ['confidence intervals', 1, 1, 50]]);
});

test('searchNotes ranks by the question words and returns the matching sentence', () => {
  const items = [note({ title: 't vs z', body: 'Use t when sigma is unknown. For large n they agree.' }), note({ title: 'Essay', body: 'Lead with the claim.' })];
  const r = H.searchNotes(items, 'When is sigma unknown?');
  assert.equal(r.length, 1);
  assert.equal(r[0].snippet, 'Use t when sigma is unknown.');
  same(H.searchNotes(items, 'the and'), []);
});

test('suggestCards turns "X is Y" sentences into questions, in English and German', () => {
  same(H.suggestCards('Elasticity is the responsiveness of demand to price. Nothing here.'), [{ front: 'What is Elasticity?', back: 'the responsiveness of demand to price' }]);
  same(H.suggestCards('Inflation ist der Anstieg des Preisniveaus.'), [{ front: 'Was ist Inflation?', back: 'der Anstieg des Preisniveaus' }]);
  same(H.suggestCards('A list is an ordered collection of items.'), [{ front: 'What is a list?', back: 'an ordered collection of items' }]);
  same(H.suggestCards('Use t when the population standard deviation is unknown and you estimate it.'), []);
  same(H.suggestCards('Elasticity means how strongly demand reacts.'), [{ front: 'What does Elasticity mean?', back: 'how strongly demand reacts' }]);
});

test('suggestions propose capture, review, plan, rescue and reflect in a fixed order, and respect dismissals', () => {
  const fri = new Date(2026, 10, 27, 17);
  const exams = [{ id: 'e1', title: 'Stats midterm', course_code: 'STAT 201', exam_date: H.iso(new Date(2026, 11, 3)) }, { id: 'e2', title: 'Econ final', exam_date: H.iso(new Date(2026, 11, 10)) }];
  const tasksByExam = { e1: [{ topic: 'Regression', unsure: true, done_at: null }] };
  const s = H.suggestions({ now: fri, classes: [{ id: 'c', course: 'CS 102', needsCapture: true }], queue: { total: 12, minutes: 3 }, exams, tasksByExam });
  same(s.map(x => x.k), ['capture', 'review', 'rescue', 'plan', 'reflect']);
  assert.equal(H.suggestions({ now: fri, exams, tasksByExam, reflectedThisWeek: true, dismissed: ['plan:e2'] }).map(x => x.k).join(), 'rescue');
});

test('parseICS keeps weekly classes from per-meeting exports and RRULEs, and finds exams', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    // per-meeting export (Stud.IP style): same title, weekday and time twice
    'BEGIN:VEVENT', 'SUMMARY:Mikroökonomik I (Vorlesung)', 'LOCATION:HS 1\\, Hauptgebäude', 'DTSTART;TZID=Europe/Berlin:20261117T081500', 'DTEND;TZID=Europe/Berlin:20261117T094500', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Mikroökonomik I (Vorlesung)', 'LOCATION:HS 1\\, Hauptgebäude', 'DTSTART;TZID=Europe/Berlin:20261124T081500', 'DTEND;TZID=Europe/Berlin:20261124T094500', 'END:VEVENT',
    // RRULE weekly on two days, long summary folded over two lines
    'BEGIN:VEVENT', 'SUMMARY:Statistik Übung', '  Gruppe 3', 'DTSTART:20261021T120000', 'DTEND:20261021T133000', 'RRULE:FREQ=WEEKLY;UNTIL=20270205T000000Z;BYDAY=WE,FR', 'END:VEVENT',
    // a single one-off talk: skipped
    'BEGIN:VEVENT', 'SUMMARY:Gastvortrag', 'DTSTART:20261126T180000', 'DTEND:20261126T190000', 'END:VEVENT',
    // a cancelled meeting: ignored
    'BEGIN:VEVENT', 'SUMMARY:Old course', 'STATUS:CANCELLED', 'DTSTART:20261118T100000', 'END:VEVENT',
    // exam
    'BEGIN:VEVENT', 'SUMMARY:Klausur Mikroökonomik I', 'DTSTART;TZID=Europe/Berlin:20270210T100000', 'DTEND;TZID=Europe/Berlin:20270210T120000', 'END:VEVENT',
    // a finished course from last term: dropped
    'BEGIN:VEVENT', 'SUMMARY:Alt', 'DTSTART:20260401T100000', 'END:VEVENT', 'BEGIN:VEVENT', 'SUMMARY:Alt', 'DTSTART:20260408T100000', 'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const r = H.parseICS(ics, { now: new Date(2026, 10, 25) });
  same(r.classes.map(c => [c.course_label, c.weekday, c.start, c.end, c.kind]), [
    ['Mikroökonomik I (Vorlesung)', 2, '08:15', '09:45', 'Lecture'],
    ['Statistik Übung Gruppe 3', 3, '12:00', '13:30', 'Tutorial'],
    ['Statistik Übung Gruppe 3', 5, '12:00', '13:30', 'Tutorial']
  ]);
  assert.equal(r.classes[0].room, 'HS 1, Hauptgebäude');
  same(r.exams, [{ course_label: 'Klausur Mikroökonomik I', date: '2027-02-10' }]);
  assert.equal(r.skipped, 2);
});

test('parseICS survives junk and caps output', () => {
  same(H.parseICS('not a calendar').classes, []);
  same(H.parseICS('').exams, []);
  assert.equal(H.parseICS('BEGIN:VEVENT\nSUMMARY:x\nDTSTART:garbage\nEND:VEVENT').classes.length, 0);
});

test('examMode switches on within six weeks of the next exam', () => {
  const now = new Date(2026, 10, 25);
  assert.equal(H.examMode({ exams: [{ exam_date: '2027-02-10' }], now }).on, false);
  const m = H.examMode({ exams: [{ exam_date: '2027-01-02', title: 'A' }, { exam_date: '2026-12-20', title: 'B' }], now });
  assert.equal(m.on, true); assert.equal(m.next.exam.title, 'B'); assert.equal(m.next.days, 25);
});
