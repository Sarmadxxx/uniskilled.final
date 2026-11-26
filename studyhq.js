/* UniSkilled Study HQ — the student's private study workspace (studyhq.html): shared core.
 *
 * ISOLATION: Study HQ only WRITES to its own tables (study_courses, study_timetable, study_items,
 * study_files, study_card_states, study_activity, study_reflections) and its own private storage
 * bucket (study-files). It READS users (name, verification badge), student_profiles and sessions
 * (booked lessons) through their existing policies and never changes them. Booking, payments,
 * verification and the existing dashboards are not touched.
 *
 *   logic  studyhq-logic.js (pure, tested): planning, review scheduling, iCal import, search
 *   design studyhq-skin-garden.js (Study Garden): lays the screens out from the view models below
 * User text is always escaped (esc). ?demo=1 runs on invented sample data in memory (studyhq-demo.js)
 * and never touches the database.
 */
(function () {
  'use strict';
  var H = window.StudyHQ;
  var params = new URLSearchParams(location.search);
  var DEMO = params.get('demo') === '1';
  var hq = document.getElementById('hq');

  function T(k, en, v) {
    if (window.I18N) return window.I18N.t('studyhq.js.' + k, en, v);
    return String(en).replace(/\{\{(\w+)\}\}/g, function (m, x) { return v && x in v ? v[x] : m; });
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : null; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function track(ev, props) { try { window.usTrack && window.usTrack(ev, props || {}); } catch (e) {} }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'shq-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------------------------------------------------------------- icons */
  var I = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"/>',
    exam: '<path d="M9 3h6l1 3H8z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 12h6M9 16h4"/>',
    note: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 18h.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    link: '<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
    tick: '<path d="M5 12l5 5 9-10"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    seal: '<circle cx="12" cy="10" r="6"/><path d="M9 15l-2 6 5-3 5 3-2-6"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
    brain: '<path d="M9 4a3 3 0 00-3 3v.5A3 3 0 004 10.5 3 3 0 005 13a3 3 0 001 5.5A3 3 0 009 20h1V4z"/><path d="M15 4a3 3 0 013 3v.5a3 3 0 012 3 3 3 0 01-1 2.5 3 3 0 01-1 5.5A3 3 0 0115 20h-1V4z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
  };
  function ic(n, s, cls) { s = s || 16; return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + '</svg>'; }

  /* ---------------------------------------------------------------- state */
  var S = { uid: null, user: {}, profile: {}, follows: [], exams: [], tasksByExam: {}, sessions: [], items: [], itemsReady: true, courses: null, demoTerm: null,
    dailyReady: false, timetable: [], cardStates: {}, log: [], reflections: [], files: [],
    planner: [], finished: [], help: { tutorsByKey: {}, requested: [], ready: false } };
  var ui = {
    minutes: [30, 60, 120].reduce(function (best, m) { var v = lsGet('shq_minutes', 60); return Math.abs(m - v) < Math.abs(best - v) ? m : best; }, 60),
    capacity: lsGet('shq_capacity', 120),
    weekOffset: 0, noteFilter: 'all', asgFilter: 'all', noteSel: null, courseTab: 'overview',
    skipped: lsGet('shq_skip_' + H.iso(new Date()), []),
    dismissed: lsGet('shq_dismiss_' + H.iso(new Date()), []),
    review: null, ask: null, focus: null, libQ: '',
    dlType: 'all', hideHelp: lsGet('shq_hide_help', false), reviewCap: 15
  };

  /* Course colours: muted by default (each skin can supply its own palette of the same length). */
  var colorMap = {}, colorSeq = 0;
  function palette() { return (skin && skin.palette) || ['#2457c5', '#2f7a6b', '#7a5aa6', '#b4693a', '#3c7ea8', '#a34d6d', '#5b6b2f', '#4b5bb0']; }
  function courseIndex(key) {
    if (!key) return -1;
    if (colorMap[key] == null) { colorMap[key] = colorSeq++; }
    return colorMap[key];
  }
  function colorOf(key) { var i = courseIndex(key); var p = palette(); return i < 0 ? '#94a3b8' : p[i % p.length]; }
  function recompute() {
    S.courses = H.buildCourses({ follows: S.follows, exams: S.exams, items: S.items, sessions: S.sessions });
    S.follows.forEach(function (f) { courseIndex(f.course_key || H.courseKey(f.course_code)); });
    S.exams.forEach(function (x) { courseIndex(x.course_key || H.courseKey(x.course_code || x.title)); });
    S.items.forEach(function (i) { courseIndex(i.course_key || H.courseKey(i.course_label)); });
  }

  /* ---------------------------------------------------------------- data */
  // Study HQ's own connection to the database, created the same way every other UniSkilled page creates one.
  if (!DEMO && !window._sb && window.supabase && window.USK_CONFIG) {
    window._sb = window.supabase.createClient(window.USK_CONFIG.url, window.USK_CONFIG.anonKey, { realtime: { params: { eventsPerSecond: 0 } } });
  }
  // One exam list from the Exam planner, course exam dates and lesson bookings (see H.mergeExams).
  function mergeAllExams() {
    S.exams = H.mergeExams({
      planner: S.planner,
      courses: S.follows.filter(function (f) { return f.exam_date; }).map(function (f) { return { id: 'exam-' + f.id, courseId: f.id, title: f.course_code, course_code: f.course_code, course_key: f.course_key, exam_date: f.exam_date }; }),
      sessions: S.sessions
    });
  }
  var store = DEMO ? demoStore() : liveStore();

  function liveStore() {
    var sb = window._sb;
    function fail(r) { if (r.error) throw r.error; return r.data; }
    function courseRow(c) { return { id: c.id, course_code: c.name, course_key: c.course_key, exam_date: c.exam_date }; }
    function examsFromCourses() { mergeAllExams(); }
    function classRow(r) { return { id: r.id, course_label: r.course_label, kind: r.kind, room: r.room, weekday: r.weekday, start: r.start_hm, end: r.end_hm, source: r.source }; }
    var api2 = {
      load: async function () {
        var uid = S.uid;
        var rs = await Promise.all([
          sb.from('users').select('id,full_name,university_email_verified').eq('id', uid).maybeSingle(),
          sb.from('student_profiles').select('university,degree,year_of_study').eq('user_id', uid).maybeSingle(),
          sb.from('sessions').select('id,subject,tutor_id,tutor_name,status,starts_at,scheduled_date,scheduled_time,duration_minutes,completed_at,exam_date').eq('student_id', uid).order('created_at', { ascending: false }).limit(300),
          sb.from('study_courses').select('id,name,course_key,exam_date,archived').eq('user_id', uid).order('created_at'),
          sb.from('study_items').select('*').eq('user_id', uid).order('created_at'),
          sb.from('study_timetable').select('*').eq('user_id', uid),
          sb.from('study_card_states').select('card_id,box,due,reviews,right_n,last').eq('user_id', uid),
          sb.from('study_activity').select('type,n,right_n,minutes,at').eq('user_id', uid).gte('at', new Date(Date.now() - 120 * 86400000).toISOString()).order('at'),
          sb.from('study_reflections').select('week,went,stuck,aim').eq('user_id', uid),
          sb.from('study_files').select('id,name,path,mime,size_bytes,pages,course_label,course_key,created_at,text_content').eq('user_id', uid).order('created_at', { ascending: false }),
          // Read-only: exams and revision plans the student made in the Exam planner (Study HQ never changes them)
          sb.from('student_exams').select('id,title,course_code,course_key,exam_date,topics').eq('student_id', uid).order('exam_date'),
          sb.from('exam_plan_tasks').select('id,exam_id,day,topic,kind,done_at,unsure,created_at').eq('student_id', uid).order('day')
        ]);
        S.user = fail(rs[0]) || {};
        S.profile = rs[1].data || {};
        S.sessions = rs[2].data || [];
        // Until the Study HQ tables exist (migration not applied yet), show the page read-only.
        S.itemsReady = S.dailyReady = !rs[3].error && !rs[4].error;
        if (!S.itemsReady) { S.follows = []; S.items = []; S.exams = []; return; }
        S.follows = (rs[3].data || []).filter(function (c) { return !c.archived; }).map(courseRow);
        S.finished = (rs[3].data || []).filter(function (c) { return c.archived; }).map(function (c) { return c.name; });
        S.planner = rs[10].error ? [] : (rs[10].data || []);
        S.tasksByExam = {};
        if (!rs[11].error) (rs[11].data || []).forEach(function (t) { (S.tasksByExam[t.exam_id] = S.tasksByExam[t.exam_id] || []).push(t); });
        examsFromCourses();
        S.items = rs[4].data || [];
        S.timetable = (rs[5].data || []).map(classRow);
        S.cardStates = {}; (rs[6].data || []).forEach(function (c) { S.cardStates[c.card_id] = { box: c.box, due: c.due, reviews: c.reviews, right: c.right_n, last: c.last }; });
        S.log = (rs[7].data || []).map(function (e) { return { type: e.type, n: e.n, right: e.right_n, minutes: e.minutes, at: e.at }; });
        S.reflections = (rs[8].data || []).map(function (r) { return { week: r.week, went: r.went, stuck: r.stuck, aim: r.aim }; });
        S.files = rs[9].data || [];
      },
      addItem: async function (row) { var r = await sb.from('study_items').insert(Object.assign({ user_id: S.uid }, row)).select().single(); var x = fail(r); S.items.push(x); return x; },
      updateItem: async function (id, patch) {
        var r = await sb.from('study_items').update(patch).eq('id', id).eq('user_id', S.uid).select().single();
        var row = fail(r); S.items = S.items.map(function (x) { return x.id === id ? row : x; });
      },
      deleteItem: async function (id) { fail(await sb.from('study_items').delete().eq('id', id).eq('user_id', S.uid)); S.items = S.items.filter(function (x) { return x.id !== id; }); },
      // Revision tasks belong to the separate Exam planner; Study HQ does not change them.
      setTask: async function () { throw new Error('read only'); },
      // "Exam help": read-only. Tutors who listed one of these courses (same tables and rules as course.html)
      // and the student's own open tutor requests. Nothing is written here.
      loadHelp: async function (keys) {
        var out = { tutorsByKey: {}, requested: [], ready: true };
        try {
          var req = await sb.from('subject_requests').select('subject,status').eq('student_id', S.uid).eq('status', 'open').limit(50);
          out.requested = (req.data || []).map(function (r) { return H.courseKey(r.subject); }).filter(Boolean);
          if (keys.length) {
            var tc = await sb.from('tutor_courses').select('tutor_id,course_code,course_name,course_key,university,grade').in('course_key', keys).limit(200);
            var rows = tc.data || [], ids = rows.map(function (r) { return r.tutor_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
            if (ids.length) {
              var r3 = await Promise.all([
                sb.from('tutor_profiles').select('user_id,hourly_rate,currency,is_active,university_verified_at,verified_university,avatar_url').in('user_id', ids),
                sb.from('public_tutors').select('id,full_name,avatar_url').in('id', ids),
                sb.from('reviews').select('tutor_id,rating').in('tutor_id', ids)
              ]);
              keys.forEach(function (k) {
                out.tutorsByKey[k] = H.rankTutors({ rows: rows.filter(function (r) { return r.course_key === k; }), profiles: r3[0].data || [], people: r3[1].data || [], reviews: r3[2].data || [], myUni: (S.profile || {}).university });
              });
            }
          }
        } catch (e) { /* help is a nice-to-have: never block the page */ }
        S.help = out;
      },
      follow: async function (label) {
        var r = await sb.from('study_courses').insert({ user_id: S.uid, name: label }).select('id,name,course_key,exam_date').single();
        S.follows.push(courseRow(fail(r))); examsFromCourses();
      },
      unfollow: async function (id) { fail(await sb.from('study_courses').delete().eq('id', id).eq('user_id', S.uid)); S.follows = S.follows.filter(function (f) { return f.id !== id; }); examsFromCourses(); },
      setExam: async function (id, date) {
        fail(await sb.from('study_courses').update({ exam_date: date || null }).eq('id', id).eq('user_id', S.uid));
        S.follows.forEach(function (f) { if (f.id === id) f.exam_date = date || null; }); examsFromCourses();
      },
      addClasses: async function (rows) {
        if (!rows.length) return;
        var r = await sb.from('study_timetable').insert(rows.map(function (c) { return { user_id: S.uid, course_label: c.course_label, kind: c.kind || null, room: c.room || null, weekday: c.weekday, start_hm: c.start, end_hm: c.end, source: c.source || 'manual' }; })).select();
        S.timetable = S.timetable.concat((fail(r) || []).map(classRow));
      },
      deleteClass: async function (id) { fail(await sb.from('study_timetable').delete().eq('id', id).eq('user_id', S.uid)); S.timetable = S.timetable.filter(function (c) { return c.id !== id; }); },
      setCard: async function (id, st) {
        fail(await sb.from('study_card_states').upsert({ user_id: S.uid, card_id: String(id).slice(0, 120), box: st.box, due: st.due, reviews: st.reviews || 0, right_n: st.right || 0, last: st.last || null, updated_at: new Date().toISOString() }));
        S.cardStates[id] = st;
      },
      log: async function (e) {
        var row = { user_id: S.uid, type: e.type, n: e.n == null ? null : e.n, right_n: e.right == null ? null : e.right, minutes: e.minutes == null ? null : e.minutes };
        try { fail(await sb.from('study_activity').insert(row)); } catch (ex) { /* the record is a nice-to-have: never block the student */ }
        S.log.push(Object.assign({ at: new Date().toISOString() }, e));
      },
      reflect: async function (rf) {
        fail(await sb.from('study_reflections').upsert({ user_id: S.uid, week: rf.week, went: rf.went || null, stuck: rf.stuck || null, aim: rf.aim || null, updated_at: new Date().toISOString() }));
        S.reflections = S.reflections.filter(function (x) { return x.week !== rf.week; }); S.reflections.push(rf);
      },
      addFile: async function (blob, meta) {
        var path = S.uid + '/' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) + meta.ext;
        fail(await sb.storage.from('study-files').upload(path, blob, { contentType: meta.mime, upsert: false }));
        var r = await sb.from('study_files').insert({ user_id: S.uid, name: meta.name, path: path, mime: meta.mime, size_bytes: blob.size, pages: meta.pages == null ? null : meta.pages, text_content: meta.text || null, course_label: meta.course_label || null }).select('id,name,path,mime,size_bytes,pages,course_label,course_key,created_at,text_content').single();
        if (r.error) { await sb.storage.from('study-files').remove([path]); throw r.error; }
        S.files.unshift(r.data); return r.data;
      },
      fileUrl: async function (f) { var r = await sb.storage.from('study-files').createSignedUrl(f.path, 300); return fail(r).signedUrl; },
      deleteFile: async function (f) {
        fail(await sb.storage.from('study-files').remove([f.path]));
        fail(await sb.from('study_files').delete().eq('id', f.id).eq('user_id', S.uid));
        S.files = S.files.filter(function (x) { return x.id !== f.id; });
      },
      deleteEverything: async function () {
        var paths = S.files.map(function (f) { return f.path; });
        for (var i = 0; i < paths.length; i += 100) fail(await sb.storage.from('study-files').remove(paths.slice(i, i + 100)));
        var tables = ['study_files', 'study_items', 'study_timetable', 'study_card_states', 'study_activity', 'study_reflections', 'study_courses'];
        for (var j = 0; j < tables.length; j++) fail(await sb.from(tables[j]).delete().eq('user_id', S.uid));
        S.follows = []; S.exams = []; S.items = []; S.timetable = []; S.cardStates = {}; S.log = []; S.reflections = []; S.files = [];
      }
    };
    return api2;
  }

  function demoStore() {
    var seq = 0, blobs = {};
    function nid() { seq += 1; return 'new-' + seq; }
    function withDone(row) { row.done_at = row.status === 'done' ? (row.done_at || new Date().toISOString()) : null; row.updated_at = new Date().toISOString(); return row; }
    function examsFromCourses() { mergeAllExams(); }
    return {
      loadHelp: async function () { S.help = window.StudyHQDemo.help ? window.StudyHQDemo.help() : { tutorsByKey: {}, requested: [], ready: true }; },
      load: async function () {
        var d = window.StudyHQDemo.build(new Date());
        S.user = d.user; S.profile = d.profile; S.sessions = d.sessions; S.items = d.items; S.itemsReady = true;
        S.follows = d.follows.map(function (f) {
          var x = d.exams.filter(function (e) { return (e.course_key || H.courseKey(e.course_code)) === (f.course_key || H.courseKey(f.course_code)); })[0];
          return Object.assign({}, f, { exam_date: x ? x.exam_date : null });
        });
        S.planner = d.planner || []; S.finished = d.finished || [];
        S.tasksByExam = d.tasksByExam || {};
        examsFromCourses();
        S.demoTerm = d.term || null;
        S.timetable = d.timetable || []; S.cardStates = d.cardStates || {}; S.log = d.log || []; S.reflections = d.reflections || []; S.files = d.files || []; S.dailyReady = true;
      },
      addItem: async function (row) { var x = withDone(Object.assign({ id: nid(), status: 'todo', created_at: new Date().toISOString() }, row)); S.items.push(x); return x; },
      updateItem: async function (id, patch) { S.items = S.items.map(function (x) { return x.id === id ? withDone(Object.assign({}, x, patch)) : x; }); },
      deleteItem: async function (id) { S.items = S.items.filter(function (x) { return x.id !== id; }); },
      setTask: async function () { throw new Error('read only'); },
      follow: async function (label) { S.follows.push({ id: nid(), course_code: label, course_key: H.courseKey(label), exam_date: null }); },
      unfollow: async function (id) { S.follows = S.follows.filter(function (f) { return f.id !== id; }); examsFromCourses(); },
      setExam: async function (id, date) { S.follows.forEach(function (f) { if (f.id === id) f.exam_date = date || null; }); examsFromCourses(); },
      addClasses: async function (rows) { rows.forEach(function (c) { S.timetable.push(Object.assign({ id: nid() }, c)); }); },
      deleteClass: async function (id) { S.timetable = S.timetable.filter(function (c) { return c.id !== id; }); },
      setCard: async function (id, st) { S.cardStates[id] = st; },
      log: async function (e) { S.log.push(Object.assign({ at: new Date().toISOString() }, e)); },
      reflect: async function (r) { S.reflections = S.reflections.filter(function (x) { return x.week !== r.week; }); S.reflections.push(r); },
      addFile: async function (blob, meta) {
        var f = { id: nid(), name: meta.name, path: 'demo/' + nid() + meta.ext, mime: meta.mime, size_bytes: blob.size, pages: meta.pages, text_content: meta.text || null, course_label: meta.course_label || null, course_key: H.courseKey(meta.course_label), created_at: new Date().toISOString() };
        blobs[f.id] = URL.createObjectURL(blob); S.files.unshift(f); return f;
      },
      fileUrl: async function (f) { return blobs[f.id] || null; },
      deleteFile: async function (f) { S.files = S.files.filter(function (x) { return x.id !== f.id; }); },
      deleteEverything: async function () { S.follows = []; S.exams = []; S.items = []; S.timetable = []; S.cardStates = {}; S.log = []; S.reflections = []; S.files = []; }
    };
  }

  /* ---------------------------------------------------------------- term (kept on this device) */
  function term() {
    var t = lsGet('shq_term' + (DEMO ? '_demo' : ''), null) || S.demoTerm;
    if (!t || !t.start || !t.end) return null;
    var s = H.parseDay(t.start), e = H.parseDay(t.end), now = H.startOfDay(new Date());
    var weeks = Math.max(1, Math.ceil(((e - s) / 86400000 + 1) / 7));
    var week = Math.min(weeks, Math.max(1, Math.floor((now - s) / 86400000 / 7) + 1));
    var pct = Math.max(0, Math.min(100, Math.round((now - s) / Math.max(1, e - s) * 100)));
    var daysLeft = Math.max(0, Math.round((e - now) / 86400000));
    return { name: t.name || T('this-term', 'This term'), start: s, end: e, week: now < s ? 0 : week, weeks: weeks, pct: pct, daysLeft: daysLeft, before: now < s, after: now > e };
  }

  /* ---------------------------------------------------------------- formatting */
  function fmt(d, o) { return d.toLocaleDateString([], o); }
  function fmtTime(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function daysUntil(d) { return Math.round((H.startOfDay(d) - H.startOfDay(new Date())) / 86400000); }
  function relDay(d) {
    var n = daysUntil(d);
    if (n < 0) return n === -1 ? T('yesterday', 'Yesterday') : T('days-ago', '{{n}} days ago', { n: -n });
    if (n === 0) return T('today', 'Today');
    if (n === 1) return T('tomorrow', 'Tomorrow');
    if (n < 7) return fmt(d, { weekday: 'long' });
    return fmt(d, { day: 'numeric', month: 'short' });
  }
  function dueText(item) {
    var d = H.dueOf(item); if (!d) return '';
    var n = daysUntil(d);
    if (item.status !== 'done' && d < new Date()) return T('overdue', 'Overdue') + ' · ' + fmt(d, { day: 'numeric', month: 'short' });
    var t = item.due_at ? ' ' + fmtTime(d) : '';
    return n <= 1 ? relDay(d) + t : relDay(d);
  }
  function mins(m) { if (m < 60) return m + ' min'; var h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r : ''); }
  function hours(m) { return (Math.round(m / 6) / 10) + ' h'; }
  function countdown(n) {
    return n < 0 ? T('exam-passed', 'Exam passed') : n === 0 ? T('exam-today', 'Exam today') : n === 1 ? T('exam-tomorrow', 'Exam tomorrow') : T('days-to-go', '{{n}} days to go', { n: n });
  }
  function keyOf(o) { return o.course_key || H.courseKey(o.course_label || o.course_code || o.title); }

  /* ---------------------------------------------------------------- shared building blocks
     Class names start with shq- so every skin can style them its own way. */
  var STATUS = function () { return { todo: T('st.todo', 'To do'), doing: T('st.doing', 'In progress'), blocked: T('st.blocked', 'Blocked'), done: T('st.done', 'Done') }; };
  var TICK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I.tick + '</svg>';
  function checkbox(act, id, done, label, disabled) {
    return '<button type="button" class="shq-check" role="checkbox" aria-checked="' + !!done + '" data-act="' + act + '" data-id="' + esc(id) + '" aria-label="' + esc(label) + '"' + (disabled ? ' disabled' : '') + '>' + (done ? TICK : '') + '</button>';
  }
  function courseTag(label, key) {
    if (!label) return '';
    key = key || H.courseKey(label);
    return '<span class="shq-course"><i class="shq-dot" style="background:' + colorOf(key) + '"></i>' + esc(label) + '</span>';
  }
  function statusSelect(i) {
    if (i.status === 'done') return '';
    var st = STATUS();
    return '<select class="shq-status" data-act="status" data-id="' + esc(i.id) + '" aria-label="' + esc(T('status-of', 'Status of {{t}}', { t: i.title })) + '">' +
      ['todo', 'doing', 'blocked'].map(function (k) { return '<option value="' + k + '"' + (i.status === k ? ' selected' : '') + '>' + esc(st[k]) + '</option>'; }).join('') + '</select>';
  }
  function editBtn(i, cls) { return '<button type="button" class="shq-icon ' + (cls || '') + '" data-act="edit" data-id="' + esc(i.id) + '" aria-label="' + esc(T('edit', 'Edit {{t}}', { t: i.title })) + '">' + ic('edit', 15) + '</button>'; }
  function itemMeta(i, opts) {
    opts = opts || {};
    var done = i.status === 'done', due = H.dueOf(i), late = due && !done && due < new Date();
    var meta = [];
    if (!opts.hideCourse && i.course_label) meta.push(courseTag(i.course_label, i.course_key));
    if (due) meta.push('<span class="shq-due' + (late ? ' late' : '') + '">' + ic('clock', 13) + ' ' + esc(dueText(i)) + '</span>');
    if (i.weight_pct != null) meta.push('<span class="shq-pill">' + esc(T('weight', '{{n}}% of grade', { n: Number(i.weight_pct) })) + '</span>');
    if (i.estimate_min) meta.push('<span class="shq-est">' + esc(mins(i.estimate_min)) + '</span>');
    if (i.status === 'blocked') meta.push('<span class="shq-pill warn">' + esc(i.body || T('st.blocked', 'Blocked')) + '</span>');
    return meta.join('');
  }
  function itemRow(i, opts) {
    var done = i.status === 'done';
    return '<div class="shq-item' + (done ? ' done' : '') + (i.status === 'blocked' ? ' blocked' : '') + '">' +
      checkbox('done', i.id, done, T('mark-done', 'Mark “{{t}}” done', { t: i.title }), !S.itemsReady) +
      '<div class="shq-item-t"><b>' + esc(i.title) + '</b><div class="shq-meta">' + itemMeta(i, opts) + '</div></div>' +
      '<div class="shq-item-side">' + statusSelect(i) + editBtn(i) + '</div></div>';
  }
  var KINDS = function () { return { learn: T('k.learn', 'Learn'), review: T('k.review', 'Review'), practice: T('k.practice', 'Practice') }; };
  function taskRow(t, x) {
    var done = !!t.done_at;
    // Revision steps are ticked in the Exam planner (Study HQ only reads them).
    return '<div class="shq-item' + (done ? ' done' : '') + '"><a class="shq-check' + (done ? ' on' : '') + '" href="exam-planner.html" aria-label="' + esc(T('tick-in-planner', 'Tick “{{t}}” in the Exam planner', { t: t.topic })) + '">' + (done ? ic('tick', 13) : '') + '</a>' +
      '<div class="shq-item-t"><b>' + esc(t.topic) + '</b><div class="shq-meta"><span class="shq-pill info">' + esc(KINDS()[t.kind] || t.kind) + '</span>' + (x ? courseTag(x.course_code || x.title, x.course_key) : '') + (t.unsure ? '<span class="shq-pill warn">' + esc(T('unsure', 'Unsure')) + '</span>' : '') + '</div></div></div>';
  }
  function topicState(x) {
    var tasks = S.tasksByExam[x.id] || [];
    return (x.topics || []).map(function (topic) {
      var mine = tasks.filter(function (t) { return t.topic === topic; });
      var unsure = mine.some(function (t) { return t.unsure; }); // marked unsure in the Exam planner, until unmarked there
      var learned = mine.some(function (t) { return t.kind === 'learn' && t.done_at; });
      return { topic: topic, state: unsure ? 'unsure' : learned ? 'learned' : 'todo' };
    });
  }
  function storageOff() { return S.itemsReady ? '' : ' disabled title="' + esc(T('storage-off', 'Available once Study HQ storage is switched on')) + '"'; }
  function addBtn(kind, label, cls, extra) {
    return '<button type="button" class="' + (cls || 'shq-btn primary') + '" data-act="add" data-kind="' + kind + '"' + (extra || '') + storageOff() + '>' + ic('plus', 15) + '<span>' + esc(label) + '</span></button>';
  }
  function storageNotice() {
    return S.itemsReady ? '' : '<div class="shq-notice">' + esc(T('storage-notice', 'Courses, exams and lessons are live. Saving assignments, tasks and notes switches on once the Study HQ database update is approved.')) + '</div>';
  }
  function reasonText(r) {
    switch (r.k) {
      case 'overdue': return T('r.overdue', 'Overdue');
      case 'due': return r.days === 0 ? T('r.today', 'Due today') : r.days === 1 ? T('r.tomorrow', 'Due tomorrow') : T('r.days', 'Due in {{n}} days', { n: r.days });
      case 'planned': return r.days <= 0 ? T('r.planned-today', 'Planned for today') : T('r.planned', 'Planned for {{d}}', { d: relDay(H.addDays(H.startOfDay(new Date()), r.days)) });
      case 'weight': return T('r.weight', '{{n}}% of the grade', { n: r.pct });
      case 'unsure': return T('r.unsure', 'A topic you marked unsure');
      case 'started': return T('r.started', 'Already started');
      case 'at_risk': return T('r.risk', 'Tight: less time left than it needs');
      case 'no_estimate': return T('r.noest', 'No time estimate yet');
    }
    return '';
  }
  function focusActions(p, cls) {
    cls = cls || {};
    var pri = cls.primary || 'shq-btn primary', sec = cls.secondary || 'shq-btn ghost';
    if (!p) return '';
    var fbtn = S.dailyReady ? '<button type="button" class="' + sec + '" data-act="focus-start" data-v="25" data-t="' + esc(p.title) + '">' + ic('timer', 14) + esc(T('focus-25', 'Focus 25 min')) + '</button>' : '';
    if (p.type === 'exam_task') return '<a class="' + pri + '" href="exam-planner.html">' + esc(T('open-plan-btn', 'Open revision plan')) + '</a>' + fbtn +
      '<button type="button" class="' + sec + '" data-act="skip" data-id="' + esc(p.id) + '">' + esc(T('not-now', 'Not now')) + '</button>';
    var off = S.itemsReady ? '' : ' disabled';
    return (p.ref.status !== 'doing' ? '<button type="button" class="' + pri + '" data-act="start" data-id="' + esc(p.id) + '"' + off + '>' + esc(T('start', 'Start now')) + '</button>' : '') +
      '<button type="button" class="' + (p.ref.status === 'doing' ? pri : sec) + '" data-act="done" data-id="' + esc(p.id) + '"' + off + '>' + esc(T('mark-done-btn', 'Mark done')) + '</button>' + fbtn +
      '<button type="button" class="' + sec + '" data-act="skip" data-id="' + esc(p.id) + '">' + esc(T('not-now', 'Not now')) + '</button>';
  }
  function timeChoices(cls) {
    return [30, 60, 120].map(function (m) {
      var label = m < 60 ? m + ' min' : m === 60 ? T('1h', '1 hour') : T('2h', '2 hours');
      return '<button type="button" class="' + (cls || 'shq-time') + '" data-act="minutes" data-v="' + m + '" aria-pressed="' + (ui.minutes === m) + '">' + esc(label) + '</button>';
    }).join('');
  }
  function noteUrl(n) { var u = safeUrl(n.url); return u ? { href: u, label: u.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 42) } : null; }
  function courseHref(key) { return '#/course/' + encodeURIComponent(key); }
  function tutorHref(key) { return 'course.html?c=' + encodeURIComponent(key); }

  /* ---------------------------------------------------------------- view models */
  function openWork() { return S.items.filter(function (i) { return (i.kind === 'assignment' || i.kind === 'task') && i.status !== 'done'; }); }
  function focusModel() {
    var items = S.items.filter(function (i) { return ui.skipped.indexOf(String(i.id)) === -1; });
    var tbe = {}; Object.keys(S.tasksByExam).forEach(function (k) { tbe[k] = S.tasksByExam[k].filter(function (t) { return ui.skipped.indexOf(String(t.id)) === -1; }); });
    var r = H.whatNext({ items: items, exams: S.exams, tasksByExam: tbe, minutesFree: ui.minutes, dailyMinutes: ui.capacity, now: new Date() });
    r.pick = decoStep(r.pick); r.alternates = r.alternates.map(decoStep);
    r.message = r.state === 'no_items' ? T('wn.none', 'Nothing to plan yet. Add your first assignment or exam and Study HQ will suggest what to do next.')
      : r.state === 'too_little_time' ? T('wn.short', 'Nothing fits in that time. Pick a longer slot, or take the break.')
      : r.state === 'ahead' ? T('wn.ahead', 'You are ahead: nothing is due in the next week. Review a weak topic, or enjoy the free time.')
      : !r.pick ? T('wn.waiting', 'Everything open is blocked or waiting on someone else.') : '';
    r.heldRows = r.held.slice(0, 3).map(function (x) { return { title: x.item.title, why: x.reason === 'blocked' ? (x.item.body || T('blocked', 'Blocked')) : T('confirm', 'Overdue over a week: still needed?') }; });
    return r;
  }
  function decoStep(p) {
    if (!p) return null;
    p.courseKey = p.course ? H.courseKey(p.course) : null;
    p.color = colorOf(p.courseKey);
    p.what = p.type === 'exam_task' ? T('revise-for', 'Revise for {{e}}', { e: p.examTitle }) : p.type === 'assignment' ? T('assignment', 'Assignment') : T('task', 'Task');
    p.headline = p.title;
    p.reasonTexts = p.reasons.map(function (x) { return { k: x.k, text: reasonText(x), risk: x.k === 'at_risk' || x.k === 'overdue' }; });
    return p;
  }

  /* ---------------------------------------------------------------- release 2: today + exams & deadlines */
  function skyModel() {
    var period = H.skyPeriod(new Date().getHours()), K = window.StudyHQSky;
    return { period: period, svg: K ? K.scene(period) : '', ink: K ? K.ink(period) : { ink: '#1f2a24', soft: '#5d6b63', dark: false } };
  }
  function deadlines() { return H.deadlineList({ items: S.items, exams: S.exams, tasksByExam: S.tasksByExam, now: new Date(), dailyMinutes: ui.capacity }); }
  function dlRow(r) {
    var now = new Date(), d = r.due, key = r.courseKey;
    r.key = key; r.color = colorOf(key);
    r.dateParts = { wd: fmt(d, { weekday: 'short' }), day: d.getDate(), mon: fmt(d, { month: 'short' }) };
    if (r.type === 'exam') {
      r.when = countdown(r.days);
      r.meta = [r.plan ? T('plan-steps', 'Revision plan: {{d}} of {{t}} steps', { d: r.plan.done, t: r.plan.total }) : T('no-plan-yet', 'No revision plan yet')].concat(r.unsure.length ? [T('you-marked-unsure', 'You marked {{t}} unsure', { t: r.unsure.slice(0, 2).join(', ') })] : []);
      r.planHref = 'exam-planner.html' + (r.plan ? '' : '?course=' + encodeURIComponent(r.course || ''));
      r.helpHref = 'find-tutors.html?q=' + encodeURIComponent(r.course || '') + '#request';
      r.courseId = r.ref.courseId || null;
    } else {
      var late = d < now;
      r.when = late ? T('was-due', 'Was due {{d}}', { d: relDay(d) }) : relDay(d) + (d.getHours() !== 23 || d.getMinutes() !== 59 ? ' · ' + fmtTime(d) : '');
      r.meta = [r.weight != null ? T('weight', '{{n}}% of grade', { n: r.weight }) : null, r.estimate ? T('about', 'about {{m}}', { m: mins(r.estimate) }) : null, r.status === 'doing' ? T('in-progress', 'in progress') : null].filter(Boolean);
      r.startText = r.startBy ? T('start-by', 'Start by {{d}}', { d: fmt(r.startBy.date, { weekday: 'short', day: 'numeric', month: 'short' }) }) : '';
      r.late = late;
    }
    return r;
  }
  function busyModel(rows) {
    var B = H.busyWeeks({ rows: rows, now: new Date() }), max = Math.max(4, B.max);
    B.weeks.forEach(function (w, i) { w.label = i === 0 ? T('this-wk', 'This wk') : fmt(w.start, { day: 'numeric', month: 'short' }); w.pct = Math.round(w.points / max * 100); });
    var b = B.busiest != null ? B.weeks[B.busiest] : null;
    B.note = b ? T('busiest', 'Busiest: week of {{d}} ({{x}}). Starting early spreads it out.', { d: fmt(b.start, { day: 'numeric', month: 'short' }), x: b.titles.slice(0, 3).join(', ') }) : T('calm-weeks', 'No crowded weeks ahead.');
    return B;
  }
  function deadlinesModel() {
    var L = deadlines(), now = new Date();
    var rows = L.rows.filter(function (r) { return (ui.dlType === 'all' || (ui.dlType === 'exam' ? r.type === 'exam' : r.type !== 'exam')) && (ui.asgFilter === 'all' || r.courseKey === ui.asgFilter); }).map(dlRow);
    var wk = H.startOfWeek(now), names = {
      overdue: T('g.decide', 'Needs a decision'), week: T('g.thisweek', 'This week'),
      next: T('g.nextweek', 'Next week · {{a}} – {{b}}', { a: fmt(H.addDays(wk, 7), { day: 'numeric', month: 'short' }), b: fmt(H.addDays(wk, 13), { day: 'numeric', month: 'short' }) }), later: T('g.later', 'Later')
    };
    var groups = ['overdue', 'week', 'next', 'later'].map(function (g) { return { key: g, name: names[g], rows: rows.filter(function (r) { return r.group === g; }) }; }).filter(function (g) { return g.rows.length; });
    var work = S.items.filter(function (i) { return i.kind === 'assignment' || i.kind === 'task'; });
    return {
      groups: groups, counts: L.counts, busy: busyModel(L.rows), oldOverdue: L.oldOverdue, doneThisWeek: L.doneThisWeek,
      nodate: work.filter(function (i) { return i.status !== 'done' && !i.due_at; }),
      done: work.filter(function (i) { return i.status === 'done'; }).sort(function (a, b) { return String(b.done_at || '').localeCompare(String(a.done_at || '')); }).slice(0, 8),
      type: ui.dlType, filters: filterList(work.concat(S.exams.map(function (x) { return { course_label: x.course_code || x.title, course_key: keyOf(x) }; }))), filter: ui.asgFilter,
      courses: S.courses.list.map(function (c) { return c.label; })
    };
  }
  function todayModel(daily) {
    var now = new Date(), L = deadlines();
    var plan = H.dayPlan({ items: S.items, exams: S.exams, tasksByExam: S.tasksByExam, minutes: ui.minutes, reviewCount: daily.ready ? daily.queue.total : 0,
      reviewMinutes: daily.queue.minutes, dailyMinutes: ui.capacity, now: now, skip: ui.skipped });
    plan.steps = plan.steps.map(function (st) {
      if (st.type === 'review') return { type: 'review', id: 'review', title: T('review-n', 'Review {{n}} cards', { n: st.n }), minutes: st.minutes,
        why: daily.queue.waiting ? T('review-why-cap', 'Capped at {{c}} today so it never piles up. {{w}} more wait for days with time.', { c: ui.reviewCap, w: daily.queue.waiting }) : T('review-why', 'Spaced review keeps what you learned.') };
      var d = decoStep(st);
      d.why = d.reasonTexts.map(function (x) { return x.text; }).slice(0, 2).join(' · ');
      return d;
    });
    var late = (L.groups[0] || { rows: [] }).rows.filter(function (r) { return r.type !== 'exam'; }).map(dlRow)[0] || null;
    var today = H.startOfDay(now);
    var spotlight = S.exams.filter(function (x) { return H.parseDay(x.exam_date) >= today; }).slice(0, 2).map(examModel);
    var help = null;
    if (!ui.hideHelp) {
      help = H.examHelp({ exams: S.exams, tutorsByKey: S.help.tutorsByKey, tasksByExam: S.tasksByExam, requested: S.help.requested, finished: S.finished, now: now });
      help.ready = S.help.ready;
      help.cards.forEach(function (c) {
        c.when = countdown(c.days);
        c.requestHref = 'find-tutors.html?q=' + encodeURIComponent(c.course || '') + '#request';
        if (c.tutor) {
          var t = c.tutor;
          c.profileHref = 'tutor-profile.html?id=' + encodeURIComponent(t.id);
          c.bookHref = 'book-session.html?tutor=' + encodeURIComponent(t.id) + '&name=' + encodeURIComponent(t.name) + '&subject=' + encodeURIComponent(t.course || c.course || '');
          if (DEMO) c.profileHref = c.bookHref = 'find-tutors.html'; // the preview's tutor is invented
          c.rateText = t.rate != null ? (t.currency === 'EUR' ? '€' : t.currency === 'USD' ? '$' : t.currency === 'GBP' ? '£' : (t.currency || '') + ' ') + t.rate : '';
          c.initials = String(t.name).split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        }
      });
      if (help.invite) help.invite.href = 'onboarding.html?role=tutor';
    }
    return {
      sky: skyModel(), plan: plan, left: plan.steps.length, late: late, spotlight: spotlight, help: help, hideHelp: ui.hideHelp,
      busy: busyModel(L.rows), soon: L.counts.soon
    };
  }

  function upcoming(daysAhead) {
    var now = new Date(), end = H.addDays(H.startOfDay(now), daysAhead + 1), out = [];
    S.items.forEach(function (i) { var d = H.dueOf(i); if (i.kind === 'assignment' && i.status !== 'done' && d && d < end && d >= H.addDays(H.startOfDay(now), -7)) out.push({ at: d, type: 'due', title: i.title, course: i.course_label, key: keyOf(i), late: d < now, weight: i.weight_pct, item: i }); });
    S.exams.forEach(function (x) { var d = H.parseDay(x.exam_date); if (d >= H.startOfDay(now) && d < end) out.push({ at: d, type: 'exam', title: x.title, course: x.course_code || x.title, key: keyOf(x), exam: x }); });
    S.sessions.forEach(function (s) { var a = H.sessionStart(s); if (s.status === 'confirmed' && a && a >= now && a < end) out.push({ at: a, type: 'lesson', title: T('lesson-with', '{{s}} with {{t}}', { s: s.subject || T('lesson', 'Lesson'), t: s.tutor_name || T('your-tutor', 'your tutor') }), course: s.subject, key: H.courseKey(s.subject), time: true, session: s }); });
    out.forEach(function (e) { e.color = colorOf(e.key); });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function courseModel(c) {
    var p = H.courseProgress(c, S.tasksByExam, new Date());
    return { c: c, p: p, key: c.key, label: c.label, color: colorOf(c.key), href: courseHref(c.key), tutorHref: tutorHref(c.key) };
  }
  function attention() {
    var rows = [];
    S.courses.list.forEach(function (c) {
      var p = H.courseProgress(c, S.tasksByExam, new Date());
      p.unsure.forEach(function (u) { rows.push({ topic: u.topic, exam: u.examTitle, course: c.label, key: c.key, color: colorOf(c.key), tutorHref: tutorHref(c.key) }); });
    });
    return rows;
  }
  function overviewModel() {
    var now = new Date(), hour = now.getHours();
    var weekEnd = H.addDays(H.startOfDay(now), 7);
    var week = H.weekPlan({ start: now, items: S.items, exams: S.exams, tasksByExam: S.tasksByExam, sessions: S.sessions });
    return {
      first: String(S.user.full_name || '').trim().split(/\s+/)[0],
      greet: hour < 12 ? T('morning', 'Good morning') : hour < 18 ? T('afternoon', 'Good afternoon') : T('evening', 'Good evening'),
      dateText: fmt(now, { weekday: 'long', day: 'numeric', month: 'long' }),
      term: term(), profile: S.profile,
      stats: {
        dueWeek: openWork().filter(function (i) { var d = H.dueOf(i); return i.kind === 'assignment' && d && d < weekEnd; }).length,
        overdue: openWork().filter(function (i) { var d = H.dueOf(i); return i.kind === 'assignment' && d && d < now; }).length,
        exams30: S.exams.filter(function (x) { var n = daysUntil(H.parseDay(x.exam_date)); return n >= 0 && n <= 30; }).length,
        lessonsWeek: S.sessions.filter(function (s) { var a = H.sessionStart(s); return s.status === 'confirmed' && a && a >= now && a < weekEnd; }).length,
        plannedWeek: week.reduce(function (a, d) { return a + d.minutes; }, 0)
      },
      focus: focusModel(), daily: dailyModel(),
      get today() { return todayModel(this.daily); },
      week: week, capacity: ui.capacity,
      upcoming: upcoming(10),
      courses: S.courses.list.map(courseModel),
      attention: attention()
    };
  }
  function weekEntries(days) {
    // Each entry gets what a skin needs to draw it: kind, title, course key/colour, minutes, done.
    return days.map(function (d) {
      return { date: d.date, iso: d.iso, minutes: d.minutes, today: d.iso === H.iso(new Date()), entries: d.entries.map(function (e) {
        if (e.type === 'exam') return { type: 'exam', title: e.exam.title, key: keyOf(e.exam), color: colorOf(keyOf(e.exam)) };
        if (e.type === 'due') return { type: 'due', title: e.item.title, key: keyOf(e.item), color: colorOf(keyOf(e.item)), done: e.item.status === 'done', time: e.item.due_at ? fmtTime(new Date(e.item.due_at)) : '', id: e.item.id };
        if (e.type === 'lesson') return { type: 'lesson', title: (e.session.subject || T('lesson', 'Lesson')) + (e.session.tutor_name ? ' · ' + e.session.tutor_name : ''), key: H.courseKey(e.session.subject), color: colorOf(H.courseKey(e.session.subject)), time: fmtTime(e.at), minutes: e.session.duration_minutes || 60 };
        if (e.type === 'revision') return { type: 'revision', title: e.task.topic, course: e.exam.course_code || e.exam.title, key: keyOf(e.exam), color: colorOf(keyOf(e.exam)), done: !!e.task.done_at, id: e.task.id, minutes: 45 };
        return { type: 'planned', title: e.item.title, key: keyOf(e.item), color: colorOf(keyOf(e.item)), done: e.item.status === 'done', blocked: e.item.status === 'blocked', id: e.item.id, minutes: e.item.estimate_min || H.DEFAULT_EST[e.item.kind], kind: e.item.kind };
      }) };
    });
  }
  function plannerModel() {
    var now = new Date();
    var monday = H.addDays(H.startOfDay(now), -((now.getDay() + 6) % 7) + ui.weekOffset * 7);
    var days = weekEntries(H.weekPlan({ start: monday, items: S.items, exams: S.exams, tasksByExam: S.tasksByExam, sessions: S.sessions }));
    var label = ui.weekOffset === 0 ? T('this-week', 'This week') : ui.weekOffset === 1 ? T('next-week', 'Next week') : ui.weekOffset === -1 ? T('last-week', 'Last week') : T('week-of', 'Week of {{d}}', { d: fmt(monday, { day: 'numeric', month: 'short' }) });
    return {
      monday: monday, days: days, label: label, capacity: ui.capacity,
      range: fmt(monday, { day: 'numeric', month: 'short' }) + ' – ' + fmt(H.addDays(monday, 6), { day: 'numeric', month: 'short' }),
      total: days.reduce(function (a, d) { return a + d.minutes; }, 0),
      unplanned: S.items.filter(function (i) { return i.kind === 'task' && i.status !== 'done' && !i.planned_for; }),
      term: term()
    };
  }
  function assignmentsModel() {
    var all = S.items.filter(function (i) { return i.kind === 'assignment'; });
    var list = ui.asgFilter === 'all' ? all : all.filter(function (i) { return keyOf(i) === ui.asgFilter; });
    var now = new Date(), weekEnd = H.addDays(H.startOfDay(now), 7);
    var g = { overdue: [], week: [], later: [], nodate: [], done: [] };
    list.forEach(function (i) {
      var d = H.dueOf(i);
      if (i.status === 'done') g.done.push(i); else if (!d) g.nodate.push(i); else if (d < now) g.overdue.push(i); else if (d < weekEnd) g.week.push(i); else g.later.push(i);
    });
    function byDue(a, b) { return (H.dueOf(a) || 0) - (H.dueOf(b) || 0); }
    Object.keys(g).forEach(function (k) { g[k].sort(byDue); }); g.done.reverse();
    var names = { overdue: T('g.overdue', 'Overdue'), week: T('g.week', 'Due in the next 7 days'), later: T('g.later', 'Later'), nodate: T('g.nodate', 'No due date'), done: T('g.done', 'Done') };
    return {
      all: all, open: all.filter(function (i) { return i.status !== 'done'; }).length,
      groups: ['overdue', 'week', 'later', 'nodate', 'done'].filter(function (k) { return g[k].length; }).map(function (k) { return { key: k, name: names[k], items: k === 'done' ? g[k].slice(0, 10) : g[k], count: g[k].length }; }),
      filters: filterList(all), filter: ui.asgFilter
    };
  }
  function filterList(items) {
    var keys = {};
    S.courses.list.forEach(function (c) { keys[c.key] = c.label; });
    items.forEach(function (i) { if (i.course_label && !keys[keyOf(i)]) keys[keyOf(i)] = i.course_label; });
    return Object.keys(keys).map(function (k) { return { key: k, label: keys[k], color: colorOf(k) }; });
  }
  function examModel(x) {
    var tasks = S.tasksByExam[x.id] || [];
    var done = tasks.filter(function (t) { return t.done_at; }).length;
    var d = H.parseDay(x.exam_date), n = daysUntil(d);
    return {
      x: x, title: x.title, course: x.course_code || x.title, key: keyOf(x), color: colorOf(keyOf(x)), date: d, daysLeft: n, countdown: countdown(n),
      tasks: tasks, done: done, total: tasks.length, pct: tasks.length ? Math.round(done / tasks.length * 100) : 0,
      topics: topicState(x), dueNow: tasks.filter(function (t) { return !t.done_at && H.parseDay(t.day) <= H.startOfDay(new Date()); }),
      unsure: topicState(x).filter(function (t) { return t.state === 'unsure'; }).length,
      planHref: 'exam-planner.html', tutorHref: tutorHref(keyOf(x))
    };
  }
  function examsModel() {
    var today = H.startOfDay(new Date());
    return {
      upcoming: S.exams.filter(function (x) { return H.parseDay(x.exam_date) >= today; }).map(examModel),
      past: S.exams.filter(function (x) { return H.parseDay(x.exam_date) < today; }).map(examModel)
    };
  }
  function notesModel() {
    var all = S.items.filter(function (i) { return i.kind === 'note' || i.kind === 'resource'; });
    var list = ui.noteFilter === 'all' ? all : all.filter(function (i) { return keyOf(i) === ui.noteFilter; });
    list = list.slice().sort(function (a, b) { return (b.updated_at || b.created_at || '') < (a.updated_at || a.created_at || '') ? -1 : 1; });
    return { all: all, list: list.map(function (n) { return { n: n, url: noteUrl(n), key: keyOf(n), color: colorOf(keyOf(n)) }; }), filters: filterList(all), filter: ui.noteFilter, sel: ui.noteSel };
  }
  function courseWorkspace(key) {
    var c = S.courses.byKey[key];
    if (!c) return null;
    var m = courseModel(c);
    var work = c.items.filter(function (i) { return i.kind === 'assignment' || i.kind === 'task'; });
    work.sort(function (a, b) { var ad = H.dueOf(a), bd = H.dueOf(b); if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1; return (ad ? ad.getTime() : Infinity) - (bd ? bd.getTime() : Infinity); });
    m.work = work;
    m.notes = c.items.filter(function (i) { return i.kind === 'note' || i.kind === 'resource'; }).map(function (n) { return { n: n, url: noteUrl(n) }; });
    m.exams = c.exams.slice().sort(function (a, b) { return a.exam_date < b.exam_date ? -1 : 1; }).map(examModel);
    m.lessons = c.sessions.slice().sort(function (a, b) { return (H.sessionStart(b) || 0) - (H.sessionStart(a) || 0); }).map(function (s) { var a = H.sessionStart(s); return { s: s, at: a, tutor: s.tutor_name || T('tutor', 'Tutor'), done: s.status === 'completed' }; });
    m.planHref = 'exam-planner.html?course=' + encodeURIComponent(c.label);
    m.searchHref = 'find-tutors.html?q=' + encodeURIComponent(c.label);
    m.followed = c.followed; m.followId = c.followId;
    m.files = S.files.filter(function (f) { return (f.course_key || H.courseKey(f.course_label)) === key; });
    var fc = S.follows.filter(function (f) { return f.id === c.followId; })[0];
    m.examDate = fc ? fc.exam_date : null;
    m.classes = S.timetable.filter(function (t) { return H.courseKey(t.course_label) === key; });
    m.tab = ui.courseTab;
    return m;
  }
  function progressModel() {
    var rows = S.courses.list.map(courseModel);
    var asgDone = S.items.filter(function (i) { return i.kind === 'assignment' && i.status === 'done'; }).length;
    var asgAll = S.items.filter(function (i) { return i.kind === 'assignment'; }).length;
    var revDone = 0, revAll = 0; Object.keys(S.tasksByExam).forEach(function (k) { revAll += S.tasksByExam[k].length; revDone += S.tasksByExam[k].filter(function (t) { return t.done_at; }).length; });
    var lessons = S.sessions.filter(function (s) { return s.status === 'completed'; });
    var minutes = lessons.reduce(function (a, s) { return a + (s.duration_minutes || 60); }, 0);
    var ach = H.achievements({ user: S.user, profile: S.profile, sessions: S.sessions, items: S.items, exams: S.exams, tasksByExam: S.tasksByExam }).map(function (a) {
      var title, text = '';
      if (a.key === 'uni_email') { title = T('a.uni', 'University email verified'); text = a.university ? T('a.uni-sub', '{{u}}. Confirmed by UniSkilled’s university email check.', { u: a.university }) : T('a.uni-sub2', 'Confirmed by UniSkilled’s university email check.'); }
      else if (a.key === 'lessons') { title = T('a.lessons', '{{n}} tutoring lessons completed', { n: a.count }); text = T('a.lessons-sub', '{{h}} of lessons, recorded by UniSkilled when each lesson ended.', { h: mins(a.minutes) }); }
      else if (a.key === 'plan_done') { title = T('a.plan', 'Finished a revision plan: {{t}}', { t: a.title }); text = T('a.plan-sub', 'Every revision task ticked off.'); }
      else if (a.key === 'assignments') { title = T('a.asg', '{{n}} assignments completed', { n: a.count }); text = T('a.asg-sub', 'Ticked off in Study HQ.'); }
      else { title = a.title; text = a.body || ''; }
      return { level: a.level, key: a.key, id: a.id, title: title, text: text, levelName: { verified: T('lv.verified', 'Verified'), record: T('lv.record', 'UniSkilled record'), self: T('lv.self', 'Self-reported') }[a.level] };
    });
    var totalDone = rows.reduce(function (a, r) { return a + r.p.done; }, 0), totalAll = rows.reduce(function (a, r) { return a + r.p.total; }, 0);
    var lm = learnModel();
    var monday = H.addDays(H.startOfDay(new Date()), -((new Date().getDay() + 6) % 7));
    function thisWeek(x) { return x.created_at && new Date(x.created_at) >= monday; }
    var reviewedBy = {};
    Object.keys(S.cardStates).forEach(function (cid) { var st = S.cardStates[cid]; if (st.last && H.parseDay(st.last) >= monday) reviewedBy[cid] = 1; });
    var cardsAll = allCards();
    var weekRows = S.courses.list.map(function (c) {
      var notes = S.items.filter(function (i) { return i.kind === 'note' && keyOf(i) === c.key && thisWeek(i); }).length;
      var files = S.files.filter(function (f) { return (f.course_key || H.courseKey(f.course_label)) === c.key && thisWeek(f); }).length;
      var cards = cardsAll.filter(function (x) { return H.courseKey(x.course) === c.key && reviewedBy[x.id]; }).length;
      return { label: c.label, key: c.key, color: colorOf(c.key), href: courseHref(c.key), notes: notes, files: files, cards: cards, quiet: !notes && !files };
    });
    return { weekRows: weekRows, next: upcoming(14), rows: rows, asgDone: asgDone, asgAll: asgAll, revDone: revDone, revAll: revAll, lessons: lessons.length, minutes: minutes, achievements: ach, overall: totalAll ? Math.round(totalDone / totalAll * 100) : null, term: term(),
      daily: { ready: S.dailyReady, record: lm.record, concepts: lm.concepts, lastReflection: dailyModel().lastReflection } };
  }

  /* ---------------------------------------------------------------- daily learning (prototype) */
  function allCards() { return S.items.filter(function (i) { return i.kind === 'note'; }).reduce(function (a, n) { return a.concat(H.parseCards(n)); }, []); }
  function weekKey() { var d = H.startOfDay(new Date()); return H.iso(H.addDays(d, -((d.getDay() + 6) % 7))); }
  // Today's review, capped (15 cards) so it never turns into a backlog; the rest wait for days with time.
  function queueNow(cards) {
    var q = H.reviewQueue({ cards: cards, states: S.cardStates, exams: S.exams, now: new Date() });
    var cap = ui.reviewCap, all = q.total, dueN = Math.min(q.due.length, cap), freshN = Math.min(q.fresh.length, cap - dueN);
    q.waiting = (q.due.length - dueN) + (q.fresh.length - freshN);
    q.due = q.due.slice(0, dueN); q.fresh = q.fresh.slice(0, freshN);
    q.total = dueN + freshN; q.minutes = q.total ? Math.max(1, Math.round(q.minutes * q.total / all)) : 0;
    return q;
  }
  function sugText(x) {
    switch (x.k) {
      case 'capture': return { title: T('sg.capture', 'Capture today’s {{c}} class', { c: x.course }), why: T('sg.capture-why', 'Three key points while they are fresh. They become review cards.'), ok: T('sg.capture-ok', 'Write notes') };
      case 'review': return { title: T('sg.review', 'Review {{n}} cards', { n: x.n }), why: T('sg.review-why', 'About {{m}} min. Spaced review is how lectures stick.', { m: x.minutes }), ok: T('sg.review-ok', 'Start review') };
      case 'plan': return { title: T('sg.plan', 'Draft a revision plan for {{e}}', { e: x.exam }), why: T('sg.plan-why', '{{n}} days to go and no plan yet. You approve every day of it.', { n: x.days }), ok: T('sg.plan-ok', 'Draft it') };
      case 'rescue': return { title: T('sg.rescue', 'Get 15 minutes on “{{t}}”', { t: x.topic }), why: T('sg.rescue-why', 'Marked unsure, exam in {{n}} days. A verified student who passed {{c}} can help.', { n: x.days, c: x.course }), ok: T('sg.rescue-ok', 'See who can help') };
      case 'reflect': return { title: T('sg.reflect', 'Look back on your week'), why: T('sg.reflect-why', 'Three short questions. Your answers stay private.'), ok: T('sg.reflect-ok', 'Reflect') };
    }
    return { title: '', why: '', ok: '' };
  }
  function dailyModel() {
    var now = new Date(), cards = allCards(), queue = queueNow(cards);
    var classes = H.todayClasses({ timetable: S.timetable, items: S.items, now: now }).map(function (c) { c.color = colorOf(c.key); return c; });
    var record = H.learningRecord({ log: S.log, now: now });
    var reflected = S.reflections.some(function (r) { return r.week === weekKey(); });
    var sugg = H.suggestions({ now: now, classes: classes, queue: queue, exams: S.exams, tasksByExam: S.tasksByExam, reflectedThisWeek: reflected, dismissed: ui.dismissed })
      .filter(function (x) { return x.k === 'capture' || x.k === 'review' || x.k === 'reflect'; })
      .map(function (x) { return Object.assign(x, sugText(x)); });
    var byCourse = {};
    queue.due.concat(queue.fresh).forEach(function (c) { var k = H.courseKey(c.course) || '-'; (byCourse[k] = byCourse[k] || { label: c.course || T('no-course', 'No course'), key: k, n: 0 }).n++; });
    return {
      ready: S.dailyReady, classes: classes, queue: queue, record: record, suggestions: sugg, reflected: reflected, cards: cards.length,
      reviewCourses: Object.keys(byCourse).map(function (k) { var x = byCourse[k]; x.color = colorOf(k); return x; }),
      lastReflection: S.reflections.slice().sort(function (a, b) { return a.week < b.week ? 1 : -1; })[0] || null,
      weekday: now.getDay(), exam: H.examMode({ exams: S.exams, now: now })
    };
  }
  function learnModel() {
    var cards = allCards(), byId = {}; cards.forEach(function (c) { byId[c.id] = c; });
    var r = ui.review, current = null;
    if (r && !r.finished) { var cid = r.ids[r.i]; current = byId[cid] || null; }
    var decks = {};
    var q = queueNow(cards), dueSet = {};
    q.due.concat(q.fresh).forEach(function (c) { dueSet[c.id] = 1; });
    cards.forEach(function (c) {
      var k = H.courseKey(c.course) || '-', d = decks[k] || (decks[k] = { key: k, label: c.course || T('no-course', 'No course'), total: 0, due: 0, known: 0 });
      d.total++; if (dueSet[c.id]) d.due++; var st = S.cardStates[c.id]; if (st && st.box >= 3) d.known++;
    });
    var ideas = [];
    S.items.filter(function (i) { return i.kind === 'note'; }).forEach(function (n) {
      var have = H.parseCards(n).map(function (c) { return c.front.toLowerCase(); });
      H.suggestCards(n.body).forEach(function (s, ix) { if (have.indexOf(s.front.toLowerCase()) === -1 && ideas.length < 3) ideas.push({ note: n, idea: s, ix: ix, color: colorOf(keyOf(n)) }); });
    });
    return {
      ready: S.dailyReady, cards: cards.length, queue: q, review: r, current: current, currentState: current ? S.cardStates[current.id] || null : null,
      decks: Object.keys(decks).map(function (k) { var d = decks[k]; d.color = colorOf(k); return d; }).sort(function (a, b) { return b.due - a.due || b.total - a.total; }),
      concepts: H.conceptMap({ items: S.items, cards: cards, states: S.cardStates }).slice(0, 14),
      ask: ui.ask, ideas: ideas, record: H.learningRecord({ log: S.log, now: new Date() }), aiAvailable: !!window.LanguageModel
    };
  }

  /* shared blocks for the daily loop: class names start with shq-d so each design can restyle them */
  function capWord(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function classesBlock(d) {
    if (!d.ready) return '<p class="shq-d-muted">' + esc(T('daily-off', 'Your timetable, review cards and weekly record arrive with the daily-learning update.')) + '</p>';
    if (!d.classes.length) return '<p class="shq-d-muted">' + esc(d.weekday === 0 || d.weekday === 6 ? T('no-class-we', 'No classes today. A good day for a short review, or a real break.') : T('no-class', 'No classes today.')) + '</p>';
    return '<ol class="shq-d-classes">' + d.classes.map(function (c) {
      var st = { done: T('cl.done', 'Done'), now: T('cl.now', 'Now'), next: T('cl.next', 'Later') }[c.state];
      return '<li class="' + c.state + '" style="--c:' + c.color + '"><span class="t">' + esc(c.start) + '<small>' + esc(c.end) + '</small></span><span class="b"><b>' + esc(c.course) + '</b><small>' + esc(c.kind + (c.room ? ' · ' + c.room : '')) + '</small></span>' +
        (c.needsCapture ? '<button type="button" class="shq-btn ghost small" data-act="capture" data-course="' + esc(c.course) + '">' + ic('pen', 13) + esc(T('capture', 'Capture notes')) + '</button>'
          : c.captured ? '<span class="shq-d-tag ok">' + ic('tick', 12) + esc(T('captured', 'Notes saved')) + '</span>' : '<span class="shq-d-tag ' + c.state + '">' + esc(st) + '</span>') + '</li>';
    }).join('') + '</ol>';
  }
  function reviewBlock(d, cls) {
    if (!d.ready) return '';
    var q = d.queue;
    if (!q.total) return '<div class="shq-d-review empty"><b>' + esc(T('rv-none', 'No cards due today')) + '</b><p>' + esc(d.cards ? T('rv-none-sub', 'You are up to date. New cards appear as you write notes.') : T('rv-first', 'Write a note with “Q:” and “A:” lines and it becomes a review card.')) + '</p></div>';
    return '<div class="shq-d-review"><div class="n"><b>' + q.total + '</b><span>' + esc(T('rv-cards', 'cards today')) + '</span></div><div class="x"><p>' + esc(T('rv-time', 'About {{m}} min · {{d}} due again, {{f}} new', { m: q.minutes, d: q.due.length, f: q.fresh.length })) + '</p>' +
      '<div class="chips">' + d.reviewCourses.map(function (c) { return '<span><i class="shq-dot" style="background:' + c.color + '"></i>' + esc(c.label) + ' ' + c.n + '</span>'; }).join('') + '</div></div>' +
      '<a class="' + (cls || 'shq-btn primary') + '" href="#/learn" data-act="rv-start">' + ic('play', 14) + esc(T('rv-start', 'Start review')) + '</a></div>';
  }
  function suggestBlock(d, max) {
    if (!d.ready || !d.suggestions.length) return '';
    return '<div class="shq-d-sugs">' + d.suggestions.slice(0, max || 4).map(function (x) {
      return '<div class="shq-d-sug k-' + x.k + '"><span class="ico">' + ic({ capture: 'pen', review: 'brain', plan: 'cal', rescue: 'user', reflect: 'leaf' }[x.k], 16) + '</span><div><b>' + esc(x.title) + '</b><small>' + esc(x.why) + '</small></div>' +
        '<span class="acts"><button type="button" class="shq-btn primary small" data-act="sug-ok" data-id="' + esc(x.id) + '">' + esc(x.ok) + '</button><button type="button" class="shq-btn ghost small" data-act="sug-no" data-id="' + esc(x.id) + '" aria-label="' + esc(T('not-now-x', 'Not now: {{t}}', { t: x.title })) + '">' + esc(T('not-now', 'Not now')) + '</button></span></div>';
    }).join('') + '</div><p class="shq-d-fine">' + esc(T('sg-fine', 'Suggestions follow fixed rules. Nothing happens until you approve it.')) + '</p>';
  }
  function recordBlock(r) {
    var wd = [T('wd.mo', 'Mo'), T('wd.tu', 'Tu'), T('wd.we', 'We'), T('wd.th', 'Th'), T('wd.fr', 'Fr'), T('wd.sa', 'Sa'), T('wd.su', 'Su')];
    return '<div class="shq-d-record"><div class="days" role="img" aria-label="' + esc(T('rec-aria', 'Studied on {{n}} of 7 days this week', { n: r.activeDays })) + '">' + r.days.map(function (d, i) {
      return '<span class="' + (d.active ? 'on' : d.future ? 'fut' : '') + (H.iso(new Date()) === d.iso ? ' today' : '') + '"><i></i>' + esc(wd[i]) + '</span>';
    }).join('') + '</div><div class="figs"><span><b>' + r.activeDays + '/7</b>' + esc(T('rec-days', 'days studied')) + '</span><span><b>' + esc(mins(r.focusMinutes)) + '</b>' + esc(T('rec-focus', 'focused')) + '</span><span><b>' + r.reviewed + '</b>' + esc(T('rec-cards', 'cards reviewed')) + '</span><span><b>' + (r.recall == null ? '–' : r.recall + '%') + '</b>' + esc(T('rec-recall', 'remembered')) + '</span></div></div>';
  }
  function reviewSession(m) {
    var r = m.review;
    if (!m.ready) return '<p class="shq-d-muted">' + esc(T('daily-off', 'Your timetable, review cards and weekly record arrive with the daily-learning update.')) + '</p>';
    if (r && r.finished) return '<div class="shq-d-card done"><b>' + esc(T('rv-done', 'Done for today')) + '</b><p>' + esc(T('rv-done-sub', '{{n}} cards, {{k}} remembered. The ones you missed come back tomorrow.', { n: r.n, k: r.right })) + '</p><button type="button" class="shq-btn ghost small" data-act="rv-close">' + esc(T('rv-close', 'Close')) + '</button></div>';
    if (!r || !m.current) {
      return m.queue.total ? '<div class="shq-d-card start"><b>' + esc(T('rv-ready', '{{n}} cards ready', { n: m.queue.total })) + '</b><p>' + esc(T('rv-ready-sub', 'About {{m}} minutes. Say the answer to yourself, then reveal it.', { m: m.queue.minutes })) + '</p><button type="button" class="shq-btn primary" data-act="rv-start">' + ic('play', 14) + esc(T('rv-start', 'Start review')) + '</button></div>'
        : '<div class="shq-d-card start"><b>' + esc(T('rv-none', 'No cards due today')) + '</b><p>' + esc(T('rv-none-sub', 'You are up to date. New cards appear as you write notes.')) + '</p></div>';
    }
    var c = m.current, pos = r.i + 1, tot = r.ids.length;
    return '<div class="shq-d-card live" style="--c:' + colorOf(H.courseKey(c.course)) + '"><div class="top"><span>' + courseTag(c.course, H.courseKey(c.course)) + '</span><span class="shq-d-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + tot + '" aria-valuenow="' + r.i + '" aria-label="' + esc(T('rv-prog', 'Card {{i}} of {{n}}', { i: pos, n: tot })) + '"><i style="width:' + Math.round(r.i / tot * 100) + '%"></i></span><small>' + pos + ' / ' + tot + '</small></div>' +
      '<p class="front">' + esc(c.front) + '</p>' + (r.shown ? '<p class="back">' + esc(c.back) + '</p>' : '') +
      '<div class="acts">' + (r.shown
        ? '<button type="button" class="shq-btn ghost" data-act="rv-grade" data-v="0">' + esc(T('rv-no', 'Not yet')) + ' <kbd>1</kbd></button><button type="button" class="shq-btn primary" data-act="rv-grade" data-v="1">' + esc(T('rv-yes', 'I knew it')) + ' <kbd>2</kbd></button>'
        : '<button type="button" class="shq-btn primary" data-act="rv-show">' + esc(T('rv-show', 'Show answer')) + ' <kbd>Space</kbd></button>') + '</div>' +
      '<p class="shq-d-fine">' + esc(T('rv-from', 'From your note “{{t}}”', { t: (findItem(c.noteId) || {}).title || '' })) + '</p></div>';
  }
  function askBlock(m) {
    var a = m.ask || {};
    var res = '';
    if (a.busy) res = '<p class="shq-d-muted">' + esc(T('ask-busy', 'Reading your notes on this device…')) + '</p>';
    else if (a.answer) res = '<div class="shq-d-answer"><p>' + esc(a.answer) + '</p></div>';
    if (a.results && !a.busy) res += a.results.length ? '<ul class="shq-d-hits">' + a.results.map(function (h) { return '<li><b>' + esc(h.item.title) + '</b>' + courseTag(h.item.course_label, keyOf(h.item)) + '<p>' + esc(h.snippet) + '</p></li>'; }).join('') + '</ul>' : '<p class="shq-d-muted">' + esc(T('ask-none', 'Nothing in your notes matches that yet.')) + '</p>';
    var mode = a.mode === 'ai' ? T('ask-mode-ai', 'Answered on your device by Chrome’s built-in model. Check it against the sources.') : a.mode === 'search' ? T('ask-mode-search', 'Searched your notes. No AI used, nothing left this device.') : (m.aiAvailable ? T('ask-hint-ai', 'Runs on your device. Your notes are not sent anywhere.') : T('ask-hint', 'Searches your own notes. In Chrome on a capable computer, an on-device model can also answer.'));
    return '<form class="shq-d-ask" data-form="ask"><label for="askQ" class="sr">' + esc(T('ask-label', 'Ask your notes')) + '</label>' + ic('search', 16) + '<input id="askQ" name="q" maxlength="200" autocomplete="off" placeholder="' + esc(T('ask-ph', 'Ask your notes, e.g. when do I use t instead of z?')) + '" value="' + esc(a.q || '') + '"><button type="submit" class="shq-btn primary small">' + esc(T('ask-go', 'Ask')) + '</button></form><p class="shq-d-fine">' + esc(mode) + '</p>' + res;
  }
  function conceptsBlock(m) {
    if (!m.concepts.length) return '<p class="shq-d-muted">' + esc(T('cx-none', 'Tag ideas in your notes with #tags or [[links]] and they connect here across courses.')) + '</p>';
    return '<div class="shq-d-concepts">' + m.concepts.map(function (c) {
      var s = c.strength == null ? null : c.strength;
      return '<span class="cx" title="' + esc(T('cx-title', '{{n}} notes · {{c}} cards', { n: c.notes, c: c.cards })) + '"><b>' + esc(capWord(c.label)) + '</b><small>' + esc(c.courses.join(' · ') || T('no-course', 'No course')) + '</small><i class="bar"><i style="width:' + (s || 0) + '%"></i></i><em>' + (s == null ? esc(T('cx-nocards', 'no cards yet')) : esc(T('cx-held', '{{s}}% held', { s: s }))) + '</em></span>';
    }).join('') + '</div>';
  }
  function decksBlock(m) {
    return '<div class="shq-d-decks">' + m.decks.map(function (d) { return '<div class="dk" style="--c:' + d.color + '"><b>' + esc(d.label) + '</b><span>' + esc(T('dk-line', '{{t}} cards · {{d}} today · {{k}} well known', { t: d.total, d: d.due, k: d.known })) + '</span></div>'; }).join('') + '</div>';
  }
  function ideasBlock(m) {
    if (!m.ideas.length) return '';
    return '<div class="shq-d-ideas">' + m.ideas.map(function (x) { return '<div class="idea"><div><b>' + esc(x.idea.front) + '</b><small>' + esc(x.idea.back) + '</small><span class="src">' + courseTag(x.note.course_label, keyOf(x.note)) + ' ' + esc(x.note.title) + '</span></div><button type="button" class="shq-btn ghost small" data-act="idea-add" data-id="' + esc(x.note.id) + '" data-v="' + x.ix + '">' + ic('plus', 13) + esc(T('idea-add', 'Add card')) + '</button></div>'; }).join('') + '</div>';
  }
  function formatHelp() {
    return '<details class="shq-d-help"><summary>' + esc(T('fmt-title', 'How notes become cards')) + '</summary><ul><li><code>Q: …</code> ' + esc(T('fmt-qa', 'then a line')) + ' <code>A: …</code></li><li><code>' + esc(T('fmt-term', 'term :: definition')) + '</code></li><li>' + esc(T('fmt-cloze', 'A sentence with')) + ' <code>{{' + esc(T('fmt-hidden', 'hidden words')) + '}}</code></li><li><code>#tag</code> ' + esc(T('fmt-or', 'or')) + ' <code>[[' + esc(T('fmt-concept', 'concept')) + ']]</code> ' + esc(T('fmt-links', 'link ideas across courses')) + '</li></ul></details>';
  }
  // A default Learn screen: designs can replace it with their own layout of the same blocks.
  function learnView(a, m) {
    return '<div class="shq-learn"><header class="shq-learn-h"><h1>' + esc(T('learn-h', 'Learn')) + '</h1><p>' + esc(T('learn-sub', 'Review cards made from your own notes, ask your notes a question, and see which ideas are holding.')) + '</p></header>' +
      '<div class="shq-learn-grid"><section class="shq-learn-main"><h2>' + esc(T('today-review', 'Today’s review')) + '</h2>' + reviewSession(m) + '<h2>' + esc(T('ask-h', 'Ask your notes')) + '</h2>' + askBlock(m) + '</section>' +
      '<aside class="shq-learn-side"><h2>' + esc(T('decks', 'Your decks')) + '</h2>' + decksBlock(m) + (m.ideas.length ? '<h2>' + esc(T('ideas', 'Card ideas from your notes')) + '</h2>' + ideasBlock(m) : '') + formatHelp() + '</aside></div>' +
      '<section class="shq-learn-cx"><h2>' + esc(T('cx-h', 'Concepts across your courses')) + '</h2>' + conceptsBlock(m) + '</section></div>';
  }


  /* ---------------------------------------------------------------- release 1: library, settings, onboarding */
  var WD = function () { return [T('wd.mo', 'Mo'), T('wd.tu', 'Tu'), T('wd.we', 'We'), T('wd.th', 'Th'), T('wd.fr', 'Fr'), T('wd.sa', 'Sa'), T('wd.su', 'Su')]; };
  function bytes(n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (Math.round(n / 104857.6) / 10) + ' MB'; }
  function searchable() {
    return S.items.filter(function (i) { return i.kind === 'note' || i.kind === 'resource'; }).concat(S.files.filter(function (f) { return f.text_content; }).map(function (f) {
      return { id: 'file-' + f.id, kind: 'note', title: f.name, body: f.text_content, course_label: f.course_label, course_key: f.course_key, file: f };
    }));
  }
  function usedBytes() { return S.files.reduce(function (a, f) { return a + (f.size_bytes || 0); }, 0); }
  function fileRow(f, opts) {
    opts = opts || {};
    var isPdf = f.mime === 'application/pdf';
    var meta = [isPdf ? (f.pages ? T('pages-n', '{{n}} pages', { n: f.pages }) : 'PDF') : T('photo', 'Photo'), bytes(f.size_bytes || 0), fmt(new Date(f.created_at), { day: 'numeric', month: 'short' })];
    return '<div class="shq-file"><span class="fi ' + (isPdf ? 'pdf' : 'img') + '">' + ic(isPdf ? 'file' : 'camera', 18) + '</span><div class="ft"><b>' + esc(f.name) + '</b><div class="shq-meta">' + (!opts.hideCourse && f.course_label ? courseTag(f.course_label, f.course_key || H.courseKey(f.course_label)) : '') +
      '<span>' + esc(meta.join(' · ')) + '</span>' + (isPdf ? (f.text_content ? '<span class="shq-pill info">' + esc(T('searchable', 'Searchable')) + '</span>' : '<span class="shq-pill">' + esc(T('not-searchable', 'Not searchable yet')) + '</span>') : '') + '</div></div>' +
      '<span class="fa"><button type="button" class="shq-btn ghost small" data-act="file-open" data-id="' + esc(f.id) + '">' + esc(T('open', 'Open')) + '</button><button type="button" class="shq-icon" data-act="file-del" data-id="' + esc(f.id) + '" aria-label="' + esc(T('delete-x', 'Delete {{t}}', { t: f.name })) + '">' + ic('trash', 15) + '</button></span></div>';
  }
  function captureButtons(course) {
    var dc = course ? ' data-course="' + esc(course) + '"' : '';
    return '<span class="shq-capbar"><button type="button" class="shq-btn primary small" data-act="add" data-kind="note"' + dc + storageOff() + '>' + ic('pen', 14) + esc(T('cap-note', 'Note')) + '</button>' +
      '<button type="button" class="shq-btn ghost small" data-act="upload" data-kind="photo"' + dc + storageOff() + '>' + ic('camera', 14) + esc(T('cap-photo', 'Slide photo')) + '</button>' +
      '<button type="button" class="shq-btn ghost small" data-act="upload" data-kind="pdf"' + dc + storageOff() + '>' + ic('upload', 14) + esc(T('cap-pdf', 'PDF')) + '</button></span>';
  }
  function filesBlock(m) {
    return '<div class="shq-files">' + (m.files.length ? m.files.map(function (f) { return fileRow(f, { hideCourse: true }); }).join('') : '<p class="shq-d-muted">' + esc(T('no-files-c', 'Upload the lecture slides as a PDF, or take a photo of a slide. Only you can see them.')) + '</p>') + '</div>';
  }
  function libraryModel() {
    var q = ui.libQ || '', f = ui.noteFilter;
    var notes = S.items.filter(function (i) { return i.kind === 'note' || i.kind === 'resource'; });
    var files = S.files.slice();
    function inCourse(x) { return f === 'all' || (x.course_key || H.courseKey(x.course_label)) === f; }
    var hits = q ? H.searchNotes(searchable(), q, 30) : null;
    return {
      q: q, hits: hits && hits.filter(function (h) { return inCourse(h.item); }),
      notes: notes.filter(inCourse).sort(function (a, b) { return (b.updated_at || b.created_at || '') < (a.updated_at || a.created_at || '') ? -1 : 1; }),
      files: files.filter(inCourse), filters: filterList(notes.concat(files)), filter: f, used: usedBytes(), pending: outbox().length
    };
  }
  function libraryView(m) {
    var chips = '<div class="shq-chips" role="group" aria-label="' + esc(T('filter-course', 'Filter by course')) + '"><button type="button" data-act="note-filter" data-v="all" aria-pressed="' + (m.filter === 'all') + '">' + esc(T('all-courses', 'All courses')) + '</button>' +
      m.filters.map(function (x) { return '<button type="button" data-act="note-filter" data-v="' + esc(x.key) + '" aria-pressed="' + (m.filter === x.key) + '"><i class="shq-dot" style="background:' + x.color + '"></i>' + esc(x.label) + '</button>'; }).join('') + '</div>';
    var search = '<form class="shq-d-ask shq-lib-search" data-form="lib" role="search"><label for="libQ" class="sr">' + esc(T('lib-search', 'Search notes and PDFs')) + '</label>' + ic('search', 16) + '<input id="libQ" name="q" maxlength="200" autocomplete="off" placeholder="' + esc(T('lib-ph', 'Search all your notes and PDFs')) + '" value="' + esc(m.q) + '">' + (m.q ? '<button type="button" class="shq-btn ghost small" data-act="lib-clear">' + esc(T('clear', 'Clear')) + '</button>' : '') + '<button type="submit" class="shq-btn primary small">' + esc(T('search', 'Search')) + '</button></form>';
    var body;
    if (m.hits) {
      body = '<section class="shq-sec"><h2>' + esc(T('results-n', '{{n}} results', { n: m.hits.length })) + '</h2>' + (m.hits.length ? '<ul class="shq-d-hits">' + m.hits.map(function (h) {
        var it = h.item;
        return '<li><b>' + (it.file ? ic('file', 14) + ' ' : '') + esc(it.title) + '</b>' + courseTag(it.course_label, keyOf(it)) + '<p>' + esc(h.snippet) + '</p>' + (it.file ? '<button type="button" class="shq-btn ghost small" data-act="file-open" data-id="' + esc(it.file.id) + '">' + esc(T('open', 'Open')) + '</button>' : '<button type="button" class="shq-btn ghost small" data-act="edit" data-id="' + esc(it.id) + '">' + esc(T('open', 'Open')) + '</button>') + '</li>';
      }).join('') + '</ul>' : '<p class="shq-d-muted">' + esc(T('ask-none', 'Nothing in your notes matches that yet.')) + '</p>') + '</section>';
    } else {
      body = '<section class="shq-sec"><h2>' + esc(T('files', 'Files')) + ' <small>' + esc(T('used-of', '{{u}} of 1 GB used', { u: bytes(m.used) })) + '</small></h2>' +
        (m.files.length ? '<div class="shq-files">' + m.files.map(function (f) { return fileRow(f); }).join('') + '</div>' : '<p class="shq-d-muted">' + esc(T('no-files', 'No files yet. Upload lecture slides as a PDF or photograph a slide in class.')) + '</p>') + '</section>' +
        '<section class="shq-sec"><h2>' + esc(T('notes', 'Notes')) + (m.pending ? ' <small>' + esc(T('pending-n', '{{n}} waiting to sync', { n: m.pending })) + '</small>' : '') + '</h2>' +
        (m.notes.length ? '<div class="shq-notes">' + m.notes.map(function (n) {
          var u = noteUrl(n);
          return '<article class="shq-note-c" style="--c:' + colorOf(keyOf(n)) + '"><h3>' + ic(n.kind === 'resource' ? 'link' : 'note', 15) + '<span>' + esc(n.title) + '</span></h3>' + (n.body ? '<p>' + esc(String(n.body).slice(0, 400)) + '</p>' : '') +
            '<div class="foot">' + (u ? '<a href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer">' + esc(u.label) + ' ↗</a>' : courseTag(n.course_label, keyOf(n)) || '<span></span>') + (n.pending ? '<span class="shq-pill">' + esc(T('pending', 'Not synced yet')) + '</span>' : editBtn(n)) + '</div></article>';
        }).join('') + '</div>' : '<p class="shq-d-muted">' + esc(T('no-notes', 'No notes yet. Capture three key points after your next class.')) + '</p>') + '</section>';
    }
    return '<div class="shq-page"><header class="shq-page-h"><div><h1>' + esc(T('lib-h', 'Notes & files')) + '</h1><p>' + esc(T('lib-sub', 'Everything you captured, searchable in one place. Private to you: tutors, other students and UniSkilled staff cannot see it.')) + '</p></div>' + captureButtons('') + '</header>' +
      storageNotice() + search + chips + body + '</div>';
  }
  function settingsView() {
    var wd = WD();
    var tt = S.timetable.slice().sort(function (a, b) { return a.weekday - b.weekday || (a.start < b.start ? -1 : 1); });
    var classes = tt.length ? '<ul class="shq-list">' + tt.map(function (c) {
      return '<li><span class="shq-dot" style="background:' + colorOf(H.courseKey(c.course_label)) + '"></span><span class="grow"><b>' + esc(c.course_label) + '</b><small>' + esc(wd[c.weekday - 1] + ' ' + c.start + '–' + c.end + (c.kind ? ' · ' + c.kind : '') + (c.room ? ' · ' + c.room : '')) + '</small></span><button type="button" class="shq-icon" data-act="class-del" data-id="' + esc(c.id) + '" aria-label="' + esc(T('remove-x', 'Remove {{t}}', { t: c.course_label })) + '">' + ic('trash', 15) + '</button></li>';
    }).join('') + '</ul>' : '<p class="shq-d-muted">' + esc(T('no-tt', 'No timetable yet.')) + '</p>';
    var courses = S.follows.length ? '<ul class="shq-list">' + S.follows.map(function (f) {
      return '<li><span class="shq-dot" style="background:' + colorOf(f.course_key || H.courseKey(f.course_code)) + '"></span><span class="grow"><b>' + esc(f.course_code) + '</b><small>' + esc(f.exam_date ? T('exam-on-d', 'Exam {{d}}', { d: fmt(H.parseDay(f.exam_date), { day: 'numeric', month: 'long', year: 'numeric' }) }) : T('no-exam-date', 'No exam date')) + '</small></span><button type="button" class="shq-btn ghost small" data-act="exam" data-id="' + esc(f.id) + '">' + esc(f.exam_date ? T('change-date', 'Change date') : T('set-exam', 'Set exam date')) + '</button></li>';
    }).join('') + '</ul>' : '<p class="shq-d-muted">' + esc(T('no-courses-s', 'No courses yet.')) + '</p>';
    return '<div class="shq-page"><header class="shq-page-h"><div><h1>' + esc(T('set-h', 'Settings')) + '</h1><p>' + esc(T('set-sub', 'Your timetable, courses and data.')) + '</p></div></header>' + storageNotice() +
      '<section class="shq-sec"><h2>' + esc(T('timetable', 'Timetable')) + '</h2><p class="shq-d-fine">' + esc(T('tt-help', 'Import the iCal (.ics) file from your campus system (Stud.IP, TUCaN, campo, ZEuS, Moodle…), or add classes by hand.')) + '</p>' +
      '<div class="shq-row"><button type="button" class="shq-btn primary small" data-act="ical"' + storageOff() + '>' + ic('cal', 14) + esc(T('import-tt', 'Import timetable')) + '</button><button type="button" class="shq-btn ghost small" data-act="class-add"' + storageOff() + '>' + ic('plus', 14) + esc(T('add-class', 'Add a class')) + '</button></div>' + classes + '</section>' +
      '<section class="shq-sec"><h2>' + esc(T('courses-exams', 'Courses and exam dates')) + '</h2><p class="shq-d-fine">' + esc(T('exam-help', 'An exam date moves review cards forward and switches Today to exam mode six weeks before.')) + '</p><div class="shq-row"><button type="button" class="shq-btn ghost small" data-act="add-course"' + storageOff() + '>' + ic('plus', 14) + esc(T('add-course', 'Add a course')) + '</button></div>' + courses + '</section>' +
      '<section class="shq-sec"><h2>' + esc(T('your-data', 'Your data')) + '</h2><p class="shq-d-fine">' + esc(T('data-help', 'Notes, files, cards, timetable and reflections are private to you. Download a copy at any time, or delete everything Study HQ holds about you. Your tutoring account is not affected.')) + '</p>' +
      '<div class="shq-row"><button type="button" class="shq-btn ghost small" data-act="export">' + ic('upload', 14) + esc(T('export', 'Download my data')) + '</button><button type="button" class="shq-btn ghost small danger" data-act="delete-all"' + storageOff() + '>' + ic('trash', 14) + esc(T('delete-all', 'Delete all Study HQ data')) + '</button></div>' +
      '<p class="shq-d-fine">' + esc(T('used-of', '{{u}} of 1 GB used', { u: bytes(usedBytes()) })) + '</p></section>' +
      '<section class="shq-sec"><h2>' + esc(T('ai-h', 'Smart features')) + '</h2><p class="shq-d-fine">' + esc(window.LanguageModel ? T('ai-on', 'This browser can run Chrome’s built-in model on your device. Ask your notes uses it when it is ready; your notes never leave this device for it.') : T('ai-off', 'Card suggestions, review scheduling and search work on every device with fixed rules. No AI service receives your notes.')) + '</p></section></div>';
  }
  function needsOnboarding() { return S.itemsReady && !S.follows.length && !S.timetable.length && !S.items.length && !S.files.length; }
  function onboardingView() {
    var first = String(S.user.full_name || '').trim().split(/\s+/)[0];
    return '<div class="shq-page shq-onb"><header class="shq-page-h"><div><h1>' + esc(first ? T('onb-h-n', 'Welcome to Study HQ, {{n}}', { n: first }) : T('onb-h', 'Welcome to Study HQ')) + '</h1><p>' + esc(T('onb-sub', 'Three minutes to set up. Then one screen tells you each day what matters: your next class, what to review, what is due.')) + '</p></div></header>' +
      '<ol class="shq-steps"><li><b>' + esc(T('onb-1', 'Bring in your timetable')) + '</b><p>' + esc(T('onb-1s', 'Import the .ics file from your campus system. Your courses are created from it.')) + '</p><div class="shq-row"><button type="button" class="shq-btn primary" data-act="ical">' + ic('cal', 15) + esc(T('import-tt', 'Import timetable')) + '</button><button type="button" class="shq-btn ghost" data-act="add-course">' + esc(T('onb-1b', 'Just type my courses')) + '</button></div></li>' +
      '<li><b>' + esc(T('onb-2', 'Capture one thing from your last class')) + '</b><p>' + esc(T('onb-2s', 'A few lines, a photo of a slide, or the lecture PDF.')) + '</p></li>' +
      '<li><b>' + esc(T('onb-3', 'Do your first one-minute review')) + '</b><p>' + esc(T('onb-3s', 'Study HQ suggests cards from your notes. You approve each one.')) + '</p></li></ol>' +
      (S.user.university_email_verified ? '' : '<p class="shq-d-fine">' + esc(T('onb-verify', 'Tip: verifying your university email in your profile unlocks verified-student features later. It is optional.')) + '</p>') +
      '<p class="shq-d-fine">' + esc(T('onb-private', 'Everything you add is private to you.')) + '</p></div>';
  }

  var api = {
    H: H, S: S, ui: ui, T: T, esc: esc, ic: ic, I: I, fmt: fmt, fmtTime: fmtTime, relDay: relDay, dueText: dueText, mins: mins, hours: hours, daysUntil: daysUntil,
    colorOf: colorOf, courseIndex: courseIndex, keyOf: keyOf, courseHref: courseHref, tutorHref: tutorHref,
    checkbox: checkbox, courseTag: courseTag, statusSelect: statusSelect, editBtn: editBtn, itemMeta: itemMeta, itemRow: itemRow, taskRow: taskRow,
    addBtn: addBtn, storageOff: storageOff, storageNotice: storageNotice, focusActions: focusActions, timeChoices: timeChoices, reasonText: reasonText,
    term: term, overview: overviewModel, planner: plannerModel, assignments: assignmentsModel, exams: examsModel, notes: notesModel, course: courseWorkspace,
    courseModel: courseModel, progress: progressModel, weekEntries: weekEntries, examModel: examModel, demo: DEMO, KINDS: KINDS, STATUS: STATUS,
    daily: dailyModel, learn: learnModel, classesBlock: classesBlock, reviewBlock: reviewBlock, suggestBlock: suggestBlock, recordBlock: recordBlock,
    reviewSession: reviewSession, askBlock: askBlock, conceptsBlock: conceptsBlock, decksBlock: decksBlock, ideasBlock: ideasBlock, formatHelp: formatHelp, learnView: learnView, capWord: capWord,
    filesBlock: filesBlock, fileRow: fileRow, captureButtons: captureButtons, bytes: bytes,
    deadlines: deadlinesModel, qaPreview: qaPreview
  };

  /* ---------------------------------------------------------------- skins */
  // Study Garden is the chosen design (decided by Sarmad, 25 Nov 2026).
  var skin = (window.StudyHQSkins || {}).garden;
  function applySkin() {
    var st = document.getElementById('shqSkinCss');
    if (!st) { st = document.createElement('style'); st.id = 'shqSkinCss'; document.head.appendChild(st); }
    st.textContent = skin.css;
    document.body.setAttribute('data-concept', skin.id);
    colorMap = {}; colorSeq = 0;
  }

  /* ---------------------------------------------------------------- navigation + render */
  var NAV = [
    ['overview', 'home', function () { return T('nav.overview', 'Today'); }],
    ['courses', 'book', function () { return T('nav.courses', 'Courses'); }],
    ['learn', 'brain', function () { return T('nav.review', 'Review'); }],
    ['library', 'note', function () { return T('nav.library', 'Notes & files'); }],
    ['progress', 'chart', function () { return T('nav.week', 'Week'); }],
    ['assignments', 'check', function () { return T('nav.exams-deadlines', 'Exams & deadlines'); }],
    ['planner', 'cal', function () { return T('nav.planner', 'Planner'); }],
    ['settings', 'gear', function () { return T('nav.settings', 'Settings'); }]
  ];
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    var name = parts[0] || 'overview';
    if (name === 'course') return { name: 'course', key: decodeURIComponent(parts.slice(1).join('/')) };
    if (name === 'notes') name = 'library';
    if (!NAV.some(function (n) { return n[0] === name; }) && name !== 'exams') name = 'overview';
    return { name: name };
  }
  function navModel(r) {
    var now = new Date();
    var overdue = openWork().filter(function (i) { var d = H.dueOf(i); return i.kind === 'assignment' && d && d < now; }).length;
    var upExams = S.exams.filter(function (x) { return H.parseDay(x.exam_date) >= H.startOfDay(now); }).length;
    return {
      items: NAV.map(function (n) {
        return { id: n[0], icon: n[1], label: n[2](), href: '#/' + n[0], current: r.name === n[0] || (r.name === 'course' && n[0] === 'courses'),
          count: n[0] === 'assignments' ? soonCount() : n[0] === 'exams' ? upExams : n[0] === 'learn' && S.dailyReady ? queueNow(allCards()).total : 0, warn: n[0] === 'assignments' && overdue > 0 };
      }),
      courses: S.courses.list.map(function (c) { return { key: c.key, label: c.label, color: colorOf(c.key), href: courseHref(c.key), current: r.name === 'course' && r.key === c.key }; }),
      route: r, term: term(), profile: S.profile, user: S.user
    };
  }
  function soonCount() { try { return deadlines().counts.soon; } catch (e) { return 0; } }
  var lastRoute = null;
  function focusSig(el) { return el && el.getAttribute && el.getAttribute('data-act') ? el.getAttribute('data-act') + '|' + (el.getAttribute('data-id') || el.getAttribute('data-v') || el.getAttribute('data-kind') || '') : null; }
  function render() {
    var sig = focusSig(document.activeElement);
    recompute();
    var r = route();
    var v = skin.views;
    var html;
    if (r.name === 'course') { var m = courseWorkspace(r.key); html = m ? v.course(api, m) : v.notFound(api); }
    else if (r.name === 'learn') html = (v.learn || learnView)(api, learnModel());
    else if (r.name === 'library') html = libraryView(libraryModel());
    else if (r.name === 'settings') html = settingsView();
    else if (r.name === 'overview' && needsOnboarding()) html = onboardingView();
    else html = (v[r.name] || v.overview)(api, ({ overview: overviewModel, courses: function () { return { courses: S.courses.list.map(courseModel), suggestions: S.courses.suggestions }; }, planner: plannerModel, assignments: deadlinesModel, exams: examsModel, notes: notesModel, progress: progressModel })[r.name]());
    hq.innerHTML = skin.shell(api, navModel(r)).replace('<!--VIEW-->', function () { return html; });
    var key = r.name + (r.key || '');
    if (key !== lastRoute) {
      if (lastRoute !== null) { window.scrollTo(0, 0); var mn = document.getElementById('main'); if (mn) mn.focus({ preventScroll: true }); }
      lastRoute = key; track('studyhq_view', { view: r.name, demo: DEMO, concept: skin.id });
    } else if (sig) {
      var parts = sig.split('|');
      var again = hq.querySelector('[data-act="' + parts[0] + '"][data-id="' + CSS.escape(parts[1]) + '"],[data-act="' + parts[0] + '"][data-v="' + CSS.escape(parts[1]) + '"]');
      if (again) again.focus();
    }
    document.title = (r.name === 'course' && S.courses.byKey[r.key] ? S.courses.byKey[r.key].label + ' · ' : '') + 'Study HQ — UniSkilled';
  }
  window.addEventListener('hashchange', function () { if (route().name !== 'course') ui.courseTab = 'overview'; render(); });

  /* ---------------------------------------------------------------- dialogs */
  var dlg = document.getElementById('dlg'), form = document.getElementById('dlgForm'), fields = document.getElementById('dlgFields'), err = document.getElementById('dlgErr');
  var editing = null;
  function courseOptions() { return '<datalist id="courseList">' + S.courses.list.map(function (c) { return '<option value="' + esc(c.label) + '"></option>'; }).join('') + '</datalist>'; }
  function datePart(iso) { return iso ? H.iso(new Date(iso)) : ''; }
  function timePart(iso) { if (!iso) return ''; var d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function field(id, label, input, opt) { return '<div class="f"><label for="' + id + '">' + esc(label) + (opt ? ' <span class="opt">(' + esc(T('optional', 'optional')) + ')</span>' : '') + '</label>' + input + '</div>'; }
  var TITLES = function () { return { assignment: T('d.assignment', 'assignment'), task: T('d.task', 'task'), note: T('d.note', 'note'), resource: T('d.resource', 'link'), achievement: T('d.achievement', 'achievement') }; };
  function estSelect(cur) {
    var opts = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 960];
    if (cur && opts.indexOf(cur) === -1) { opts.push(cur); opts.sort(function (a, b) { return a - b; }); }
    return '<select id="fEst"><option value="">' + esc(T('not-sure', 'Not sure')) + '</option>' + opts.map(function (m) { return '<option value="' + m + '"' + (cur === m ? ' selected' : '') + '>' + esc(mins(m)) + '</option>'; }).join('') + '</select>';
  }
  function openDialog(title, html, canDelete) {
    fields.innerHTML = html;
    document.getElementById('dlgTitle').textContent = title;
    document.getElementById('dlgDelete').hidden = !canDelete;
    err.textContent = '';
    dlg.showModal();
    setTimeout(function () { var t = fields.querySelector('input,select,textarea'); t && t.focus(); }, 30);
  }
  function openItem(kind, item, defaults) {
    editing = { kind: kind, item: item || null };
    var v = Object.assign({}, defaults || {}, item || {});
    var f = field('fTitle', kind === 'resource' ? T('f.name', 'Name') : T('f.title', 'Title'), '<input id="fTitle" maxlength="200" required value="' + esc(v.title || '') + '" placeholder="' + esc(kind === 'assignment' ? T('ph.asg', 'e.g. Problem set 4') : kind === 'task' ? T('ph.task', 'e.g. Read chapter 3') : kind === 'achievement' ? T('ph.ach', 'e.g. Dean’s list, winter term') : '') + '">');
    if (kind !== 'achievement') f += field('fCourse', T('f.course', 'Course'), '<input id="fCourse" list="courseList" maxlength="120" value="' + esc(v.course_label || '') + '" placeholder="' + esc(T('ph.course', 'e.g. STAT 201')) + '">' + courseOptions(), true);
    if (kind === 'assignment') {
      f += '<div class="f2">' + field('fDue', T('f.due', 'Due date'), '<input id="fDue" type="date" value="' + esc(datePart(v.due_at)) + '">') + field('fDueT', T('f.time', 'Time'), '<input id="fDueT" type="time" value="' + esc(timePart(v.due_at) || '23:59') + '">') + '</div>';
      f += '<div class="f2">' + field('fWeight', T('f.weight', 'Share of the grade (%)'), '<input id="fWeight" type="number" min="0" max="100" step="0.5" value="' + esc(v.weight_pct == null ? '' : v.weight_pct) + '">', true) + field('fEst', T('f.est', 'Time it will take'), estSelect(v.estimate_min), true) + '</div>';
    }
    if (kind === 'task') f += '<div class="f2">' + field('fPlan', T('f.plan', 'Day to do it'), '<input id="fPlan" type="date" value="' + esc(v.planned_for || '') + '">', true) + field('fEst', T('f.est', 'Time it will take'), estSelect(v.estimate_min), true) + '</div>';
    if (kind === 'assignment' || kind === 'task') {
      var st = STATUS();
      f += field('fStatus', T('f.status', 'Status'), '<select id="fStatus">' + ['todo', 'doing', 'blocked', 'done'].map(function (k) { return '<option value="' + k + '"' + ((v.status || 'todo') === k ? ' selected' : '') + '>' + esc(st[k]) + '</option>'; }).join('') + '</select>');
    }
    if (kind === 'resource') f += field('fUrl', T('f.url', 'Web address'), '<input id="fUrl" type="url" maxlength="1000" placeholder="https://" value="' + esc(v.url || '') + '">');
    var lbl = kind === 'note' ? T('f.note', 'Note') : kind === 'achievement' ? T('f.ach', 'What you did') : (kind === 'task' || kind === 'assignment') ? T('f.details', 'Details or why it is blocked') : T('f.why', 'Why it is useful');
    f += field('fBody', lbl, '<textarea id="fBody" maxlength="20000"' + (kind === 'note' ? ' class="tall"' : '') + '>' + esc(v.body || '') + '</textarea>', kind !== 'note');
    if (kind === 'achievement') f += '<p class="hint">' + esc(T('ach-self', 'This shows on your Progress page as self-reported.')) + '</p>';
    if (kind === 'note' && S.dailyReady) f += '<p class="hint">' + esc(T('note-cards', 'Lines like “Q: … / A: …”, “term :: definition” or a sentence with {{hidden words}} become review cards. #tags and [[links]] connect ideas across courses.')) + '</p>';
    openDialog(item ? T('edit-x', 'Edit {{k}}', { k: TITLES()[kind] }) : T('add-x', 'Add {{k}}', { k: TITLES()[kind] }), f, !!item);
  }
  function openCourse() {
    editing = { kind: 'course' };
    openDialog(T('add-course', 'Add a course'), field('fCourseNew', T('f.course-code', 'Course code or name'), '<input id="fCourseNew" maxlength="120" placeholder="' + esc(T('ph.course2', 'e.g. STAT 201 or Microeconomics')) + '">') +
      '<p class="hint">' + esc(T('course-help', 'Use the code from your timetable when you can: it links the course to its public page and to tutors who teach it.')) + '</p>', false);
  }
  function openTerm() {
    editing = { kind: 'term' };
    var t = lsGet('shq_term' + (DEMO ? '_demo' : ''), null) || S.demoTerm || {};
    openDialog(T('term-title', 'Your current term'), field('fTermName', T('f.term-name', 'Name'), '<input id="fTermName" maxlength="60" value="' + esc(t.name || '') + '" placeholder="' + esc(T('ph.term', 'e.g. Winter term 2026/27, Semester 1')) + '">') +
      '<div class="f2">' + field('fTermStart', T('f.term-start', 'First day'), '<input id="fTermStart" type="date" value="' + esc(t.start || '') + '">') + field('fTermEnd', T('f.term-end', 'Last day'), '<input id="fTermEnd" type="date" value="' + esc(t.end || '') + '">') + '</div>' +
      '<p class="hint">' + esc(T('term-help', 'Used to show which week of the term you are in. Saved on this device.')) + '</p>', false);
  }
  function openReflect() {
    editing = { kind: 'reflect' };
    var cur = S.reflections.filter(function (r) { return r.week === weekKey(); })[0] || {};
    openDialog(T('reflect-title', 'Your week'), field('fWent', T('rf.went', 'What went well?'), '<textarea id="fWent" maxlength="600">' + esc(cur.went || '') + '</textarea>') +
      field('fStuck', T('rf.stuck', 'What is still stuck?'), '<textarea id="fStuck" maxlength="600">' + esc(cur.stuck || '') + '</textarea>') +
      field('fAim', T('rf.aim', 'One aim for next week'), '<input id="fAim" maxlength="200" value="' + esc(cur.aim || '') + '">') +
      '<p class="hint">' + esc(T('rf.hint', 'Private to you. Study HQ only uses it to show your own term in review. No mood or health questions.')) + '</p>', false);
  }
  function capture(course) {
    var d = new Date();
    openItem('note', null, { course_label: course || '', title: (course ? course + ' · ' : '') + T('lecture-on', 'Lecture, {{d}}', { d: fmt(d, { day: 'numeric', month: 'short' }) }), body: 'Q: \nA: \n' });
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function weekdaySelect(cur) { return '<select id="fWd">' + WD().map(function (d, i) { return '<option value="' + (i + 1) + '"' + (cur === i + 1 ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select>'; }
  function openClass() {
    editing = { kind: 'class' };
    openDialog(T('add-class', 'Add a class'), field('fCourse', T('f.course', 'Course'), '<input id="fCourse" list="courseList" maxlength="120" required placeholder="' + esc(T('ph.course', 'e.g. STAT 201')) + '">' + courseOptions()) +
      '<div class="f2">' + field('fWd', T('f.day', 'Day'), weekdaySelect(1)) + field('fRoom', T('f.room', 'Room'), '<input id="fRoom" maxlength="120">', true) + '</div>' +
      '<div class="f2">' + field('fStart', T('f.from', 'From'), '<input id="fStart" type="time" value="10:00">') + field('fEnd', T('f.to', 'To'), '<input id="fEnd" type="time" value="11:30">') + '</div>', false);
  }
  function openExam(id) {
    var f = S.follows.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    editing = { kind: 'exam', id: id };
    openDialog(T('exam-for', 'Exam date: {{c}}', { c: f.course_code }), field('fExam', T('f.exam-date', 'Exam date'), '<input id="fExam" type="date" value="' + esc(f.exam_date || '') + '">') +
      '<p class="hint">' + esc(T('exam-help', 'An exam date moves review cards forward and switches Today to exam mode six weeks before.')) + '</p>', false);
  }
  function openIcal() {
    editing = { kind: 'ical' };
    openDialog(T('import-tt', 'Import timetable'), field('fIcs', T('f.ics', 'Calendar file (.ics)'), '<input id="fIcs" type="file" accept=".ics,text/calendar">') +
      '<p class="hint">' + esc(T('ics-help', 'In your campus system look for “Export”, “iCal” or “Subscribe to calendar” and download the .ics file. It is read on this device; only the classes you confirm are saved.')) + '</p>' +
      '<details class="shq-where"><summary>' + esc(T('ics-where', 'Where do I find this file?')) + '</summary><ul>' +
      [['Stud.IP', T('w.studip', 'Open your timetable or calendar (Stundenplan / Terminkalender) and choose Export, then iCalendar.')],
       ['campo / HISinOne', T('w.campo', 'Open your timetable (Stundenplan) and choose iCalendar export.')],
       ['TUCaN', T('w.tucan', 'Open your timetable or appointments and choose Export, then iCalendar.')],
       ['ZEuS / eKVV', T('w.zeus', 'Open your personal timetable and look for the iCal or Export button.')],
       ['Moodle', T('w.moodle', 'Calendar, then Import or export calendars, then Export.')],
       [T('w.other-h', 'Something else'), T('w.other', 'Search the help pages of your university for “iCal” or “Stundenplan exportieren”. No file? Use “Add a class” instead, it takes a minute.')]
      ].map(function (r) { return '<li><b>' + esc(r[0]) + '</b> ' + esc(r[1]) + '</li>'; }).join('') + '</ul><p class="hint">' + esc(T('w.note', 'Menu names differ between universities; these are the usual places.')) + '</p></details>' +
      field('fIcsUrl', T('f.ics-url', 'Or paste the calendar link'), '<input id="fIcsUrl" type="url" maxlength="1000" placeholder="https://…">', true), false);
    document.getElementById('dlgSave').textContent = T('read-tt', 'Read timetable');
  }
  function cleanCourse(label) {
    var c = String(label || '').replace(/\((?:vorlesung|vl|übung|uebung|ü|ue|tutorium|tutorial|lecture|exercise|seminar|se|praktikum|lab)\)/ig, '')
      .replace(/(?<!\p{L})(vorlesung|übung|uebung|tutorium|tutorial|lecture|exercise|praktikum)(?!\p{L})/igu, '')
      .replace(/(?<!\p{L})(gruppe|group|grp\.?)\s*\w+/ig, '').replace(/[-–·,:]+\s*$/, '').replace(/\s+/g, ' ').trim();
    return c || String(label || '').trim();
  }
  function showIcalPreview(parsed) {
    var wd = WD();
    var names = {}; parsed.classes.forEach(function (c) { c.course = cleanCourse(c.course_label); names[H.courseKey(c.course)] = c.course; });
    parsed.exams.forEach(function (x) {
      var hit = Object.keys(names).filter(function (k) { return H.courseKey(x.course_label).indexOf(k) !== -1; })[0];
      x.course = hit ? names[hit] : null;
    });
    editing = { kind: 'ical-confirm', parsed: parsed };
    var rows = parsed.classes.map(function (c, i) {
      return '<label class="shq-pick"><input type="checkbox" name="cls" value="' + i + '" checked><span><b>' + esc(c.course) + '</b><small>' + esc(wd[c.weekday - 1] + ' ' + c.start + '–' + c.end + (c.kind ? ' · ' + c.kind : '') + (c.room ? ' · ' + c.room : '')) + '</small></span></label>';
    }).join('');
    var ex = parsed.exams.filter(function (x) { return x.course; }).map(function (x, i) {
      return '<label class="shq-pick"><input type="checkbox" name="exm" value="' + parsed.exams.indexOf(x) + '" checked><span><b>' + esc(T('exam-of', 'Exam: {{c}}', { c: x.course })) + '</b><small>' + esc(fmt(H.parseDay(x.date), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })) + '</small></span></label>';
    }).join('');
    fields.innerHTML = (parsed.classes.length ? '<p class="hint">' + esc(T('ics-found', 'Found {{n}} weekly classes. Untick anything that is not yours.', { n: parsed.classes.length })) + '</p><div class="shq-picks">' + rows + '</div>' : '<p class="hint">' + esc(T('ics-none', 'No weekly classes for the current term were found in this file.')) + '</p>') +
      (ex ? '<p class="hint" style="margin-top:12px">' + esc(T('ics-exams', 'Exam dates found:')) + '</p><div class="shq-picks">' + ex + '</div>' : '');
    document.getElementById('dlgTitle').textContent = T('confirm-tt', 'Check your timetable');
    document.getElementById('dlgSave').textContent = T('add-tt', 'Add to Study HQ');
    document.getElementById('dlgSave').disabled = !parsed.classes.length;
  }
  async function readIcal() {
    var input = document.getElementById('fIcs'), url = val('fIcsUrl'), text = null;
    try {
      if (input && input.files && input.files[0]) {
        if (input.files[0].size > 5 * 1048576) { err.textContent = T('e.ics-big', 'That file is too large for a timetable (5 MB at most).'); return; }
        text = await input.files[0].text();
      } else if (url) {
        if (!/^https:\/\//i.test(url) && !/^webcal:\/\//i.test(url)) { err.textContent = T('e.ics-url', 'Please paste a link starting with https:// or webcal://'); return; }
        if (DEMO) { err.textContent = T('e.ics-demo', 'The sample preview cannot fetch links. Choose a .ics file instead.'); return; }
        var r = await window._sb.functions.invoke('studyhq-ical', { body: { url: url.replace(/^webcal:/i, 'https:') } });
        if (r.error || !r.data || typeof r.data.ics !== 'string') { err.textContent = T('e.ics-fetch', 'That link could not be read. Download the .ics file and choose it above instead.'); return; }
        text = r.data.ics;
      } else { err.textContent = T('e.ics-pick', 'Choose a .ics file or paste a link.'); return; }
    } catch (ex) { err.textContent = T('e.ics-fetch', 'That link could not be read. Download the .ics file and choose it above instead.'); return; }
    if (!/BEGIN:VCALENDAR/i.test(text)) { err.textContent = T('e.ics-bad', 'That doesn’t look like a calendar file.'); return; }
    err.textContent = '';
    showIcalPreview(H.parseICS(text, { now: new Date() }));
    track('studyhq_ical_read', {});
  }
  async function saveIcal() {
    var p = editing.parsed, picked = Array.prototype.map.call(fields.querySelectorAll('input[name="cls"]:checked'), function (x) { return p.classes[+x.value]; });
    var exams = Array.prototype.map.call(fields.querySelectorAll('input[name="exm"]:checked'), function (x) { return p.exams[+x.value]; });
    if (!picked.length) { err.textContent = T('e.pick-one', 'Tick at least one class.'); return; }
    var have = {}; S.timetable.forEach(function (c) { have[H.courseKey(c.course_label) + c.weekday + c.start] = 1; });
    var rows = picked.filter(function (c) { return !have[H.courseKey(c.course) + c.weekday + c.start]; }).map(function (c) { return { course_label: c.course, kind: c.kind, room: c.room, weekday: c.weekday, start: c.start, end: c.end, source: 'ical' }; });
    var save = document.getElementById('dlgSave'); save.disabled = true;
    try {
      var known = {}; S.follows.forEach(function (f) { known[f.course_key || H.courseKey(f.course_code)] = f; });
      for (var i = 0; i < picked.length; i++) { var k = H.courseKey(picked[i].course); if (k && !known[k]) { await store.follow(picked[i].course); known[k] = S.follows[S.follows.length - 1]; } }
      await store.addClasses(rows);
      for (var j = 0; j < exams.length; j++) { var f = known[H.courseKey(exams[j].course)]; if (f && !f.exam_date) await store.setExam(f.id, exams[j].date); }
      dlg.close(); track('studyhq_ical_import', { classes: rows.length, exams: exams.length });
      location.hash = '#/overview'; render(); toast(T('tt-added', 'Timetable added: {{n}} classes.', { n: rows.length }));
    } catch (ex) { err.textContent = T('e.save', 'That didn’t save. Please try again.'); }
    finally { save.disabled = false; }
  }
  function openQuick() {
    editing = { kind: 'quick' };
    openDialog(T('capture-h', 'Capture'), '<div class="shq-quick">' +
      '<button type="button" data-qc="note">' + ic('pen', 22) + '<b>' + esc(T('cap-note', 'Note')) + '</b><small>' + esc(T('cap-note-s', 'Type key points')) + '</small></button>' +
      '<button type="button" data-qc="photo">' + ic('camera', 22) + '<b>' + esc(T('cap-photo', 'Slide photo')) + '</b><small>' + esc(T('cap-photo-s', 'For your own study only')) + '</small></button>' +
      '<button type="button" data-qc="pdf">' + ic('upload', 22) + '<b>' + esc(T('cap-pdf', 'PDF')) + '</b><small>' + esc(T('cap-pdf-s', 'Lecture slides or script')) + '</small></button></div>' +
      field('fCourse', T('f.course', 'Course'), '<input id="fCourse" list="courseList" maxlength="120" value="' + esc(currentClassCourse()) + '">' + courseOptions(), true) +
      '<p class="hint">' + esc(T('no-audio', 'Study HQ never records audio: recording a lecture without the lecturer’s consent is not allowed in Germany.')) + '</p>', false);
    document.getElementById('dlgSave').hidden = true;
  }
  function currentClassCourse() {
    var c = H.todayClasses({ timetable: S.timetable, items: [], now: new Date() }).filter(function (x) { return x.state === 'now'; })[0]
      || H.todayClasses({ timetable: S.timetable, items: [], now: new Date() }).filter(function (x) { return x.state === 'done'; }).slice(-1)[0];
    return c ? c.course : '';
  }
  function openDeleteAll() {
    editing = { kind: 'deleteall' };
    openDialog(T('delete-all', 'Delete all Study HQ data'), '<p class="hint">' + esc(T('del-all-help', 'This deletes your Study HQ courses, timetable, notes, files, cards, review history and reflections. It cannot be undone. Your UniSkilled account, lessons and payments are not affected.')) + '</p>' +
      field('fConfirm', T('type-delete', 'Type DELETE to confirm'), '<input id="fConfirm" autocomplete="off" maxlength="10">'), false);
    document.getElementById('dlgSave').textContent = T('delete-all-btn', 'Delete everything');
  }

  /* ---------------------------------------------------------------- files: photos and PDFs */
  var pendingCourse = '';
  function fileInput(kind) { return document.getElementById(kind === 'photo' ? 'shqPhoto' : 'shqPdf'); }
  function pickFile(kind, course) { pendingCourse = course || ''; var i = fileInput(kind); if (i) { i.value = ''; i.click(); } }
  async function head4(file) { var b = new Uint8Array(await file.slice(0, 12).arrayBuffer()); return b; }
  function isPdf(b) { return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; }
  function isImg(b) { return (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) || (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45); }
  // Photos are re-drawn on the device: smaller upload, and the location data cameras embed is dropped.
  function compressImage(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 2000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? ok(b) : no(new Error('encode')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('decode')); };
      img.src = url;
    });
  }
  // PDF text, read on this device. Uses pdf.js only if it has been added to the site (vendor/pdfjs);
  // without it the PDF is still stored and opens normally, it just isn't searchable yet.
  async function pdfText(file) {
    var lib = window.pdfjsLib; if (!lib) return { text: null, pages: null };
    try {
      var doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      var out = [], n = Math.min(doc.numPages, 400);
      for (var i = 1; i <= n; i++) { var pg = await doc.getPage(i); var tc = await pg.getTextContent(); out.push(tc.items.map(function (x) { return x.str; }).join(' ')); if (out.join('\n').length > 480000) break; }
      return { text: out.join('\n').replace(/\s+\n/g, '\n').slice(0, 480000) || null, pages: doc.numPages };
    } catch (ex) { return { text: null, pages: null }; }
  }
  async function handleFile(kind, file) {
    if (!file) return;
    if (file.size > 20 * 1048576 && kind === 'pdf') { toast(T('e.big', 'That file is over 20 MB. Please choose a smaller one.')); return; }
    var b = await head4(file);
    var course = pendingCourse || null, base = String(file.name || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 180) || T('photo', 'Photo');
    toast(T('uploading', 'Saving…'));
    try {
      var blob, meta;
      if (kind === 'pdf') {
        if (!isPdf(b)) { toast(T('e.notpdf', 'That file is not a PDF.')); return; }
        var t = await pdfText(file);
        blob = file; meta = { name: base + '.pdf', ext: '.pdf', mime: 'application/pdf', text: t.text, pages: t.pages, course_label: course };
      } else {
        if (!isImg(b) && !/^image\//.test(file.type)) { toast(T('e.notimg', 'That file is not a photo.')); return; }
        blob = await compressImage(file);
        if (blob.size > 20 * 1048576) { toast(T('e.big', 'That file is over 20 MB. Please choose a smaller one.')); return; }
        meta = { name: (course ? course + ' · ' : '') + T('slide-on', 'Slide, {{d}}', { d: fmt(new Date(), { day: 'numeric', month: 'short' }) }), ext: '.jpg', mime: 'image/jpeg', course_label: course };
      }
      if (usedBytes() + blob.size > 1073741824) { toast(T('e.full', 'Your 1 GB of Study HQ storage is full. Delete some files first.')); return; }
      await store.addFile(blob, meta); await store.log({ type: 'file' });
      track('studyhq_file_added', { kind: kind, searchable: !!meta.text });
      render(); toast(kind === 'pdf' ? (meta.text ? T('pdf-ok', 'PDF saved and searchable.') : T('pdf-ok2', 'PDF saved.')) : T('photo-ok', 'Photo saved.'));
    } catch (ex) { toast(navigator.onLine === false ? T('e.offline-file', 'You are offline. Files upload once you are back online.') : T('e.save', 'That didn’t save. Please try again.')); }
  }
  ['photo', 'pdf'].forEach(function (k) { var i = fileInput(k); if (i) i.addEventListener('change', function () { handleFile(k, i.files && i.files[0]); }); });

  /* ---------------------------------------------------------------- notes written offline wait here, then sync */
  function obKey() { return 'shq_outbox_' + (DEMO ? 'demo' : S.uid); }
  function outbox() { return lsGet(obKey(), []); }
  function queueNote(row) {
    var ob = outbox(); var local = Object.assign({ id: 'local-' + Date.now(), pending: true, status: 'todo', created_at: new Date().toISOString() }, row);
    ob.push(local); lsSet(obKey(), ob); S.items.push(local);
  }
  var flushing = false;
  async function flushOutbox() {
    if (flushing || DEMO || !S.itemsReady) return;
    var ob = outbox(); if (!ob.length || navigator.onLine === false) return;
    flushing = true;
    var left = [];
    for (var i = 0; i < ob.length; i++) {
      var row = Object.assign({}, ob[i]); var lid = row.id; delete row.id; delete row.pending; delete row.status; delete row.created_at;
      try { S.items = S.items.filter(function (x) { return x.id !== lid; }); await store.addItem(row); await store.log({ type: 'note' }); }
      catch (ex) { left.push(ob[i]); S.items.push(ob[i]); }
    }
    lsSet(obKey(), left); flushing = false;
    if (left.length < ob.length) { render(); toast(T('synced', 'Notes written offline are now saved.')); }
  }
  window.addEventListener('online', flushOutbox);

  /* ---------------------------------------------------------------- export */
  function exportData() {
    var data = { exported_at: new Date().toISOString(), note: 'Your UniSkilled Study HQ data. Files themselves can be opened from Study HQ; this lists them with their text.',
      courses: S.follows.map(function (f) { return { name: f.course_code, exam_date: f.exam_date || null }; }), timetable: S.timetable, items: S.items.filter(function (i) { return !i.pending; }),
      files: S.files.map(function (f) { return { name: f.name, type: f.mime, size_bytes: f.size_bytes, course: f.course_label, added: f.created_at, text: f.text_content || null }; }),
      card_states: S.cardStates, activity: S.log, reflections: S.reflections };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'study-hq-data-' + H.iso(new Date()) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    track('studyhq_export', {});
  }

  async function saveCourse() {
    var label = val('fCourseNew');
    if (!label || !H.courseKey(label)) { err.textContent = T('e.course', 'Please enter a course code or name.'); return; }
    if (S.follows.some(function (f) { return (f.course_key || H.courseKey(f.course_code)) === H.courseKey(label); })) { err.textContent = T('e.dup', 'That course is already in your list.'); return; }
    try { await store.follow(label); dlg.close(); track('studyhq_course_added', {}); location.hash = courseHref(H.courseKey(label)); render(); }
    catch (ex) { err.textContent = T('e.save', 'That didn’t save. Please try again.'); }
  }
  function saveTerm() {
    var name = val('fTermName'), s = val('fTermStart'), e = val('fTermEnd');
    if (!s || !e || e <= s) { err.textContent = T('e.term', 'Please choose a first and last day, in that order.'); return; }
    lsSet('shq_term' + (DEMO ? '_demo' : ''), { name: name, start: s, end: e }); dlg.close(); render();
  }
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!editing) return;
    if (editing.kind === 'course') return saveCourse();
    if (editing.kind === 'term') return saveTerm();
    if (editing.kind === 'ical') return readIcal();
    if (editing.kind === 'ical-confirm') return saveIcal();
    if (editing.kind === 'quick') return;
    if (editing.kind === 'exam') {
      try { await store.setExam(editing.id, val('fExam') || null); dlg.close(); render(); toast(T('saved', 'Saved')); } catch (ex) { err.textContent = T('e.save', 'That didn’t save. Please try again.'); }
      return;
    }
    if (editing.kind === 'class') {
      var cl = { course_label: val('fCourse'), weekday: +val('fWd'), start: val('fStart'), end: val('fEnd'), room: val('fRoom') || null, kind: null, source: 'manual' };
      if (!cl.course_label) { err.textContent = T('e.course', 'Please enter a course code or name.'); return; }
      if (!/^\d\d:\d\d$/.test(cl.start) || !/^\d\d:\d\d$/.test(cl.end) || cl.end <= cl.start) { err.textContent = T('e.times', 'Please choose a start and end time, in that order.'); return; }
      try {
        if (!S.follows.some(function (f) { return (f.course_key || H.courseKey(f.course_code)) === H.courseKey(cl.course_label); })) await store.follow(cl.course_label);
        await store.addClasses([cl]); dlg.close(); render(); toast(T('saved', 'Saved'));
      } catch (ex) { err.textContent = T('e.save', 'That didn’t save. Please try again.'); }
      return;
    }
    if (editing.kind === 'deleteall') {
      if (val('fConfirm') !== 'DELETE') { err.textContent = T('e.confirm', 'Type DELETE in capital letters to confirm.'); return; }
      try { await store.deleteEverything(); lsSet(obKey(), []); dlg.close(); track('studyhq_delete_all', {}); location.hash = '#/overview'; render(); toast(T('deleted-all', 'All Study HQ data deleted.')); }
      catch (ex) { err.textContent = T('e.del', 'That didn’t delete. Please try again.'); }
      return;
    }
    if (editing.kind === 'reflect') {
      var rf = { week: weekKey(), went: val('fWent'), stuck: val('fStuck'), aim: val('fAim') };
      if (!rf.went && !rf.stuck && !rf.aim) { err.textContent = T('e.reflect', 'Write at least one line.'); return; }
      try { await store.reflect(rf); await store.log({ type: 'reflect' }); dlg.close(); render(); toast(T('reflect-saved', 'Saved. See you next week.')); } catch (ex) { err.textContent = T('e.save', 'That didn’t save. Please try again.'); }
      return;
    }
    var k = editing.kind, row = { kind: k };
    row.title = val('fTitle');
    if (!row.title) { err.textContent = T('e.title', 'Please add a title.'); return; }
    if (k !== 'achievement') row.course_label = val('fCourse') || null;
    if (k === 'assignment') {
      var dd = val('fDue'), tt = val('fDueT') || '23:59';
      if (dd) { var p = dd.split('-'), q = tt.split(':'); row.due_at = new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]).toISOString(); } else row.due_at = null;
      var w = val('fWeight');
      if (w !== '' && (isNaN(+w) || +w < 0 || +w > 100)) { err.textContent = T('e.weight', 'The share of the grade must be between 0 and 100.'); return; }
      row.weight_pct = w === '' ? null : +w;
    }
    if (k === 'task') row.planned_for = val('fPlan') || null;
    if (k === 'assignment' || k === 'task') { row.estimate_min = val('fEst') ? +val('fEst') : null; row.status = val('fStatus') || 'todo'; }
    if (k === 'resource') { row.url = val('fUrl'); if (!safeUrl(row.url)) { err.textContent = T('e.url', 'Please enter a web address starting with https://'); return; } }
    if (document.getElementById('fBody')) row.body = val('fBody') || null;
    var save = document.getElementById('dlgSave'); save.disabled = true;
    try {
      if (editing.item) await store.updateItem(editing.item.id, row);
      else { await store.addItem(row); track('studyhq_item_added', { kind: k }); if (k === 'note') await store.log({ type: 'note' }); }
      dlg.close(); render(); toast(T('saved', 'Saved'));
    } catch (ex) {
      if (k === 'note' && !editing.item && !DEMO) { queueNote(row); dlg.close(); render(); toast(T('saved-local', 'Saved on this device. It syncs when you are back online.')); }
      else err.textContent = T('e.save', 'That didn’t save. Please try again.');
    }
    finally { save.disabled = false; }
  });
  document.getElementById('dlgCancel').addEventListener('click', function () { dlg.close(); });
  fields.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qc]'); if (!b) return;
    var k = b.getAttribute('data-qc'), course = val('fCourse');
    dlg.close();
    if (k === 'note') capture(course); else pickFile(k, course);
  });
  dlg.addEventListener('close', function () { var sv = document.getElementById('dlgSave'); sv.hidden = false; sv.disabled = false; sv.textContent = T('save', 'Save'); });
  document.getElementById('dlgDelete').addEventListener('click', async function () {
    if (!editing || !editing.item) return;
    if (!confirm(T('confirm-del', 'Delete “{{t}}”? This can’t be undone.', { t: editing.item.title }))) return;
    try { await store.deleteItem(editing.item.id); dlg.close(); render(); toast(T('deleted', 'Deleted')); }
    catch (ex) { err.textContent = T('e.del', 'That didn’t delete. Please try again.'); }
  });

  /* ---------------------------------------------------------------- actions */
  /* ---------------------------------------------------------------- one-line add + calendar file */
  function qaParse(text) { return H.parseQuickAdd(text, { now: new Date(), courses: S.courses.list.map(function (c) { return c.label; }) }); }
  function qaPreview(text) {
    if (!String(text || '').trim()) return '<span class="shq-qa-hint">' + esc(T('qa-hint', 'Try: “ECON essay due 12 Dec 20%” or “STAT exam 8.12. 10:00”')) + '</span>';
    var q = qaParse(text), chips = [];
    if (q.course_label) chips.push(q.course_label);
    chips.push(q.kind === 'exam' ? T('exam', 'Exam') : T('assignment', 'Assignment'));
    if (q.title && q.kind !== 'exam') chips.push(q.title);
    if (q.date) chips.push(fmt(H.parseDay(q.date), { weekday: 'short', day: 'numeric', month: 'short' }) + (q.time ? ' · ' + q.time : ''));
    if (q.weight_pct != null) chips.push(T('weight', '{{n}}% of grade', { n: q.weight_pct }));
    var miss = q.missing.indexOf('date') !== -1 ? '<span class="shq-qa-miss">' + esc(T('qa-need-date', 'Add a date, like “Fri”, “18 Dec” or “18.12.”')) + '</span>' : '';
    return '<span class="shq-qa-hint">' + esc(T('qa-understood', 'Understood as:')) + '</span>' + chips.map(function (c) { return '<span class="shq-qa-chip">' + esc(c) + '</span>'; }).join('') + miss;
  }
  async function qaAdd(text) {
    var q = qaParse(text);
    if (!q.ok) { var pv = document.getElementById('qaPreview'); if (pv) pv.innerHTML = qaPreview(text); var inp = document.getElementById('qaInput'); if (inp) inp.focus(); return; }
    if (q.kind === 'exam') {
      var label = q.course_label || q.title, key = H.courseKey(label);
      var f = S.follows.filter(function (x) { return (x.course_key || H.courseKey(x.course_code)) === key; })[0];
      if (!f) { await store.follow(label); f = S.follows.filter(function (x) { return (x.course_key || H.courseKey(x.course_code)) === key; })[0]; }
      if (f) await store.setExam(f.id, q.date);
    } else {
      var t = (q.time || '23:59').split(':'), d = H.parseDay(q.date); d.setHours(+t[0], +t[1], 0, 0);
      await store.addItem({ kind: 'assignment', title: q.title.slice(0, 200), course_label: q.course_label, due_at: d.toISOString(), weight_pct: q.weight_pct });
    }
    track('studyhq_quick_add', { kind: q.kind });
    render(); toast(q.kind === 'exam' ? T('exam-added', 'Exam added') : T('deadline-added', 'Deadline added'));
    var again = document.getElementById('qaInput'); if (again) again.focus();
  }
  function downloadIcs() {
    var L = deadlines();
    var blob = new Blob([H.toICS(L.rows, { now: new Date(), name: T('ics-name', 'Study HQ deadlines') })], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'study-hq-deadlines.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    track('studyhq_ics_download', { n: L.rows.length });
    toast(T('ics-done', 'Calendar file downloaded. Open it to add the dates to your phone or laptop calendar.'));
  }
  async function loadHelp() {
    if (!store.loadHelp) return;
    var today = H.startOfDay(new Date()), keys = [];
    S.exams.forEach(function (x) { var n = Math.round((H.parseDay(x.exam_date) - today) / 86400000); var k = keyOf(x); if (n >= 0 && n <= 42 && k && keys.indexOf(k) === -1) keys.push(k); });
    await store.loadHelp(keys.slice(0, 6));
  }

  function findItem(id) { return S.items.filter(function (i) { return String(i.id) === String(id); })[0]; }
  function findTask(id) { var f = null; Object.keys(S.tasksByExam).forEach(function (k) { S.tasksByExam[k].forEach(function (t) { if (String(t.id) === String(id)) f = t; }); }); return f; }
  hq.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || b.disabled) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    try {
      if (act === 'add') openItem(b.getAttribute('data-kind'), null, { course_label: b.getAttribute('data-course') || '', planned_for: b.getAttribute('data-date') || '' });
      else if (act === 'add-course') openCourse();
      else if (act === 'term') openTerm();
      else if (act === 'edit') { var it = findItem(id); if (it) openItem(it.kind, it); }
      else if (act === 'done') {
        var x = findItem(id); if (!x) return;
        var was = x.status;
        await store.updateItem(id, { status: was === 'done' ? 'todo' : 'done' });
        if (was !== 'done') track('studyhq_item_done', { kind: x.kind });
        render(); toast(was === 'done' ? T('reopened', 'Reopened') : T('nice', 'Done. Nice work.'));
      } else if (act === 'start') { await store.updateItem(id, { status: 'doing' }); render(); }
      else if (act === 'task-done') {
        location.href = 'exam-planner.html'; // revision steps are ticked in the Exam planner
      } else if (act === 'skip') { ui.skipped.push(String(id)); lsSet('shq_skip_' + H.iso(new Date()), ui.skipped); render(); }
      else if (act === 'move-tomorrow') {
        var mv = findItem(id); if (!mv) return;
        var old = new Date(mv.due_at), nd = H.addDays(H.startOfDay(new Date()), 1); nd.setHours(old.getHours(), old.getMinutes(), 0, 0);
        await store.updateItem(id, { due_at: nd.toISOString() });
        track('studyhq_move_tomorrow', {}); render(); toast(T('moved', 'Moved to tomorrow.'));
      }
      else if (act === 'dl-type') { ui.dlType = b.getAttribute('data-v'); render(); }
      else if (act === 'help-hide') { ui.hideHelp = true; lsSet('shq_hide_help', true); render(); }
      else if (act === 'help-show') { ui.hideHelp = false; lsSet('shq_hide_help', false); render(); }
      else if (act === 'help-ask') { track('studyhq_help_request', {}); }
      else if (act === 'help-tutor') { track('studyhq_help_tutor', { action: b.getAttribute('data-v') }); }
      else if (act === 'ics') downloadIcs();
      else if (act === 'qa-add') { var qi = document.getElementById('qaInput'); if (qi) await qaAdd(qi.value); }
      else if (act === 'minutes') { ui.minutes = +b.getAttribute('data-v'); lsSet('shq_minutes', ui.minutes); render(); }
      else if (act === 'week') { var v = +b.getAttribute('data-v'); ui.weekOffset = v === 0 ? 0 : ui.weekOffset + v; render(); }
      else if (act === 'asg-filter') { ui.asgFilter = b.getAttribute('data-v'); render(); }
      else if (act === 'note-filter') { ui.noteFilter = b.getAttribute('data-v'); ui.noteSel = null; render(); }
      else if (act === 'note-sel') { ui.noteSel = id; render(); }
      else if (act === 'course-tab') { ui.courseTab = b.getAttribute('data-v'); render(); }
      else if (act === 'follow') { await store.follow(b.getAttribute('data-label')); render(); toast(T('course-added', 'Course added')); }
      else if (act === 'capture') capture(b.getAttribute('data-course'));
      else if (act === 'quick-capture') openQuick();
      else if (act === 'plant-rustle') { var g = b.querySelector('.gd-sway'); if (g) { g.classList.remove('gd-rustle'); void g.getBoundingClientRect(); g.classList.add('gd-rustle'); } }
      else if (act === 'upload') pickFile(b.getAttribute('data-kind'), b.getAttribute('data-course'));
      else if (act === 'file-open') {
        var fo = S.files.filter(function (f) { return String(f.id) === String(id); })[0]; if (!fo) return;
        var u = await store.fileUrl(fo);
        if (!u) { toast(T('sample-file', 'This is a sample file in the preview.')); return; }
        var w = window.open('', '_blank');
        if (w && u) { w.opener = null; w.location = u; } else if (u) location.href = u;
      }
      else if (act === 'file-del') {
        var fd = S.files.filter(function (f) { return String(f.id) === String(id); })[0]; if (!fd) return;
        if (!confirm(T('confirm-del', 'Delete “{{t}}”? This can’t be undone.', { t: fd.name }))) return;
        await store.deleteFile(fd); render(); toast(T('deleted', 'Deleted'));
      }
      else if (act === 'lib-clear') { ui.libQ = ''; render(); }
      else if (act === 'ical') openIcal();
      else if (act === 'class-add') openClass();
      else if (act === 'class-del') { if (!confirm(T('confirm-class', 'Remove this class from your timetable?'))) return; await store.deleteClass(id); render(); }
      else if (act === 'exam') openExam(id);
      else if (act === 'export') exportData();
      else if (act === 'delete-all') openDeleteAll();
      else if (act === 'rv-start') startReview();
      else if (act === 'rv-show') { if (ui.review) { ui.review.shown = true; render(); } }
      else if (act === 'rv-grade') await grade(b.getAttribute('data-v') === '1');
      else if (act === 'rv-close') { ui.review = null; render(); }
      else if (act === 'sug-no') { ui.dismissed.push(id); lsSet('shq_dismiss_' + H.iso(new Date()), ui.dismissed); render(); }
      else if (act === 'sug-ok') await approve(id);
      else if (act === 'focus-start') startFocus(+b.getAttribute('data-v') || 25, b.getAttribute('data-t') || '');
      else if (act === 'reflect') openReflect();
      else if (act === 'idea-add') {
        var nt = findItem(id), idea = nt && H.suggestCards(nt.body)[+b.getAttribute('data-v')];
        if (!idea) return;
        await store.updateItem(id, { body: String(nt.body || '').replace(/\s+$/, '') + '\nQ: ' + idea.front + '\nA: ' + idea.back });
        render(); toast(T('card-added', 'Card added to your note'));
      }
      else if (act === 'unfollow') {
        if (!confirm(T('confirm-unfollow', 'Remove this course from your list? Its assignments and notes stay in Study HQ.'))) return;
        await store.unfollow(id); location.hash = '#/courses'; render();
      }
    } catch (ex) { toast(T('e.generic', 'Something went wrong. Please try again.')); render(); }
  });
  /* review session, suggestions, ask, focus timer (daily-learning prototype) */
  function startReview() {
    var q = queueNow(allCards());
    ui.review = q.total ? { ids: q.due.concat(q.fresh).map(function (c) { return c.id; }), i: 0, shown: false, n: 0, right: 0, graded: {}, again: {} } : null;
    if (location.hash !== '#/learn') location.hash = '#/learn'; else render();
    track('studyhq_review_start', { cards: q.total });
  }
  async function grade(knew) {
    var r = ui.review; if (!r || r.finished || !r.shown) return;
    var id = r.ids[r.i];
    await store.setCard(id, H.reviewNext(S.cardStates[id], knew, new Date()));
    if (!r.graded[id]) { r.graded[id] = 1; r.n++; if (knew) r.right++; }
    if (!knew && !r.again[id]) { r.again[id] = 1; r.ids.push(id); } // once more at the end of today's session
    r.i++; r.shown = false;
    if (r.i >= r.ids.length) { r.finished = true; await store.log({ type: 'review', n: r.n, right: r.right }); track('studyhq_review_done', { cards: r.n }); }
    render();
  }
  async function approve(id) {
    var x = dailyModel().suggestions.filter(function (s) { return s.id === id; })[0]; if (!x) return;
    track('studyhq_suggestion_ok', { kind: x.k });
    if (x.k === 'capture') return capture(x.course);
    if (x.k === 'review') return startReview();
    if (x.k === 'reflect') return openReflect();
    ui.dismissed.push(id); lsSet('shq_dismiss_' + H.iso(new Date()), ui.dismissed); render();

  }
  async function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    var results = H.searchNotes(searchable(), q, 4);
    ui.ask = { q: q, results: results, mode: 'search' };
    if (route().name !== 'learn') location.hash = '#/learn';
    // On-device model (Chrome's built-in Gemini Nano) when it is already on this computer. Never a paid API,
    // never a large download without asking: otherwise the search results above are the answer.
    try {
      if (window.LanguageModel && results.length && (await window.LanguageModel.availability()) === 'available') {
        ui.ask.busy = true; render();
        var session = await window.LanguageModel.create({ initialPrompts: [{ role: 'system', content: 'You help a university student using only the notes provided. Answer in at most three sentences. If the notes do not contain the answer, say so.' }] });
        var ctx = results.map(function (h) { return 'Note "' + h.item.title + '":\n' + (h.item.body || ''); }).join('\n\n').slice(0, 6000);
        var answer = await session.prompt('Notes:\n' + ctx + '\n\nQuestion: ' + q);
        if (session.destroy) session.destroy();
        ui.ask = { q: q, results: results, mode: 'ai', answer: String(answer || '').trim() };
      }
    } catch (ex) { ui.ask = { q: q, results: results, mode: 'search' }; }
    render();
    track('studyhq_ask', { mode: ui.ask.mode });
  }
  hq.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'qaInput') { var pv = document.getElementById('qaPreview'); if (pv) pv.innerHTML = qaPreview(e.target.value); }
  });
  hq.addEventListener('submit', function (e) {
    var qf = e.target.closest('[data-form="qa"]');
    if (qf) { e.preventDefault(); qaAdd(qf.querySelector('input').value); return; }
    var lf = e.target.closest('[data-form="lib"]');
    if (lf) { e.preventDefault(); ui.libQ = lf.querySelector('input').value.trim().slice(0, 200); render(); track('studyhq_search', {}); var li = document.getElementById('libQ'); if (li) li.focus(); return; }
    var f = e.target.closest('[data-form="ask"]'); if (!f) return;
    e.preventDefault(); ask(f.querySelector('input').value);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !dlg.open && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) { var cmd = document.getElementById('shqCmd'); if (cmd) { e.preventDefault(); cmd.focus(); return; } }
    if (!ui.review || ui.review.finished || route().name !== 'learn' || dlg.open) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
    if ((e.key === ' ' || e.key === 'Enter') && !ui.review.shown) { e.preventDefault(); ui.review.shown = true; render(); }
    else if (ui.review.shown && (e.key === '1' || e.key === '2')) { e.preventDefault(); grade(e.key === '2'); }
  });
  var timerEl = null, timerTick = null;
  function startFocus(minutes, title) {
    stopFocus(false);
    ui.focus = { start: Date.now(), end: Date.now() + minutes * 60000, minutes: minutes, title: title };
    timerEl = document.createElement('div'); timerEl.className = 'shq-timer'; timerEl.setAttribute('role', 'timer');
    document.body.appendChild(timerEl);
    timerEl.addEventListener('click', function (e) { if (e.target.closest('[data-stop]')) stopFocus(true); });
    function draw() {
      var left = Math.max(0, ui.focus.end - Date.now()), m = Math.floor(left / 60000), sec = Math.floor(left % 60000 / 1000);
      timerEl.innerHTML = ic('timer', 16) + '<span><b>' + m + ':' + String(sec).padStart(2, '0') + '</b><small>' + esc(title || T('focus', 'Focus')) + '</small></span><button type="button" data-stop>' + esc(T('focus-stop', 'Stop')) + '</button>';
      if (!left) stopFocus(true, true);
    }
    draw(); timerTick = setInterval(draw, 1000);
    track('studyhq_focus_start', { minutes: minutes });
  }
  async function stopFocus(record, finished) {
    if (!ui.focus) return;
    var f = ui.focus; ui.focus = null; clearInterval(timerTick);
    if (timerEl) { timerEl.remove(); timerEl = null; }
    var mins2 = finished ? f.minutes : Math.round((Date.now() - f.start) / 60000);
    if (record && mins2 >= 1) { await store.log({ type: 'focus', minutes: mins2 }); render(); toast(finished ? T('focus-done', 'Focus session done. Take a short break.') : T('focus-saved', '{{m}} focused minutes added to your week.', { m: mins2 })); }
  }

  hq.addEventListener('change', async function (e) {
    var s = e.target;
    if (s.matches('select[data-act="status"]')) {
      try { await store.updateItem(s.getAttribute('data-id'), { status: s.value }); render(); } catch (ex) { toast(T('e.generic', 'Something went wrong. Please try again.')); render(); }
    } else if (s.matches('select[data-act="capacity"]')) { ui.capacity = +s.value; lsSet('shq_capacity', ui.capacity); render(); }
  });

  /* ---------------------------------------------------------------- preview: concept switcher */
  function demoBar() {
    var bar = document.getElementById('demoBar');
    if (!bar) return;
    bar.hidden = false;
    bar.innerHTML = '<span>' + esc(T('demo-bar', 'Preview with sample data. Nothing you change is saved.')) + '</span>';
  }

  /* ---------------------------------------------------------------- start */
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  (async function init() {
    applySkin();
    try {
      if (DEMO) {
        demoBar();
        if (!window.StudyHQDemo) await loadScript('studyhq-demo.js');
      } else {
        var r = await window._sb.auth.getSession();
        var session = r.data && r.data.session;
        if (!session) { location.href = 'signin.html?redirect=' + encodeURIComponent(location.pathname + location.search + location.hash); return; }
        // Students and tutors both get their own workspace (tutors are university students too).
        // Every Study HQ table and file is private to its owner (user_id = auth.uid()), whatever the role.
        S.uid = session.user.id;
      }
      await store.load();
      if (!DEMO) S.items = S.items.concat(outbox());
      render();
      flushOutbox();
      loadHelp().then(render, function () {});
      // Installable app + offline: the service worker only controls Study HQ pages (scope /studyhq).
      if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') { try { navigator.serviceWorker.register('studyhq-sw.js', { scope: './studyhq' }); } catch (e) {} }
    } catch (ex) {
      hq.innerHTML = '<main id="main" class="shq-solo"><h1>' + esc(T('load-fail', 'Study HQ could not load.')) + '</h1><p>' + esc(T('load-fail-sub', 'Please check your connection and reload the page.')) + '</p><button type="button" class="shq-btn ghost" onclick="location.reload()">' + esc(T('reload', 'Reload')) + '</button></main>';
      if (window.Sentry && window.Sentry.captureException) try { window.Sentry.captureException(ex); } catch (e2) {}
    }
  })();
})();
