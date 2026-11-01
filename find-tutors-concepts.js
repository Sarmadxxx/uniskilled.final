/* UniSkilled — Find a Tutor concepts: shared data layer (PREVIEW ONLY, not linked from the site).
   Uses the same Supabase queries, ranking and course-aware search as find-tutors.html, so every
   concept shows the real tutors. "?demo=1" adds clearly labelled sample tutors that can't be booked. */
(function () {
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var safeUrl = function (u) { u = String(u == null ? '' : u).trim(); if (/^https:\/\//i.test(u)) return esc(u); return ''; };
  var SYM = { GBP: '£', EUR: '€', USD: '$', TRY: '₺', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ', CHF: 'CHF ', CAD: 'CA$', AUD: 'A$', INR: '₹', PLN: 'zł', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ' };
  var DAYS = [['mon', 'Mon', 'M'], ['tue', 'Tue', 'T'], ['wed', 'Wed', 'W'], ['thu', 'Thu', 'T'], ['fri', 'Fri', 'F'], ['sat', 'Sat', 'S'], ['sun', 'Sun', 'S']];
  var TIMES = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', flexible: 'Flexible hours' };
  var LEVEL = { bachelor: "Bachelor's", master: "Master's", masters: "Master's", phd: 'PhD', doctorate: 'PhD' };
  var DEMO = /[?&]demo=1\b/.test(location.search);

  var _sb = window.supabase.createClient(USK_CONFIG.url, USK_CONFIG.anonKey, { realtime: { params: { eventsPerSecond: 0 } }, global: { fetch: window.fetch.bind(window) } });
  var me = { id: null, role: null, uni: '' };

  function norm(tp, u, rv, courses, globalMean) {
    var name = (u && u.full_name) || 'Tutor';
    var cur = tp.currency || 'GBP';
    var rate = tp.hourly_rate != null ? Number(tp.hourly_rate) : null;
    var subjects = Array.isArray(tp.subjects) ? tp.subjects.filter(Boolean) : [];
    var days = Array.isArray(tp.availability) ? tp.availability : [];
    var times = Array.isArray(tp.preferred_times) && tp.preferred_times.length ? tp.preferred_times : (tp.preferred_time ? [tp.preferred_time] : []);
    var lvl = LEVEL[String(tp.degree_level || '').toLowerCase()] || '';
    var study = [lvl, tp.major].filter(Boolean).join(' · ');
    if (tp.study_year) study += (study ? ', ' : '') + 'year ' + tp.study_year;
    return {
      id: tp.user_id, name: name,
      initials: name.split(/\s+/).map(function (n) { return n[0] || ''; }).join('').slice(0, 2).toUpperCase(),
      avatar: tp.avatar_url || (u && u.avatar_url) || null,
      uni: tp.location || '', country: (u && u.country) || tp.country || '',
      bio: tp.bio || '', subjects: subjects, courses: courses || [],
      rate: rate, currency: cur, sym: SYM[cur] || (cur + ' '),
      verified: !!tp.university_verified_at, verifiedUni: tp.verified_university || '',
      rating: rv.count >= 3 ? (rv.total / rv.count) : null, reviews: rv.count,
      rankScore: (3 * globalMean + rv.total) / (3 + rv.count),
      days: days, times: times, study: study, sessionLength: tp.session_length ? Number(tp.session_length) : 60,
      groupMax: tp.max_students || null, lessons: tp.sessions_count || 0,
      joined: tp.created_at ? new Date(tp.created_at) : null, sample: false
    };
  }

  function samples() {
    var mk = function (o) { return Object.assign({ id: 'sample-' + o.n, initials: o.name.split(' ').map(function (x) { return x[0]; }).join(''), avatar: null, country: '', currency: 'EUR', sym: '€', reviews: 0, rating: null, rankScore: 4.5, times: [], sessionLength: 60, groupMax: null, lessons: 0, joined: null, verifiedUni: '', bio: '', courses: [], study: '', sample: true }, o); };
    return [
      mk({ n: 1, name: 'Lena Hoffmann', uni: 'Humboldt University of Berlin', subjects: ['Statistics', 'R programming'], rate: 22, verified: true, verifiedUni: 'Humboldt University of Berlin', days: ['mon', 'wed', 'thu'], times: ['evening'], study: "Master's · Economics, year 2", bio: 'I help first-years make sense of regression and hypothesis testing with worked exam questions.', courses: [{ course_code: 'STAT101', course_name: 'Introduction to Statistics', university: 'Humboldt University of Berlin', grade: '1.3' }], rating: 4.8, reviews: 6, rankScore: 4.75, lessons: 14 }),
      mk({ n: 2, name: 'Omar Haddad', uni: 'Qatar University', subjects: ['Calculus', 'Linear Algebra'], rate: 18, verified: true, verifiedUni: 'Qatar University', days: ['sun', 'mon', 'tue'], times: ['afternoon', 'evening'], study: "Bachelor's · Mathematics, year 4", bio: 'Calculus I and II, step by step, in English or Arabic.', courses: [{ course_code: 'MATH 101', course_name: 'Calculus I', university: 'Qatar University', grade: 'A' }, { course_code: 'MATH 211', course_name: 'Linear Algebra', university: 'Qatar University', grade: 'A-' }], rating: 4.9, reviews: 4, rankScore: 4.72, lessons: 9 }),
      mk({ n: 3, name: 'Sofia Rossi', uni: 'TU Munich', subjects: ['Python', 'Data Structures'], rate: 28, verified: false, days: ['sat', 'sun'], times: ['morning'], study: "Master's · Informatics, year 1", bio: 'Coding interviews and algorithms courses, with plenty of practice problems.', courses: [{ course_code: 'IN0007', course_name: 'Algorithms and Data Structures', university: 'TU Munich', grade: '1.7' }] }),
      mk({ n: 4, name: 'Daniel Okafor', uni: 'University of Amsterdam', subjects: ['Microeconomics', 'Game Theory'], rate: 25, verified: true, verifiedUni: 'University of Amsterdam', days: ['tue', 'thu', 'fri'], times: ['afternoon'], study: "Bachelor's · Econometrics, year 3", groupMax: 4, bio: 'Clear diagrams, past exams and a calm pace before the midterm.', rating: null, reviews: 1, rankScore: 4.6 }),
      mk({ n: 5, name: 'Mira Petrova', uni: 'Charles University', subjects: ['Organic Chemistry'], rate: 20, verified: false, days: ['mon', 'wed', 'fri', 'sat'], times: ['flexible'], study: "Master's · Chemistry, year 2" }),
      mk({ n: 6, name: 'Yusuf Demir', uni: 'Istanbul Bilgi University', subjects: ['International Relations', 'European Studies'], rate: 16, verified: true, verifiedUni: 'Istanbul Bilgi University', days: ['tue', 'sat', 'sun'], times: ['evening'], study: "Master's · International Relations, year 2", rating: 4.6, reviews: 3, rankScore: 4.55, lessons: 5 })
    ];
  }

  async function load() {
    var res = await _sb.from('tutor_profiles').select('id,user_id,bio,subjects,hourly_rate,currency,location,country,university_verified_at,verified_university,created_at,session_length,availability,preferred_time,preferred_times,degree_level,major,study_year,max_students,avatar_url,sessions_count');
    if (res.error) throw res.error;
    var profiles = res.data || [];
    var ids = profiles.map(function (p) { return p.user_id; }).filter(Boolean);
    var both = await Promise.all([
      ids.length ? _sb.from('public_tutors').select('id,full_name,avatar_url,country').in('id', ids) : { data: [] },
      _sb.from('reviews').select('tutor_id,rating'),
      ids.length ? _sb.from('tutor_courses').select('*').in('tutor_id', ids) : { data: [] }
    ]);
    var users = {}, rev = {}, crs = {};
    (both[0].data || []).forEach(function (u) { users[u.id] = u; });
    var all = (both[1].data || []).map(function (r) { return r.rating; });
    var mean = all.length ? all.reduce(function (a, b) { return a + b; }, 0) / all.length : 4.5;
    (both[1].data || []).forEach(function (r) { (rev[r.tutor_id] = rev[r.tutor_id] || { total: 0, count: 0 }); rev[r.tutor_id].total += r.rating; rev[r.tutor_id].count++; });
    (both[2].data || []).forEach(function (c) { (crs[c.tutor_id] = crs[c.tutor_id] || []).push(c); });
    var list = profiles.map(function (tp) { return norm(tp, users[tp.user_id], rev[tp.user_id] || { total: 0, count: 0 }, crs[tp.user_id], mean); });
    if (DEMO) list = list.concat(samples());
    // Same order as the live page: verified first, then blended rating, then review count
    list.sort(function (a, b) { return ((b.verified ? 1 : 0) - (a.verified ? 1 : 0)) || (b.rankScore - a.rankScore) || (b.reviews - a.reviews); });
    return list;
  }

  async function who() {
    try {
      var s = (await _sb.auth.getSession()).data.session;
      if (!s) return;
      me.id = s.user.id; me.role = (s.user.user_metadata || {}).role || 'student';
      if (me.role !== 'tutor') { var sp = await _sb.from('student_profiles').select('university').eq('user_id', me.id).maybeSingle(); if (sp.data && sp.data.university) me.uni = sp.data.university; }
    } catch (e) {}
  }

  var courseMatch = function (c, q) { return !!q && ['course_code', 'course_name', 'professor_name', 'university'].some(function (k) { return (c[k] || '').toLowerCase().indexOf(q) > -1; }); };
  var sameUni = function (a, b) { a = (a || '').toLowerCase(); b = (b || '').toLowerCase(); return !!a && !!b && (a.indexOf(b) > -1 || b.indexOf(a) > -1); };

  // Why a tutor matches the search: shown on cards so results explain themselves
  function why(t, q) {
    q = (q || '').toLowerCase().trim(); if (!q) return null;
    var c = t.courses.find(function (c) { return courseMatch(c, q); });
    if (c) return { kind: 'course', text: 'Passed ' + (c.course_name || c.course_code) + (sameUni(c.university || t.verifiedUni || t.uni, me.uni) ? ' at your university' : (c.university ? ' at ' + c.university : '')) + (c.grade ? ' · grade ' + c.grade : '') };
    var s = t.subjects.find(function (s) { return s.toLowerCase().indexOf(q) > -1; });
    if (s) return { kind: 'subject', text: 'Teaches ' + s };
    if (t.uni.toLowerCase().indexOf(q) > -1) return { kind: 'uni', text: 'Studies at ' + t.uni };
    if (t.name.toLowerCase().indexOf(q) > -1) return { kind: 'name', text: '' };
    return null;
  }

  function search(list, q, f) {
    f = f || {}; q = (q || '').toLowerCase().trim();
    var out = list.filter(function (t) {
      if (q && !why(t, q)) return false;
      if (f.days && f.days.length && !f.days.some(function (d) { return t.days.indexOf(d) > -1; })) return false;
      if (f.maxRate != null && t.rate != null && t.rate > f.maxRate) return false;
      if (f.uni === 'same') { if (!me.uni || !sameUni(t.uni, me.uni)) return false; }
      else if (f.uni && t.uni !== f.uni) return false;
      if (f.subject && !t.subjects.some(function (s) { return s.toLowerCase() === f.subject.toLowerCase(); })) return false;
      if (f.verified && !t.verified) return false;
      // Tutors who haven't set preferred times stay in results (unknown is not "unavailable")
      if (f.times && f.times.length && t.times.length && !f.times.some(function (x) { return t.times.indexOf(x) > -1 || t.times.indexOf('flexible') > -1; })) return false;
      return true;
    });
    if (q) { // course matches at the student's university first, then any course match (same as live page)
      var sc = function (t) { var h = t.courses.filter(function (c) { return courseMatch(c, q); }); if (!h.length) return 0; return h.some(function (c) { return sameUni(c.university || t.verifiedUni || t.uni, me.uni); }) ? 2 : 1; };
      out = out.map(function (t, i) { return { t: t, i: i, s: sc(t) }; }).sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); }).map(function (x) { return x.t; });
    }
    var s = f.sort || 'best';
    var noRate = function (t) { return t.rate == null ? Infinity : t.rate; };
    if (s === 'price-asc') out.sort(function (a, b) { return noRate(a) - noRate(b); });
    if (s === 'price-desc') out.sort(function (a, b) { return (b.rate || 0) - (a.rate || 0); });
    if (s === 'days') out.sort(function (a, b) { return b.days.length - a.days.length; });
    return out;
  }

  // Suggestions come only from what is actually in the data
  function suggest(list, q) {
    q = (q || '').toLowerCase().trim(); if (!q) return [];
    var seen = {}, out = [];
    function add(type, label, value) { var k = type + label.toLowerCase(); if (seen[k] || label.toLowerCase().indexOf(q) < 0) return; seen[k] = 1; out.push({ type: type, label: label, value: value || label }); }
    list.forEach(function (t) {
      t.courses.forEach(function (c) { if (c.course_name) add('Course', (c.course_code ? c.course_code + ' · ' : '') + c.course_name, c.course_name); else if (c.course_code) add('Course', c.course_code); });
      t.subjects.forEach(function (s) { add('Subject', s); });
      if (t.uni) add('University', t.uni);
      add('Tutor', t.name);
    });
    return out.slice(0, 7);
  }

  function counts(list) {
    var m = {}; list.forEach(function (t) { t.subjects.forEach(function (s) { m[s] = (m[s] || 0) + 1; }); });
    return Object.keys(m).map(function (k) { return { subject: k, count: m[k] }; }).sort(function (a, b) { return b.count - a.count || a.subject.localeCompare(b.subject); });
  }
  function unis(list) { var m = {}; list.forEach(function (t) { if (t.uni) m[t.uni] = (m[t.uni] || 0) + 1; }); return Object.keys(m).sort(); }

  var canBook = function (t) { return !t.sample && t.id !== me.id && me.role !== 'tutor'; };
  var links = {
    profile: function (t) { return t.sample ? null : 'tutor-profile.html?id=' + encodeURIComponent(t.id); },
    book: function (t) { return canBook(t) ? 'book-session.html?tutor=' + encodeURIComponent(t.id) + '&name=' + encodeURIComponent(t.name) : null; },
    course: function (c) { return c.course_key ? 'course.html?c=' + encodeURIComponent(c.course_key) : null; },
    request: 'find-tutors.html#request'
  };
  var price = function (t) { return t.rate == null ? null : t.sym + (t.rate % 1 ? t.rate.toFixed(2) : t.rate); };
  var daysLabel = function (t) {
    if (!t.days.length) return '';
    if (t.days.length === 7) return 'Every day';
    return DAYS.filter(function (d) { return t.days.indexOf(d[0]) > -1; }).map(function (d) { return d[1]; }).join(', ');
  };
  var timesLabel = function (t) { return t.times.map(function (x) { return TIMES[x] || x; }).join(', '); };
  var avatar = function (t, cls) { var u = safeUrl(t.avatar); return u ? '<img class="' + cls + '" src="' + u + '" alt="" loading="lazy">' : '<span class="' + cls + ' ini" aria-hidden="true">' + esc(t.initials) + '</span>'; };
  var rateBounds = function (list) { var r = list.map(function (t) { return t.rate; }).filter(function (x) { return x != null; }); return r.length ? { min: Math.floor(Math.min.apply(null, r)), max: Math.ceil(Math.max.apply(null, r)) } : { min: 0, max: 0 }; };

  window.FT = {
    DAYS: DAYS, TIMES: TIMES, demo: DEMO, me: me, esc: esc, why: why, search: search, suggest: suggest, counts: counts, unis: unis,
    links: links, canBook: canBook, price: price, daysLabel: daysLabel, timesLabel: timesLabel, avatar: avatar, rateBounds: rateBounds,
    ready: Promise.all([load(), who()]).then(function (r) { return r[0]; })
  };
})();
