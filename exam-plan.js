/* UniSkilled — exam revision plan builder (used by exam-planner.html, tested by tests/site/exam-plan.test.mjs).
 *
 * Pure function, no network: given topics, an exam date and the weekdays a student wants to study,
 * it spreads the work over the study days left before the exam:
 *   1. Learn  — each topic once, in the order the student listed them (first ~60% of the days)
 *   2. Review — each topic again a couple of study days after learning it (only when there is time),
 *               then once more in the review stretch before the exam (spaced repetition)
 *   3. Practice — the last one or two study days: practice questions, then a timed mock exam
 * Topics already learned (a finished "learn" task) skip step 1 when a plan is rebuilt.
 * No study happens on the exam day itself. It never predicts a grade.
 */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  // ISO weekday: Monday = 1 … Sunday = 7
  function isoDow(d) { var w = d.getDay(); return w === 0 ? 7 : w; }

  var PRACTICE_ALL = 'Practice questions (all topics)';
  var MOCK_EXAM = 'Mock exam under timed conditions';

  /**
   * @param {object} o
   * @param {string[]} o.topics        topics in the order to learn them (1–30)
   * @param {string}   o.examDate      'YYYY-MM-DD'
   * @param {number[]} o.studyDays     ISO weekdays to study on (1 = Monday … 7 = Sunday)
   * @param {string}   [o.today]       'YYYY-MM-DD', defaults to the device's today
   * @param {string[]} [o.learned]     topics already learned (skip their learn step)
   * @returns {{ok:true, days:string[], tasks:{day:string, topic:string, kind:string}[]} | {ok:false, error:string}}
   */
  function buildPlan(o) {
    var topics = [];
    (o.topics || []).forEach(function (t) {
      t = String(t || '').trim().slice(0, 120);
      if (t && topics.map(function (x) { return x.toLowerCase(); }).indexOf(t.toLowerCase()) === -1) topics.push(t);
    });
    if (!topics.length) return { ok: false, error: 'Add at least one topic.' };
    if (topics.length > 30) return { ok: false, error: 'Use 30 topics or fewer. Group small ones together.' };

    var studyDays = (o.studyDays || []).map(Number).filter(function (n) { return n >= 1 && n <= 7; });
    if (!studyDays.length) return { ok: false, error: 'Pick at least one day of the week to study.' };

    var today = o.today ? parse(o.today) : new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var exam = parse(o.examDate);
    if (isNaN(exam.getTime())) return { ok: false, error: 'Choose the exam date.' };
    if (exam <= today) return { ok: false, error: 'The exam date needs to be after today.' };
    if ((exam - today) / 86400000 > 366) return { ok: false, error: 'Choose an exam date within the next year.' };

    var days = [];
    for (var d = new Date(today); d < exam; d.setDate(d.getDate() + 1)) {
      if (studyDays.indexOf(isoDow(d)) !== -1) days.push(iso(d));
    }
    if (!days.length) return { ok: false, error: 'There are no study days left before the exam on the days you picked. Add more days.' };

    var learned = (o.learned || []).map(function (t) { return String(t).trim().toLowerCase(); });
    var toLearn = topics.filter(function (t) { return learned.indexOf(t.toLowerCase()) === -1; });

    var m = days.length;
    var practiceDays = m >= 8 ? 2 : (m >= 3 ? 1 : 0);
    var avail = m - practiceDays;                                    // days for learning + reviewing
    var learnSpan = avail >= 2 ? Math.max(1, Math.round(avail * 0.6)) : avail;
    var reviewStart = learnSpan, reviewSpan = avail - learnSpan;     // review stretch before practice

    var tasks = [];
    var seen = {};
    function add(i, topic, kind) {
      var k = i + '|' + topic.toLowerCase();
      if (i < 0 || i >= m || seen[k]) return false;                  // never the same topic twice in a day
      seen[k] = 1;
      tasks.push({ day: days[i], topic: topic, kind: kind, _i: i });
      return true;
    }

    // 1. Learn, evenly spread over the learning stretch
    var learnDayOf = {};
    toLearn.forEach(function (t, i) {
      var di = Math.floor(i * learnSpan / toLearn.length);
      add(di, t, 'learn');
      learnDayOf[t.toLowerCase()] = di;
    });

    // 2a. Quick review two study days after learning it (spacing), when the plan is long enough
    if (m >= 6) {
      toLearn.forEach(function (t) {
        var di = learnDayOf[t.toLowerCase()] + 2;
        if (di < avail) add(di, t, 'review');
      });
    }
    // 2b. Final review of every topic in the review stretch
    if (reviewSpan > 0) {
      topics.forEach(function (t, i) {
        add(reviewStart + Math.floor(i * reviewSpan / topics.length), t, 'review');
      });
    }

    // 3. Practice at the end
    if (practiceDays === 1) add(m - 1, PRACTICE_ALL, 'practice');
    if (practiceDays === 2) { add(m - 2, PRACTICE_ALL, 'practice'); add(m - 1, MOCK_EXAM, 'practice'); }

    var order = { learn: 0, review: 1, practice: 2 };
    tasks.sort(function (a, b) { return (a._i - b._i) || (order[a.kind] - order[b.kind]); });
    tasks.forEach(function (t) { delete t._i; });
    return { ok: true, days: days, tasks: tasks };
  }

  var api = { buildPlan: buildPlan, iso: iso, parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UskExamPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
