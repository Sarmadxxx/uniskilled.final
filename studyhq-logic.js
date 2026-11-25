/* UniSkilled Study HQ — the workspace's logic (used by studyhq.html, tested by tests/site/studyhq-logic.test.mjs).
 *
 * Pure functions, no network, no page: they take the student's own rows and the current time and
 * return what the page shows. Keeping them here means every rule below is unit-tested.
 *
 *   courseKey()     same normalisation as public.course_key() in the database (Course Hubs)
 *   buildCourses()  one course per key, joining followed courses, exams, Study HQ items and lessons
 *   courseProgress() done / total work for a course, unsure exam topics, next deadline
 *   whatNext()      the "focus on next" pick: a fixed, explainable score, never a guess about grades
 *   weekPlan()      seven days of deadlines, planned tasks, exam revision and lessons, with minutes
 *   achievements()  verified records, platform records and self-reported items, never mixed up
 *   parseCards() / reviewNext() / reviewQueue()   review cards from the student's own notes, spaced out
 *   todayClasses() / learningRecord() / conceptMap() / searchNotes() / suggestCards() / suggestions()
 *                   the daily loop (prototype): classes, the week's record, concepts, "ask my notes", proposals
 */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var DEFAULT_EST = { assignment: 240, task: 30, exam: 45 }; // minutes, used only when no estimate is set
  var MIN_SESSION = 15, MAX_SESSION = 90;

  function courseKey(s) {
    var k = String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return k || null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function round4(x) { return Math.round(x * 10000) / 10000; }

  // When a lesson starts: starts_at when set, else its date and time (local).
  function sessionStart(s) {
    if (s.starts_at) return new Date(s.starts_at);
    if (!s.scheduled_date) return null;
    var d = parseDay(s.scheduled_date);
    var t = String(s.scheduled_time || '00:00').split(':');
    d.setHours(+t[0] || 0, +t[1] || 0, 0, 0);
    return d;
  }
  // A due date: an assignment's due_at, else the day it is planned for (end of that day).
  function dueOf(item) {
    if (item.due_at) return new Date(item.due_at);
    if (item.planned_for) { var d = parseDay(item.planned_for); d.setHours(23, 59, 0, 0); return d; }
    return null;
  }
  var LIVE_LESSON = { confirmed: 1, completed: 1, awaiting_payment: 1, pending: 1 };

  /* ---------------------------------------------------------------- courses */
  function buildCourses(input) {
    var follows = input.follows || [], exams = input.exams || [], items = input.items || [], sessions = input.sessions || [];
    var map = {}, order = [];
    function get(key, label) {
      if (!key) return null;
      if (!map[key]) { map[key] = { key: key, label: label || key, followed: false, followId: null, exams: [], items: [], sessions: [] }; order.push(key); }
      return map[key];
    }
    follows.forEach(function (f) {
      var c = get(f.course_key || courseKey(f.course_code), f.course_code);
      if (c) { c.followed = true; c.followId = f.id; c.label = f.course_code || c.label; }
    });
    exams.forEach(function (x) {
      var c = get(x.course_key || courseKey(x.course_code || x.title), x.course_code || x.title);
      if (c) c.exams.push(x);
    });
    items.forEach(function (i) {
      var k = i.course_key || courseKey(i.course_label);
      if (!k) return;
      var c = get(k, i.course_label);
      c.items.push(i);
    });
    // Lessons only join a course the student already has; other subjects are offered as suggestions.
    var suggest = {}, suggestions = [];
    sessions.forEach(function (s) {
      if (!LIVE_LESSON[s.status]) return;
      var k = courseKey(s.subject);
      if (!k) return;
      if (map[k]) map[k].sessions.push(s);
      else if (!suggest[k]) { suggest[k] = 1; suggestions.push({ key: k, label: s.subject }); }
    });
    var list = order.map(function (k) { return map[k]; });
    list.sort(function (a, b) {
      if (a.followed !== b.followed) return a.followed ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return { list: list, byKey: map, suggestions: suggestions };
  }

  /* ---------------------------------------------------------------- progress */
  function courseProgress(course, tasksByExam, now) {
    now = now || new Date();
    var work = course.items.filter(function (i) { return i.kind === 'assignment' || i.kind === 'task'; });
    var workDone = work.filter(function (i) { return i.status === 'done'; }).length;
    var examTasks = [], unsure = {};
    course.exams.forEach(function (x) {
      (tasksByExam[x.id] || []).forEach(function (t) {
        examTasks.push(t);
        if (t.unsure && !t.done_at) unsure[t.topic] = { topic: t.topic, examId: x.id, examTitle: x.title };
      });
    });
    var examDone = examTasks.filter(function (t) { return !!t.done_at; }).length;
    var total = work.length + examTasks.length, done = workDone + examDone;
    var upcoming = [];
    work.forEach(function (i) { var d = dueOf(i); if (d && i.status !== 'done' && d >= startOfDay(now)) upcoming.push({ when: d, title: i.title, kind: i.kind, id: i.id }); });
    course.exams.forEach(function (x) { var d = parseDay(x.exam_date); if (d >= startOfDay(now)) upcoming.push({ when: d, title: x.title, kind: 'exam', id: x.id }); });
    upcoming.sort(function (a, b) { return a.when - b.when || String(a.id).localeCompare(String(b.id)); });
    var lessonsDone = course.sessions.filter(function (s) { return s.status === 'completed'; }).length;
    var nextLesson = course.sessions.map(function (s) { return { s: s, at: sessionStart(s) }; })
      .filter(function (x) { return x.at && x.at > now && x.s.status === 'confirmed'; })
      .sort(function (a, b) { return a.at - b.at; })[0] || null;
    return {
      total: total, done: done, pct: total ? Math.round(done / total * 100) : null,
      work: work.length, workDone: workDone, examTasks: examTasks.length, examDone: examDone,
      unsure: Object.keys(unsure).sort().map(function (k) { return unsure[k]; }),
      next: upcoming[0] || null, upcoming: upcoming,
      notes: course.items.filter(function (i) { return i.kind === 'note' || i.kind === 'resource'; }).length,
      lessonsDone: lessonsDone, nextLesson: nextLesson
    };
  }

  /* ---------------------------------------------------------------- what next */
  /* input: { items, exams, tasksByExam, minutesFree, now }
   * returns { state, pick, alternates, held, notes }
   *   state: 'no_items' | 'too_little_time' | 'ahead' | 'ok'
   * A candidate is one open assignment or task, or one exam topic due for revision today or earlier.
   * Score = 0.35 urgency + 0.25 weight + 0.20 pressure + 0.10 unsure topic + 0.05 momentum + 0.05 fit.
   * Ties: score, then sooner due, then higher weight, then older, then id. Same input, same answer. */
  function whatNext(input) {
    var now = input.now || new Date();
    var today = startOfDay(now);
    var minutesFree = input.minutesFree == null ? 60 : input.minutesFree;
    var exams = input.exams || [], tasksByExam = input.tasksByExam || {};
    var held = [], cands = [];

    (input.items || []).forEach(function (i) {
      if (i.kind !== 'assignment' && i.kind !== 'task') return;
      if (i.status === 'done') return;
      if (i.status === 'blocked') { held.push({ item: i, reason: 'blocked' }); return; }
      var due = dueOf(i);
      if (due && due < addDays(today, -7)) { held.push({ item: i, reason: 'long_overdue' }); return; }
      var est = i.estimate_min != null ? i.estimate_min : DEFAULT_EST[i.kind];
      cands.push({
        type: i.kind, id: String(i.id), title: i.title, course: i.course_label || null, due: due,
        weight: i.weight_pct != null ? Number(i.weight_pct) : null, remaining: Math.max(est, MIN_SESSION),
        estKnown: i.estimate_min != null, unsure: false, doing: i.status === 'doing', planned: !i.due_at && !!i.planned_for,
        created: i.created_at ? new Date(i.created_at).getTime() : 0, ref: i
      });
    });

    exams.forEach(function (x) {
      var examDay = parseDay(x.exam_date);
      if (examDay < today) return;
      var unsureTopics = {};
      (tasksByExam[x.id] || []).forEach(function (t) { if (t.unsure) unsureTopics[t.topic] = 1; });
      (tasksByExam[x.id] || []).forEach(function (t) {
        if (t.done_at) return;
        var day = parseDay(t.day);
        if (day > today) return; // only revision that is due now
        cands.push({
          type: 'exam_task', id: String(t.id), title: t.topic, course: x.course_code || x.title, due: examDay,
          weight: null, remaining: DEFAULT_EST.exam, estKnown: false, unsure: !!unsureTopics[t.topic] && (examDay - today) / DAY <= 21,
          doing: false, created: t.created_at ? new Date(t.created_at).getTime() : 0, kind: t.kind, examTitle: x.title, ref: t
        });
      });
    });

    if (!cands.length && !held.length) return { state: 'no_items', pick: null, alternates: [], held: held };
    if (minutesFree < MIN_SESSION) return { state: 'too_little_time', pick: null, alternates: [], held: held };

    var scored = [];
    cands.forEach(function (c) {
      var session = Math.min(c.remaining, minutesFree, MAX_SESSION);
      if (session < MIN_SESSION) return;
      var daysLeft = c.due ? (c.due - now) / DAY : null;
      var U = c.due == null ? 0.1 : daysLeft <= 0 ? 1 : clamp(1 - daysLeft / 14, 0, 1);
      var W = c.weight == null ? 0.15 : clamp(c.weight / 50, 0, 1);
      var capacityMin = c.due == null ? Infinity : Math.max(daysLeft, 0) * (input.dailyMinutes || 120);
      var P = c.due == null ? 0 : clamp(c.remaining / Math.max(capacityMin, 1), 0, 1);
      var T = c.unsure ? 1 : 0, M = c.doing ? 1 : 0, F = session >= c.remaining ? 1 : 0.6;
      var score = round4(0.35 * U + 0.25 * W + 0.20 * P + 0.10 * T + 0.05 * M + 0.05 * F);
      var reasons = [];
      var calDays = c.due ? Math.round((startOfDay(c.due) - today) / DAY) : null; // calendar days, for the wording
      if (c.planned) reasons.push({ k: 'planned', days: calDays });
      else if (c.due && c.due < now) reasons.push({ k: 'overdue' });
      else if (c.due && calDays <= 14) reasons.push({ k: 'due', days: calDays });
      if (c.weight != null && c.weight >= 20) reasons.push({ k: 'weight', pct: c.weight });
      if (c.unsure) reasons.push({ k: 'unsure' });
      if (c.doing) reasons.push({ k: 'started' });
      if (P >= 1 && c.due) reasons.push({ k: 'at_risk' });
      if (!c.estKnown && c.type !== 'exam_task') reasons.push({ k: 'no_estimate' });
      scored.push({ c: c, score: score, session: session, daysLeft: daysLeft, P: P, reasons: reasons,
        factors: { urgency: round4(0.35 * U), weight: round4(0.25 * W), pressure: round4(0.20 * P), unsure: round4(0.10 * T), started: round4(0.05 * M), fit: round4(0.05 * F) } });
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var ad = a.c.due ? a.c.due.getTime() : Infinity, bd = b.c.due ? b.c.due.getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      var aw = a.c.weight == null ? -1 : a.c.weight, bw = b.c.weight == null ? -1 : b.c.weight;
      if (aw !== bw) return bw - aw;
      if (a.c.created !== b.c.created) return a.c.created - b.c.created;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    });

    if (!scored.length) return { state: 'too_little_time', pick: null, alternates: [], held: held };

    var ahead = scored.every(function (s) { return s.daysLeft == null || (s.daysLeft > 7 && s.P < 0.3); }) &&
                !scored.some(function (s) { return s.c.type === 'exam_task'; });
    if (ahead) {
      var weak = scored.filter(function (s) { return s.c.unsure; })[0] || null;
      return { state: 'ahead', pick: weak ? shape(weak) : null, alternates: [], held: held };
    }

    var pick = scored[0];
    var rest = scored.slice(1);
    var other = rest.filter(function (s) { return s.c.course !== pick.c.course; });
    var alts = other.slice(0, 2);
    if (alts.length < 2) alts = alts.concat(rest.filter(function (s) { return alts.indexOf(s) === -1; }).slice(0, 2 - alts.length));
    return { state: 'ok', pick: shape(pick), alternates: alts.map(shape), held: held };

    function shape(s) {
      return { type: s.c.type, id: s.c.id, title: s.c.title, course: s.c.course, due: s.c.due, minutes: s.session,
               score: s.score, factors: s.factors, reasons: s.reasons, examTitle: s.c.examTitle || null, kind: s.c.kind || null, ref: s.c.ref };
    }
  }

  /* ---------------------------------------------------------------- week */
  function weekPlan(input) {
    var start = startOfDay(input.start || new Date());
    var days = [];
    for (var i = 0; i < 7; i++) days.push({ date: addDays(start, i), iso: iso(addDays(start, i)), entries: [], minutes: 0 });
    function slot(d) { var n = Math.round((startOfDay(d) - start) / DAY); return n >= 0 && n < 7 ? days[n] : null; }
    (input.items || []).forEach(function (it) {
      if (it.kind !== 'assignment' && it.kind !== 'task') return;
      if (it.planned_for) {
        var p = slot(parseDay(it.planned_for));
        if (p) { p.entries.push({ type: 'planned', item: it }); if (it.status !== 'done') p.minutes += it.estimate_min || DEFAULT_EST[it.kind]; }
      }
      if (it.due_at) { var dd = slot(new Date(it.due_at)); if (dd) dd.entries.push({ type: 'due', item: it }); }
    });
    var exams = input.exams || [], tasksByExam = input.tasksByExam || {};
    exams.forEach(function (x) {
      var e = slot(parseDay(x.exam_date)); if (e) e.entries.push({ type: 'exam', exam: x });
      (tasksByExam[x.id] || []).forEach(function (t) {
        var d = slot(parseDay(t.day));
        if (d) { d.entries.push({ type: 'revision', task: t, exam: x }); if (!t.done_at) d.minutes += DEFAULT_EST.exam; }
      });
    });
    (input.sessions || []).forEach(function (s) {
      if (s.status !== 'confirmed' && s.status !== 'completed') return;
      var at = sessionStart(s); if (!at) return;
      var d = slot(at); if (d) { d.entries.push({ type: 'lesson', session: s, at: at }); d.minutes += s.duration_minutes || 60; }
    });
    var rank = { exam: 0, due: 1, lesson: 2, planned: 3, revision: 4 };
    days.forEach(function (d) { d.entries.sort(function (a, b) { return rank[a.type] - rank[b.type]; }); });
    return days;
  }

  /* ---------------------------------------------------------------- achievements */
  // level: 'verified' = confirmed by UniSkilled's checks (university email)
  //        'record'   = recorded by the platform itself (lessons the tutor completed), not an academic credential
  //        'self'     = ticked off or written by the student (finished plans, assignments, own achievements);
  //                     never shown as verified
  function achievements(input) {
    var out = [];
    var user = input.user || {};
    if (user.university_email_verified) out.push({ level: 'verified', key: 'uni_email', university: (input.profile || {}).university || null });
    var done = (input.sessions || []).filter(function (s) { return s.status === 'completed'; });
    if (done.length) out.push({ level: 'record', key: 'lessons', count: done.length, minutes: done.reduce(function (a, s) { return a + (s.duration_minutes || 60); }, 0) });
    (input.exams || []).forEach(function (x) {
      var t = (input.tasksByExam || {})[x.id] || [];
      if (t.length && t.every(function (k) { return !!k.done_at; })) out.push({ level: 'self', key: 'plan_done', title: x.title });
    });
    var assignmentsDone = (input.items || []).filter(function (i) { return i.kind === 'assignment' && i.status === 'done'; }).length;
    if (assignmentsDone) out.push({ level: 'self', key: 'assignments', count: assignmentsDone });
    (input.items || []).filter(function (i) { return i.kind === 'achievement'; }).forEach(function (i) {
      out.push({ level: 'self', key: 'self', title: i.title, body: i.body || null, id: i.id, date: i.done_at || i.created_at });
    });
    return out;
  }

  /* ---------------------------------------------------------------- daily learning (prototype)
   * The daily loop: Plan (today's classes) -> Capture (notes after class) -> Recall (review cards
   * made from the student's own notes, spaced out) -> Reflect (the week's honest record).
   * Everything here runs without AI. Where the browser has an on-device model, the page may use it
   * to suggest extra cards; these rules are the fallback and the baseline. */
  var BOX_DAYS = [0, 1, 2, 4, 8, 16, 32]; // review box -> days until the card comes back
  var SECONDS_PER_CARD = 15;

  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function plain(s) { return String(s).replace(/\[\[([^\]\n]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim(); }
  // #tags and [[links]] in a note name its concepts. Names are matched case-insensitively.
  function conceptsIn(text) {
    var out = [], seen = {}, m, re = /#([\p{L}\p{N}][\p{L}\p{N}_-]{1,40})|\[\[([^\]\n]{1,60})\]\]/gu;
    text = String(text || '');
    while ((m = re.exec(text))) {
      var label = (m[1] || m[2]).replace(/[-_]+/g, ' ').trim(), key = label.toLowerCase();
      if (key && !seen[key]) { seen[key] = 1; out.push({ key: key, label: label }); }
    }
    return out;
  }

  // Three ways to write a card in a note, so no AI is needed:
  //   Q: question  followed by  A: answer   (also "Question:/Answer:", German "F:/A:")
  //   term :: definition
  //   a sentence with {{hidden words}}       (cloze)
  function parseCards(note) {
    var lines = String(note.body || '').split(/\r?\n/), out = [], seen = {};
    var tags = conceptsIn((note.title || '') + ' ' + (note.body || '')).map(function (c) { return c.key; });
    function add(kind, front, back) {
      front = plain(front); back = plain(back);
      if (!front || !back || front.length > 300 || back.length > 600) return;
      var id = String(note.id) + ':' + hashStr(kind + '|' + front);
      if (seen[id]) return; seen[id] = 1;
      out.push({ id: id, noteId: note.id, kind: kind, front: front, back: back, course: note.course_label || null, tags: tags });
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim(), m;
      if (!line) continue;
      if ((m = line.match(/^(?:q|question|f|frage)\s*[:.]\s*(.+)$/i))) {
        for (var j = i + 1; j < lines.length && j <= i + 3; j++) {
          var nx = lines[j].trim(), a;
          if (!nx) continue;
          if ((a = nx.match(/^(?:a|answer|antwort)\s*[:.]\s*(.+)$/i))) { add('qa', m[1], a[1]); i = j; }
          break;
        }
      } else if (line.indexOf('::') > 0) {
        var k = line.indexOf('::');
        add('term', line.slice(0, k), line.slice(k + 2));
      } else if (/\{\{[^}]+\}\}/.test(line)) {
        var hidden = []; line.replace(/\{\{([^}]+)\}\}/g, function (x, g) { hidden.push(g.trim()); return x; });
        add('cloze', line.replace(/\{\{[^}]+\}\}/g, '_____'), hidden.join(', '));
      }
    }
    return out;
  }

  // One review: knew it -> the card moves up a box and comes back later; not yet -> back to box 1 (tomorrow).
  function reviewNext(state, knew, now) {
    state = state || {};
    var box = knew ? Math.min(BOX_DAYS.length - 1, (state.box || 0) + 1) : 1;
    return { box: box, due: iso(addDays(startOfDay(now), BOX_DAYS[box])), reviews: (state.reviews || 0) + 1, right: (state.right || 0) + (knew ? 1 : 0), last: iso(startOfDay(now)) };
  }

  // Today's review: cards that are due, then up to newPerDay new cards. Before an exam (21 days or less)
  // a card of that course is brought forward so it is seen at least once more before the exam day.
  function reviewQueue(input) {
    var now = input.now || new Date(), today = startOfDay(now), todayIso = iso(today), states = input.states || {};
    var newPerDay = input.newPerDay == null ? 10 : input.newPerDay;
    var examDay = {};
    (input.exams || []).forEach(function (x) {
      var d = parseDay(x.exam_date), k = x.course_key || courseKey(x.course_code || x.title), n = Math.round((d - today) / DAY);
      if (n >= 1 && n <= 21 && (!examDay[k] || d < examDay[k])) examDay[k] = d;
    });
    var due = [], fresh = [];
    (input.cards || []).forEach(function (c) {
      var st = states[c.id], k = courseKey(c.course), ex = k && examDay[k];
      if (!st) { fresh.push({ card: c, exam: ex || null }); return; }
      var eff = st.due;
      if (ex) { var before = iso(addDays(ex, -1)); if (eff > before && st.last < before) eff = before; }
      if (eff <= todayIso) due.push({ card: c, state: st, effDue: eff, exam: ex || null });
    });
    due.sort(function (a, b) { return a.effDue < b.effDue ? -1 : a.effDue > b.effDue ? 1 : (a.state.box - b.state.box) || (a.card.id < b.card.id ? -1 : 1); });
    fresh.sort(function (a, b) { return ((a.exam ? a.exam.getTime() : Infinity) - (b.exam ? b.exam.getTime() : Infinity)) || 0; });
    var picked = fresh.slice(0, newPerDay);
    var total = due.length + picked.length;
    return { due: due.map(function (x) { return x.card; }), fresh: picked.map(function (x) { return x.card; }), waitingNew: fresh.length - picked.length, total: total, minutes: total ? Math.max(1, Math.round(total * SECONDS_PER_CARD / 60)) : 0 };
  }

  function hm(s) { var p = String(s || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  // Today's classes from the weekly timetable, with whether the student has captured notes since each ended.
  function todayClasses(input) {
    var now = input.now || new Date(), d0 = startOfDay(now), wd = ((now.getDay() + 6) % 7) + 1;
    var nowMin = (now - d0) / 60000;
    var notes = (input.items || []).filter(function (i) { return i.kind === 'note'; });
    return (input.timetable || []).filter(function (c) { return +c.weekday === wd; })
      .sort(function (a, b) { return hm(a.start) - hm(b.start); })
      .map(function (c) {
        var s = hm(c.start), e = hm(c.end), start = new Date(d0.getTime() + s * 60000);
        var state = nowMin >= e ? 'done' : nowMin >= s ? 'now' : 'next';
        var k = courseKey(c.course_label);
        var captured = notes.some(function (n) { return courseKey(n.course_label) === k && n.created_at && new Date(n.created_at) >= start; });
        return { id: c.id, course: c.course_label, key: k, kind: c.kind || 'Lecture', room: c.room || '', start: c.start, end: c.end, state: state, captured: captured, needsCapture: state === 'done' && !captured };
      });
  }

  // The week's honest record: days with any study, focus minutes, cards reviewed and recall rate. No streaks.
  function learningRecord(input) {
    var now = input.now || new Date(), monday = addDays(startOfDay(now), -((now.getDay() + 6) % 7));
    var days = [], byDay = {};
    for (var i = 0; i < 7; i++) { var d = addDays(monday, i); byDay[iso(d)] = { iso: iso(d), date: d, minutes: 0, cards: 0, active: false, future: d > startOfDay(now) }; days.push(byDay[iso(d)]); }
    var focus = 0, reviewed = 0, right = 0, notes = 0;
    (input.log || []).forEach(function (e) {
      var k = iso(new Date(e.at)), slot = byDay[k];
      if (!slot) return;
      slot.active = true;
      if (e.type === 'focus') { slot.minutes += e.minutes || 0; focus += e.minutes || 0; }
      if (e.type === 'review') { slot.cards += e.n || 0; reviewed += e.n || 0; right += e.right || 0; }
      if (e.type === 'note') notes += 1;
    });
    return { days: days, activeDays: days.filter(function (d) { return d.active; }).length, focusMinutes: focus, reviewed: reviewed, recall: reviewed ? Math.round(right / reviewed * 100) : null, notes: notes };
  }

  // Concepts across notes (#tags and [[links]]) with how well their cards are held.
  function conceptMap(input) {
    var map = {}, states = input.states || {};
    (input.items || []).filter(function (i) { return i.kind === 'note'; }).forEach(function (n) {
      conceptsIn((n.title || '') + ' ' + (n.body || '')).forEach(function (c) {
        var m = map[c.key] || (map[c.key] = { key: c.key, label: c.label, notes: 0, courses: {}, cards: 0, seen: 0, boxSum: 0 });
        m.notes += 1; if (n.course_label) m.courses[n.course_label] = 1;
      });
    });
    (input.cards || []).forEach(function (card) {
      card.tags.forEach(function (t) {
        var m = map[t]; if (!m) return;
        m.cards += 1; var st = states[card.id];
        if (st) { m.seen += 1; m.boxSum += st.box; }
      });
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      return { key: k, label: m.label, notes: m.notes, courses: Object.keys(m.courses), cards: m.cards,
        strength: m.cards ? Math.round(m.boxSum / ((BOX_DAYS.length - 1) * m.cards) * 100) : null };
    }).sort(function (a, b) { return (b.notes - a.notes) || (a.label < b.label ? -1 : 1); });
  }

  // "Ask my notes" without AI: rank notes by the question's words and return the best sentence.
  var STOP = ' the and for are was what when where which with from that this how why does into über und der die das ist wie was wann eine einer den dem des ';
  function searchNotes(items, query, limit) {
    var words = String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 3 && STOP.indexOf(' ' + w + ' ') === -1; });
    if (!words.length) return [];
    return (items || []).filter(function (i) { return i.kind === 'note' || i.kind === 'resource'; }).map(function (n) {
      var title = String(n.title || '').toLowerCase(), body = String(n.body || '');
      var lower = body.toLowerCase(), score = 0;
      words.forEach(function (w) { if (title.indexOf(w) !== -1) score += 3; var p = -1; while ((p = lower.indexOf(w, p + 1)) !== -1) score += 1; });
      var sentences = body.split(/(?<=[.!?])\s+|\n+/).filter(Boolean), best = '', bestN = 0;
      sentences.forEach(function (s) { var n2 = words.filter(function (w) { return s.toLowerCase().indexOf(w) !== -1; }).length; if (n2 > bestN) { bestN = n2; best = s; } });
      return { item: n, score: score, snippet: plain(best || body.slice(0, 160)) };
    }).filter(function (r) { return r.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 5);
  }

  // Card ideas from plain sentences such as "X is Y" (the non-AI fallback for "suggest cards").
  function suggestCards(text) {
    var out = [], BAD = /^(use|using|when|if|that|this|it|there|here|you|we|they|which|what|so|but|and|or|for|wenn|dass|es|man)$/i;
    String(text || '').split(/(?<=[.!?])\s+|\n+/).forEach(function (s) {
      var m = s.trim().match(/^((?:an?|the|der|die|das|ein|eine)\s+)?([^.,;:]{2,50}?)\s+(is|are|means|refers to|ist|sind|bedeutet)\s+(.{8,240}?)[.!?]?$/i);
      if (!m || /\{\{|::|^\s*[qa]\s*:/i.test(s)) return;
      var subj = plain(m[2]), words = subj.split(' ');
      if (words.length > 5 || BAD.test(words[0]) || words.some(function (w) { return /^(when|if|that|because|wenn|weil)$/i.test(w); })) return;
      var de = /^(ist|sind|bedeutet)$/i.test(m[3]), art = m[1] ? m[1].trim().toLowerCase() + ' ' : '';
      var verb = m[3].toLowerCase();
      out.push({ front: (de ? 'Was ' + verb + ' ' : 'What ' + (verb === 'is' || verb === 'are' ? verb : 'does ' + art + subj + ' ' + (verb === 'means' ? 'mean' : 'refer to')) + ' ') + (de || verb === 'is' || verb === 'are' ? art + subj : '').trim() + '?', back: plain(m[4]) });
    });
    return out.slice(0, 5).map(function (c) { c.front = c.front.replace(/\s+\?$/, '?').replace(/\s+/g, ' '); return c; });
  }

  // Approve-first suggestions: Study HQ proposes, the student approves. Fixed rules, in this order.
  function suggestions(input) {
    var now = input.now || new Date(), today = startOfDay(now), out = [];
    (input.classes || []).filter(function (c) { return c.needsCapture; }).forEach(function (c) { out.push({ k: 'capture', id: 'capture:' + c.id, course: c.course }); });
    if (input.queue && input.queue.total) out.push({ k: 'review', id: 'review:' + iso(today), n: input.queue.total, minutes: input.queue.minutes });
    (input.exams || []).forEach(function (x) {
      var n = Math.round((parseDay(x.exam_date) - today) / DAY), tasks = (input.tasksByExam || {})[x.id] || [];
      if (n >= 0 && n <= 21 && !tasks.length) out.push({ k: 'plan', id: 'plan:' + x.id, exam: x.title, days: n });
      if (n >= 0 && n <= 14) {
        var unsure = tasks.filter(function (t) { return t.unsure && !t.done_at; }).map(function (t) { return t.topic; });
        if (unsure.length) out.push({ k: 'rescue', id: 'rescue:' + x.id + ':' + unsure[0], topic: unsure[0], course: x.course_code || x.title, days: n });
      }
    });
    var wd = now.getDay();
    if ((wd === 5 || wd === 6 || wd === 0) && !input.reflectedThisWeek) out.push({ k: 'reflect', id: 'reflect:' + iso(today) });
    var dismissed = input.dismissed || [];
    return out.filter(function (s) { return dismissed.indexOf(s.id) === -1; });
  }


  /* ---------------------------------------------------------------- timetable import (iCal / .ics)
     Campus systems (Stud.IP, TUCaN, ZEuS, campo, eKVV, Moodle) export a semester as iCal. Some send
     one weekly event with an RRULE, others one event per meeting. Either way we keep the weekly
     pattern: the same title on the same weekday at the same time, seen at least twice (or with a
     weekly RRULE) and still running in the last two weeks. One-off events whose title looks like an
     exam become suggested exam dates. Nothing is saved until the student confirms the list. */
  var EXAM_WORDS = /(?<!\p{L})(klausur|prüfung|pruefung|exam|examination|final exam|midterm|sınav|sinav|امتحان|اختبار)(?!\p{L})/iu;
  var KIND_WORDS = [
    [/(?<!\p{L})(vorlesung|lecture|vl)(?!\p{L})/iu, 'Lecture'], [/(?<!\p{L})(übung|uebung|exercise|ü|ue|tutorium|tutorial)(?!\p{L})/iu, 'Tutorial'],
    [/(?<!\p{L})(seminar|se)(?!\p{L})/iu, 'Seminar'], [/(?<!\p{L})(praktikum|lab|labor)(?!\p{L})/iu, 'Lab']
  ];
  function icsUnescape(v) { return String(v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim(); }
  function icsDate(prop) {
    // prop = { params: 'TZID=Europe/Berlin' | 'VALUE=DATE' | '', value: '20261020T081500Z' }
    var m = String(prop.value || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    if (!m[4]) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
    var d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return { date: d, allDay: false };
  }
  function parseICS(text, opts) {
    opts = opts || {};
    var now = opts.now || new Date(), recent = addDays(startOfDay(now), -14);
    var lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    var events = [], ev = null, i;
    for (i = 0; i < lines.length && events.length < 5000; i++) {
      var line = lines[i];
      if (/^BEGIN:VEVENT/i.test(line)) { ev = {}; continue; }
      if (/^END:VEVENT/i.test(line)) { if (ev) events.push(ev); ev = null; continue; }
      if (!ev) continue;
      var c = line.indexOf(':'); if (c < 1) continue;
      var head = line.slice(0, c), value = line.slice(c + 1), semi = head.indexOf(';');
      var name = (semi === -1 ? head : head.slice(0, semi)).toUpperCase(), params = semi === -1 ? '' : head.slice(semi + 1);
      if (name === 'SUMMARY' || name === 'LOCATION' || name === 'RRULE' || name === 'STATUS') ev[name] = value;
      else if (name === 'DTSTART' || name === 'DTEND') ev[name] = { params: params, value: value.trim() };
    }
    var groups = {}, exams = [], seenExam = {};
    events.forEach(function (e) {
      if (/^CANCELLED$/i.test(e.STATUS || '')) return;
      var title = icsUnescape(e.SUMMARY).slice(0, 120);
      var s = e.DTSTART && icsDate(e.DTSTART), en = e.DTEND && icsDate(e.DTEND);
      if (!title || !s) return;
      if (EXAM_WORDS.test(title) && !e.RRULE) {
        var day = iso(s.date), k = title + '|' + day;
        if (s.date >= startOfDay(now) && !seenExam[k]) { seenExam[k] = 1; exams.push({ course_label: title, date: day }); }
        return;
      }
      if (s.allDay) return;
      var end = en && !en.allDay ? en.date : new Date(s.date.getTime() + 90 * 60000);
      var wd = ((s.date.getDay() + 6) % 7) + 1, st = pad(s.date.getHours()) + ':' + pad(s.date.getMinutes()), et = pad(end.getHours()) + ':' + pad(end.getMinutes());
      var rr = String(e.RRULE || ''), weekly = /FREQ=WEEKLY/i.test(rr), last = s.date;
      if (weekly) {
        var u = rr.match(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i);
        last = u ? icsDate({ value: u[1] }).date : addDays(now, 365);
      }
      var days = [wd];
      var by = rr.match(/BYDAY=([A-Z,0-9+-]+)/i);
      if (weekly && by) {
        var map = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
        days = by[1].split(',').map(function (x) { return map[x.replace(/[^A-Z]/gi, '').toUpperCase()]; }).filter(Boolean);
      }
      days.forEach(function (d) {
        var key = title.toLowerCase() + '|' + d + '|' + st + '|' + et;
        var g = groups[key] || (groups[key] = { course_label: title, weekday: d, start: st, end: et, room: icsUnescape(e.LOCATION).slice(0, 120), count: 0, weekly: false, last: last });
        g.count++; if (weekly) g.weekly = true; if (last > g.last) g.last = last;
        if (!g.room && e.LOCATION) g.room = icsUnescape(e.LOCATION).slice(0, 120);
      });
    });
    var classes = [], skipped = 0;
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if ((g.weekly || g.count >= 2) && g.last >= recent) {
        var kind = null; KIND_WORDS.forEach(function (kw) { if (!kind && kw[0].test(g.course_label)) kind = kw[1]; });
        classes.push({ course_label: g.course_label, kind: kind, room: g.room || null, weekday: g.weekday, start: g.start, end: g.end, count: g.count });
      } else skipped++;
    });
    classes.sort(function (a, b) { return a.weekday - b.weekday || hm(a.start) - hm(b.start); });
    exams.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { classes: classes.slice(0, 300), exams: exams.slice(0, 40), events: events.length, skipped: skipped };
  }

  // Exam period: the six weeks before a student's next exam change what Today puts first.
  function examMode(input) {
    var today = startOfDay(input.now || new Date()), next = null;
    (input.exams || []).forEach(function (x) {
      var d = parseDay(x.exam_date), n = Math.round((d - today) / DAY);
      if (n >= 0 && n <= 42 && (!next || n < next.days)) next = { exam: x, days: n };
    });
    return { on: !!next, next: next };
  }

  var api = {
    courseKey: courseKey, iso: iso, parseDay: parseDay, startOfDay: startOfDay, addDays: addDays,
    sessionStart: sessionStart, dueOf: dueOf, buildCourses: buildCourses, courseProgress: courseProgress,
    whatNext: whatNext, weekPlan: weekPlan, achievements: achievements, DEFAULT_EST: DEFAULT_EST,
    conceptsIn: conceptsIn, parseCards: parseCards, reviewNext: reviewNext, reviewQueue: reviewQueue,
    todayClasses: todayClasses, learningRecord: learningRecord, conceptMap: conceptMap, searchNotes: searchNotes,
    suggestCards: suggestCards, suggestions: suggestions, BOX_DAYS: BOX_DAYS,
    parseICS: parseICS, examMode: examMode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StudyHQ = api;
})(typeof window !== 'undefined' ? window : globalThis);
