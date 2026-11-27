/* UniSkilled Study Campus — sample data for the preview (studyhq.html?demo=1).
 * Loaded only in preview mode. Nothing here touches the database: changes live in this browser tab
 * and are gone on reload. All names, courses and dates are invented and placed around today. */
(function (root) {
  'use strict';
  function build(now) {
    var H = root.StudyHQ;
    var d0 = H.startOfDay(now);
    function day(n) { return H.iso(H.addDays(d0, n)); }
    function at(n, h, m) { var d = H.addDays(d0, n); d.setHours(h, m || 0, 0, 0); return d.toISOString(); }
    var n = 0;
    function id(p) { n += 1; return p + '-' + n; }
    function item(o) {
      return Object.assign({ id: id('item'), status: 'todo', body: null, url: null, due_at: null, planned_for: null,
        weight_pct: null, estimate_min: null, done_at: null, created_at: at(-20, 9) }, o);
    }
    var exams = [
      { id: 'exam-stat', title: 'Statistics II midterm', course_code: 'STAT 201', exam_date: day(9), topics: ['Sampling distributions', 'Confidence intervals', 'Hypothesis tests', 'Regression'] },
      { id: 'exam-econ', title: 'Microeconomics final', course_code: 'ECON 110', exam_date: day(24), topics: ['Elasticity', 'Market structures', 'Game theory'] }
    ];
    var tasks = [];
    function t(exam, dayN, topic, kind, done, unsure) {
      tasks.push({ id: id('task'), exam_id: exam, day: day(dayN), topic: topic, kind: kind, done_at: done ? at(dayN, 18) : null, unsure: !!unsure, created_at: at(-10, 9) });
    }
    t('exam-stat', -4, 'Sampling distributions', 'learn', true);
    t('exam-stat', -2, 'Confidence intervals', 'learn', true, true);
    t('exam-stat', 0, 'Hypothesis tests', 'learn', false, true);
    t('exam-stat', 1, 'Confidence intervals', 'review', false, true);
    t('exam-stat', 3, 'Regression', 'learn', false);
    t('exam-stat', 6, 'Hypothesis tests', 'review', false, true);
    t('exam-stat', 8, 'Mock exam', 'practice', false);
    t('exam-econ', -1, 'Elasticity', 'learn', true);
    t('exam-econ', 5, 'Market structures', 'learn', false);
    t('exam-econ', 12, 'Game theory', 'learn', false);
    t('exam-econ', 22, 'Mock exam', 'practice', false);

    var items = [
        item({ kind: 'assignment', course_label: 'STAT 201', title: 'Problem set 4: confidence intervals', due_at: at(2, 23, 59), weight_pct: 10, estimate_min: 180, status: 'doing' }),
        item({ kind: 'assignment', course_label: 'ECON 110', title: 'Essay: price controls in practice', due_at: at(6, 12), weight_pct: 30, estimate_min: 480 }),
        item({ kind: 'assignment', course_label: 'CS 102', title: 'Project 2: text adventure in Python', due_at: at(12, 23, 59), weight_pct: 25, estimate_min: 600 }),
        item({ kind: 'assignment', course_label: 'HIST 230', title: 'Reading response, week 7', due_at: at(1, 9), weight_pct: 5, estimate_min: 60 }),
        item({ kind: 'assignment', course_label: 'CS 102', title: 'Lab 6 reflection', due_at: at(-2, 23, 59), weight_pct: 2, estimate_min: 20 }),
        item({ kind: 'assignment', course_label: 'CS 102', title: 'Lab 5: lists and loops', due_at: at(-3, 23, 59), weight_pct: 3, estimate_min: 90, status: 'done', done_at: at(-4, 20) }),
        item({ kind: 'assignment', course_label: 'HIST 230', title: 'Source analysis: 1916 letters', due_at: at(-8, 12), weight_pct: 10, estimate_min: 240, status: 'done', done_at: at(-9, 16) }),
        item({ kind: 'task', course_label: 'ECON 110', title: 'Outline essay arguments', planned_for: day(0), estimate_min: 45 }),
        item({ kind: 'task', course_label: 'HIST 230', title: 'Read chapter 7 (Hourani)', planned_for: day(1), estimate_min: 60 }),
        item({ kind: 'task', course_label: 'CS 102', title: 'Ask TA about project scope', planned_for: day(3), estimate_min: 15, status: 'blocked', body: 'Waiting for office hours' }),
        item({ kind: 'note', course_label: 'STAT 201', title: 'When to use t instead of z', body: 'Use t when the population standard deviation is unknown and you estimate it from the sample.\nFor large n the two give almost the same interval.' }),
        item({ kind: 'note', course_label: 'STAT 201', title: 'Week 7 lecture: confidence intervals #inference', created_at: at(-6, 10), body: 'Q: When do we use t instead of z?\nA: When the population standard deviation is unknown and estimated from the sample.\nStandard error :: the sample standard deviation divided by the square root of n\nA 95% confidence interval for a mean uses {{1.96}} as the z value.\nWider intervals come from {{smaller samples}} or a higher confidence level.\nSee also [[Hypothesis tests]].' }),
        item({ kind: 'note', course_label: 'STAT 201', title: 'Week 8 lecture: hypothesis tests #inference', created_at: at(-1, 10), body: 'Q: What does a p-value measure?\nA: How likely data this extreme would be if the null hypothesis were true.\nType I error :: rejecting a null hypothesis that is true\nType II error :: failing to reject a null hypothesis that is false\nThe usual significance level is {{0.05}}.\nBuilds on [[Confidence intervals]].' }),
        item({ kind: 'note', course_label: 'ECON 110', title: 'Elasticity #elasticity', created_at: at(-8, 13), body: 'Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price.\nQ: What does an elasticity above 1 (in absolute value) mean?\nA: Demand is elastic: quantity reacts more strongly than price.\nInelastic good :: a good whose demand barely changes with price, such as insulin or petrol\nLinked to [[Market structures]] and [[price controls]].' }),
        item({ kind: 'note', course_label: 'CS 102', title: 'Lists and loops #python', created_at: at(-3, 15), body: 'A list is an ordered, changeable collection of items.\nQ: What does range(3) produce?\nA: 0, 1 and 2.\nlen() :: returns the number of items in a list\nA for loop over a list visits {{each item in order}}.' }),
        item({ kind: 'note', course_label: 'HIST 230', title: '1916 letters: context #primary-sources', created_at: at(-9, 11), body: 'Primary source :: a document created at the time by someone involved\nQ: Which three questions do we ask of every source?\nA: Who wrote it, for whom, and why then?\nThe Sykes-Picot agreement was signed in {{1916}}.' }),
        item({ kind: 'note', course_label: 'ECON 110', title: 'Essay feedback from last term', body: 'Lead with the claim. One example per paragraph. Cite the data source under every chart.' }),
        item({ kind: 'resource', course_label: 'CS 102', title: 'Python tutorial (official docs)', url: 'https://docs.python.org/3/tutorial/' }),
        item({ kind: 'resource', course_label: 'STAT 201', title: 'Seeing Theory: visual probability', url: 'https://seeing-theory.brown.edu/' }),
        // Finished work, so "My progress" has something real to show.
        item({ kind: 'task', course_label: 'STAT 201', title: 'Redo week 6 practice questions', status: 'done', done_at: at(-1, 17), created_at: at(-3, 9) }),
        item({ kind: 'task', course_label: 'ECON 110', title: 'Find three sources on rent caps', status: 'done', done_at: at(-2, 14), created_at: at(-4, 9) }),
        item({ kind: 'task', course_label: 'HIST 230', title: 'Read chapter 6 (Hourani)', status: 'done', done_at: at(-8, 19), created_at: at(-10, 9) }),
        item({ kind: 'task', course_label: 'CS 102', title: 'Set up Python on laptop', status: 'done', done_at: at(-9, 20), created_at: at(-11, 9) }),
        item({ kind: 'achievement', title: 'Presented my group’s HIST 230 seminar', body: '15-minute talk on the 1916 letters.', created_at: at(-5, 15) }),
        item({ kind: 'research', course_label: 'ECON 110', title: 'Do rent caps reduce housing supply? (essay)', url: 'https://www.oecd.org/housing/', body: 'https://www.oecd.org/housing/\nhttps://www.diw.de/en\nBerlin rent cap 2020–21: supply of rental flats fell while it applied.', created_at: at(-6, 10), updated_at: at(-2, 14) }),
        item({ kind: 'research', course_label: 'STAT 201', title: 'Which test for small samples?', body: 'https://seeing-theory.brown.edu/', status: 'done', done_at: at(-7, 18), created_at: at(-12, 10) })
    ];

    var monday = H.addDays(d0, -((d0.getDay() + 6) % 7));
    function cls(wd, course, start, end, kind, room) { return { id: id('class'), weekday: wd, course_label: course, start: start, end: end, kind: kind, room: room }; }
    var timetable = [
      cls(1, 'STAT 201', '08:15', '09:45', 'Lecture', 'H 2.03'), cls(1, 'ECON 110', '12:00', '13:30', 'Lecture', 'Audimax'), cls(1, 'CS 102', '14:00', '15:30', 'Lab', 'PC Lab 3'),
      cls(2, 'HIST 230', '10:00', '11:30', 'Seminar', 'R 1.14'), cls(2, 'STAT 201', '14:00', '15:00', 'Tutorial', 'H 0.08'),
      cls(3, 'ECON 110', '08:15', '09:45', 'Lecture', 'Audimax'), cls(3, 'CS 102', '10:00', '11:30', 'Lecture', 'H 1.01'), cls(3, 'STAT 201', '14:00', '15:30', 'Lecture', 'H 2.03'),
      cls(4, 'HIST 230', '10:00', '11:30', 'Lecture', 'R 0.02'), cls(4, 'ECON 110', '13:00', '14:00', 'Tutorial', 'S 3.12'),
      cls(5, 'CS 102', '09:00', '10:30', 'Lab', 'PC Lab 3'), cls(5, 'STAT 201', '12:00', '13:30', 'Lecture', 'H 2.03')
    ];
    // Review history for some cards, so today has cards due and the concept map has strengths.
    var cardStates = {};
    var noteItems = items.filter(function (i) { return i.kind === 'note'; });
    noteItems.forEach(function (n, ni) {
      H.parseCards(n).forEach(function (c, ci) {
        var r = (ni * 3 + ci) % 5;
        if (r === 4) return; // a new card, never reviewed
        cardStates[c.id] = { box: 1 + (r % 4), due: day(r === 0 ? -1 : r === 1 ? 0 : r === 2 ? 3 : 6), reviews: 2 + r, right: 1 + r, last: day(-2 - r) };
      });
    });
    // This week's activity log (no streaks: just which days had study, and how much).
    var log = [];
    for (var k = 0; H.addDays(monday, k) < d0; k++) {
      if (k === 2) continue; // one quiet day
      var base = H.addDays(monday, k);
      log.push({ at: new Date(base.getTime() + 8.5 * 3600000).toISOString(), type: 'review', n: 8 + k * 2, right: 6 + k });
      log.push({ at: new Date(base.getTime() + 16 * 3600000).toISOString(), type: 'focus', minutes: k % 2 ? 50 : 25 });
    }
    [1, 2, 4].forEach(function (k) { var b = H.addDays(monday, k - 7); log.push({ at: new Date(b.getTime() + 9 * 3600000).toISOString(), type: 'review', n: 6 + k, right: 4 + k }); });
    var reflections = [{ week: H.iso(H.addDays(monday, -7)), went: 'Finished problem set 3 two days early.', stuck: 'Regression output: which number answers the question?', aim: 'Start the economics essay outline before Thursday.' }];
    return {
      timetable: timetable, cardStates: cardStates, log: log, reflections: reflections,
      term: { name: 'Winter term 2026/27', start: H.iso(H.addDays(monday, -42)), end: H.iso(H.addDays(monday, 69)) },
      user: { id: 'demo-student', full_name: 'Lina Haddad', university_email_verified: true },
      profile: { university: 'Demo University', degree: 'BSc Economics', year_of_study: 2 },
      follows: [
        { id: 'f1', course_code: 'STAT 201', course_key: 'stat201' },
        { id: 'f2', course_code: 'ECON 110', course_key: 'econ110' },
        { id: 'f3', course_code: 'CS 102', course_key: 'cs102' },
        { id: 'f4', course_code: 'HIST 230', course_key: 'hist230' }
      ],
      exams: exams,
      tasks: tasks,
      // The Exam planner's exams and plans (read-only in Study Campus) and a course finished last term
      planner: exams.filter(function (x) { return x.id === 'exam-stat' || x.id === 'exam-econ'; }),
      tasksByExam: tasks.reduce(function (m, x) { (m[x.exam_id] = m[x.exam_id] || []).push(x); return m; }, {}),
      finished: ['MATH 101'],
      sessions: [
        { id: 's1', subject: 'STAT 201', tutor_name: 'Omar K.', tutor_id: 'tutor-1', status: 'completed', starts_at: at(-6, 17), duration_minutes: 60 },
        { id: 's2', subject: 'STAT 201', tutor_name: 'Omar K.', tutor_id: 'tutor-1', status: 'confirmed', starts_at: at(2, 17), duration_minutes: 60 },
        { id: 's3', subject: 'CS 102', tutor_name: 'Mia S.', tutor_id: 'tutor-2', status: 'completed', starts_at: at(-13, 15), duration_minutes: 90 },
        { id: 's4', subject: 'Academic writing', tutor_name: 'Daniel R.', tutor_id: 'tutor-3', status: 'completed', starts_at: at(-30, 11), duration_minutes: 60 }
      ],
      items: items,
      files: [
        { id: 'file1', name: 'STAT 201 · Lecture 9 slides.pdf', path: 'demo/1.pdf', mime: 'application/pdf', size_bytes: 2412000, pages: 38, course_label: 'STAT 201', course_key: 'stat201', created_at: at(-1, 10),
          text_content: 'Lecture 9: Hypothesis testing. The null hypothesis H0 states there is no effect. A p-value is the probability of data at least this extreme if H0 is true. Use the t-test when the population standard deviation is unknown and the sample is small. Type I error: rejecting a true H0.' },
        { id: 'file2', name: 'ECON 110 · Slide, ' + new Date(at(-2, 12)).getDate() + ' ' + new Date(at(-2, 12)).toLocaleDateString([], { month: 'short' }), path: 'demo/2.jpg', mime: 'image/jpeg', size_bytes: 412000, pages: null, course_label: 'ECON 110', course_key: 'econ110', created_at: at(-2, 12), text_content: null },
        { id: 'file3', name: 'HIST 230 · Reading list.pdf', path: 'demo/3.pdf', mime: 'application/pdf', size_bytes: 188000, pages: 4, course_label: 'HIST 230', course_key: 'hist230', created_at: at(-9, 9), text_content: null }
      ]
    };
  }
  // "Exam help" in the preview: one invented tutor teaches STAT 201; ECON 110 has none yet.
  function help() {
    return { ready: true, requested: [], tutorsByKey: { stat201: [{ id: 'demo-tutor', name: 'Jonas Weber', course: 'STAT 201', university: 'Demo University', verified: true, mine: true, rate: 22, currency: 'EUR', reviews: 14, stars: 4.9, score: 4.8 }] } };
  }
  root.StudyHQDemo = { build: build, help: help };
})(typeof window !== 'undefined' ? window : globalThis);
