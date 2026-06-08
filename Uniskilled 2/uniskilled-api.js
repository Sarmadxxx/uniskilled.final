/**
 * UniSkilled API Client
 * Include this file in every HTML page before the closing </body> tag:
 * <script src="uniskilled-api.js"></script>
 *
 * It connects your HTML pages to the Supabase backend.
 */

(function () {

  // ── CONFIG ──
  var SUPABASE_URL = 'https://orghkbbohnabcietidiv.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2hrYmJvaG5hYmNpZXRpZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzcwMTMsImV4cCI6MjA5MjcxMzAxM30.3bOnZuga8a4xY4mbKdgLnw6EwAV5UuQDz26JI_vM-u8';
  var FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

  // ── HELPERS ──
  function getToken() {
    try {
      var raw = localStorage.getItem('sb-orghkbbohnabcietidiv-auth-token');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed?.access_token || null;
    } catch (e) { return null; }
  }

  function authHeaders() {
    var token = getToken();
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': token ? 'Bearer ' + token : 'Bearer ' + SUPABASE_ANON_KEY
    };
  }

  async function callFunction(name, body, method) {
    method = method || 'POST';
    var opts = {
      method: method,
      headers: authHeaders()
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    var res = await fetch(FUNCTIONS_URL + '/' + name, opts);
    return await res.json();
  }

  async function callFunctionGet(name, params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    var res = await fetch(FUNCTIONS_URL + '/' + name + qs, {
      method: 'GET',
      headers: authHeaders()
    });
    return await res.json();
  }

  // ── AUTH ──
  var Auth = {

    // Sign up
    register: async function (email, password, fullName, role, extra) {
      return callFunction('auth-register', {
        email: email,
        password: password,
        full_name: fullName,
        role: role,
        ...extra
      });
    },

    // Sign in
    login: async function (email, password) {
      var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await res.json();
      if (data.access_token) {
        localStorage.setItem('sb-orghkbbohnabcietidiv-auth-token', JSON.stringify(data));
        localStorage.setItem('us_user', JSON.stringify(data.user));
      }
      return data;
    },

    // Sign out
    logout: async function () {
      var token = getToken();
      if (token) {
        await fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
        });
      }
      localStorage.removeItem('sb-orghkbbohnabcietidiv-auth-token');
      localStorage.removeItem('us_user');
      window.location.href = '/signin.html';
    },

    // Get current user from localStorage
    getUser: function () {
      try {
        var raw = localStorage.getItem('us_user');
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },

    // Check if logged in
    isLoggedIn: function () {
      return !!getToken();
    },

    // Require auth — redirect to signin if not logged in
    requireAuth: function () {
      if (!getToken()) {
        window.location.href = '/signin.html?redirect=' + encodeURIComponent(window.location.pathname);
        return false;
      }
      return true;
    },

    // Password reset
    resetPassword: async function (email) {
      var res = await fetch(SUPABASE_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: email })
      });
      return await res.json();
    }
  };

  // ── PLATFORM SETTINGS (feature flags) ──
  var Settings = {
    _cache: null,

    get: async function () {
      if (Settings._cache) return Settings._cache;
      var data = await callFunctionGet('get-platform-settings');
      Settings._cache = data;
      // Apply flags to the page
      Settings._apply(data);
      return data;
    },

    _apply: function (flags) {
      // Hide freelance elements if disabled
      if (!flags.freelance_enabled) {
        document.querySelectorAll('[data-feature="freelance"]').forEach(function (el) {
          el.style.display = 'none';
        });
      }
      // Show maintenance mode
      if (flags.maintenance_mode) {
        var user = Auth.getUser();
        if (!user || !user.user_metadata?.roles?.includes('admin')) {
          document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;background:#f1f5f9"><div><h1 style="font-size:2rem;color:#0f172a">🔧 Maintenance</h1><p style="color:#64748b">UniSkilled is down for scheduled maintenance. We\'ll be back shortly.</p></div></div>';
        }
      }
    }
  };

  // ── TUTORS ──
  var Tutors = {
    search: async function (filters) {
      // Add user skills for AI matching
      var profile = await Profile.get();
      var skills = profile?.student_profile?.skills || [];
      return callFunctionGet('search-tutors', {
        ...filters,
        student_skills: skills.join(',')
      });
    },

    getProfile: async function (tutorId) {
      var res = await fetch(SUPABASE_URL + '/rest/v1/tutor_listing?id=eq.' + tutorId, {
        headers: authHeaders()
      });
      var data = await res.json();
      return data[0] || null;
    },

    getAvailability: async function (tutorId) {
      var res = await fetch(SUPABASE_URL + '/rest/v1/tutor_availability?tutor_id=eq.' + tutorId, {
        headers: authHeaders()
      });
      return await res.json();
    },

    save: async function (tutorId) {
      return callFunction('user-profile', { tutor_id: tutorId }, 'POST');
    }
  };

  // ── SESSIONS ──
  var Sessions = {
    list: async function (role, status) {
      return callFunctionGet('manage-sessions', { role: role, status: status });
    },

    book: async function (tutorProfileId, subject, scheduledAt, durationMinutes, videoLink) {
      // First create the session record
      var session = await callFunction('manage-sessions', {
        tutor_profile_id: tutorProfileId,
        subject: subject,
        scheduled_at_utc: scheduledAt,
        duration_minutes: durationMinutes || 60,
        video_link: videoLink
      });
      if (session.error) return session;

      // Then create Stripe checkout
      var checkout = await callFunction('stripe-checkout', {
        type: 'session',
        session_id: session.data.id
      });
      if (checkout.checkout_url) {
        window.location.href = checkout.checkout_url;
      }
      return checkout;
    },

    cancel: async function (sessionId, cancelledBy, reason) {
      var res = await fetch(FUNCTIONS_URL + '/manage-sessions/' + sessionId + '/cancel', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ cancelled_by: cancelledBy, reason: reason })
      });
      return await res.json();
    },

    complete: async function (sessionId) {
      var res = await fetch(FUNCTIONS_URL + '/manage-sessions/' + sessionId + '/complete', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({})
      });
      return await res.json();
    }
  };

  // ── JOBS ──
  var Jobs = {
    list: async function (filters) {
      var profile = await Profile.get();
      var skills = profile?.student_profile?.skills || [];
      return callFunctionGet('manage-jobs', {
        ...filters,
        user_skills: skills.join(',')
      });
    },

    create: async function (jobData) {
      return callFunction('manage-jobs', jobData);
    },

    apply: async function (jobId, coverLetter) {
      var res = await fetch(SUPABASE_URL + '/rest/v1/job_applications', {
        method: 'POST',
        headers: { ...authHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ job_id: jobId, cover_letter: coverLetter })
      });
      return await res.json();
    }
  };

  // ── ORDERS ──
  var Orders = {
    list: async function (role, status) {
      return callFunctionGet('manage-orders', { role: role, status: status });
    },

    create: async function (orderData) {
      var order = await callFunction('manage-orders', orderData);
      if (order.error) return order;
      // Redirect to Stripe checkout
      var checkout = await callFunction('stripe-checkout', {
        type: 'order',
        order_id: order.data.id
      });
      if (checkout.checkout_url) window.location.href = checkout.checkout_url;
      return checkout;
    },

    deliver: async function (orderId, notes) {
      var res = await fetch(FUNCTIONS_URL + '/manage-orders/' + orderId + '/deliver', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ notes: notes })
      });
      return await res.json();
    },

    approve: async function (orderId) {
      var res = await fetch(FUNCTIONS_URL + '/manage-orders/' + orderId + '/approve', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({})
      });
      return await res.json();
    }
  };

  // ── MESSAGES ──
  var Messages = {
    listConversations: async function (filter) {
      return callFunctionGet('manage-messages', { filter: filter });
    },

    getMessages: async function (conversationId, limit) {
      return callFunctionGet('manage-messages', {
        conversation_id: conversationId,
        limit: limit || 50
      });
    },

    send: async function (conversationId, recipientId, content, attachmentUrl, attachmentType) {
      return callFunction('manage-messages', {
        conversation_id: conversationId,
        recipient_id: recipientId,
        content: content,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType
      });
    },

    delete: async function (messageId) {
      return callFunction('manage-messages', { message_id: messageId }, 'DELETE');
    },

    // Realtime subscription for new messages
    subscribe: function (conversationId, onMessage) {
      // Uses Supabase Realtime via WebSocket
      var wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
      var ws = new WebSocket(wsUrl);

      ws.onopen = function () {
        ws.send(JSON.stringify({
          topic: 'realtime:public:messages:conversation_id=eq.' + conversationId,
          event: 'phx_join',
          payload: {},
          ref: '1'
        }));
      };

      ws.onmessage = function (e) {
        var msg = JSON.parse(e.data);
        if (msg.event === 'INSERT' && msg.payload?.record) {
          onMessage(msg.payload.record);
        }
      };

      return function () { ws.close(); }; // return unsubscribe function
    }
  };

  // ── PROFILE ──
  var Profile = {
    _cache: null,

    get: async function (userId) {
      if (!userId && Profile._cache) return Profile._cache;
      var params = userId ? '?action=profile&user_id=' + userId : '?action=profile';
      var res = await fetch(FUNCTIONS_URL + '/user-profile' + params, {
        headers: authHeaders()
      });
      var data = await res.json();
      if (!userId) Profile._cache = data.data;
      return data.data;
    },

    update: async function (updates) {
      var res = await fetch(FUNCTIONS_URL + '/user-profile?action=profile', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(updates)
      });
      Profile._cache = null; // clear cache
      return await res.json();
    },

    uploadAvatar: async function (file) {
      var user = Auth.getUser();
      if (!user) return { error: 'Not logged in' };
      var ext = file.name.split('.').pop();
      var path = user.id + '/avatar.' + ext;
      var res = await fetch(SUPABASE_URL + '/storage/v1/object/avatars/' + path, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + getToken(),
          'Content-Type': file.type
        },
        body: file
      });
      var data = await res.json();
      if (data.Key) {
        var url = SUPABASE_URL + '/storage/v1/object/public/avatars/' + path;
        await Profile.update({ user: { avatar_url: url } });
        return { url: url };
      }
      return data;
    },

    uploadCV: async function (file) {
      var user = Auth.getUser();
      if (!user) return { error: 'Not logged in' };
      var path = user.id + '/cv.pdf';
      var res = await fetch(SUPABASE_URL + '/storage/v1/object/cvs/' + path, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + getToken(),
          'Content-Type': file.type
        },
        body: file
      });
      return await res.json();
    }
  };

  // ── NOTIFICATIONS ──
  var Notifications = {
    list: async function () {
      var res = await fetch(FUNCTIONS_URL + '/user-profile?action=notifications', {
        headers: authHeaders()
      });
      return await res.json();
    },

    markRead: async function () {
      var res = await fetch(FUNCTIONS_URL + '/user-profile?action=notifications_read', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({})
      });
      return await res.json();
    },

    // Realtime badge updater
    subscribe: function (onUpdate) {
      var user = Auth.getUser();
      if (!user) return function () {};
      var wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
      var ws = new WebSocket(wsUrl);
      ws.onopen = function () {
        ws.send(JSON.stringify({
          topic: 'realtime:public:notifications:user_id=eq.' + user.id,
          event: 'phx_join',
          payload: {},
          ref: '1'
        }));
      };
      ws.onmessage = function (e) {
        var msg = JSON.parse(e.data);
        if (msg.event === 'INSERT') onUpdate(msg.payload?.record);
      };
      return function () { ws.close(); };
    }
  };

  // ── REVIEWS ──
  var Reviews = {
    create: async function (revieweeId, sessionId, orderId, rating, comment) {
      var res = await fetch(FUNCTIONS_URL + '/user-profile?action=review', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          reviewee_id: revieweeId,
          session_id: sessionId,
          order_id: orderId,
          rating: rating,
          comment: comment
        })
      });
      return await res.json();
    },

    list: async function (targetId) {
      var res = await fetch(SUPABASE_URL + '/rest/v1/reviews?reviewee_id=eq.' + targetId + '&hidden_by_admin=eq.false&order=created_at.desc', {
        headers: authHeaders()
      });
      return await res.json();
    }
  };

  // ── GDPR ──
  var GDPR = {
    exportData: async function () {
      var res = await fetch(FUNCTIONS_URL + '/user-profile?action=export', {
        headers: authHeaders()
      });
      var data = await res.json();
      // Download as JSON file
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'uniskilled-data-export.json';
      a.click();
      return data;
    },

    deleteAccount: async function () {
      if (!confirm('Are you sure? This will permanently delete your account and all your data. This cannot be undone.')) return;
      var res = await fetch(FUNCTIONS_URL + '/user-profile?action=delete_account', {
        method: 'DELETE',
        headers: authHeaders()
      });
      var data = await res.json();
      if (data.success) {
        localStorage.clear();
        window.location.href = '/Home.html';
      }
      return data;
    }
  };

  // ── PAYMENTS ──
  var Payments = {
    history: async function () {
      return callFunction('stripe-payments', { action: 'history' });
    },

    connectStripe: async function () {
      var result = await callFunction('stripe-payments', { action: 'connect_onboarding' });
      if (result.onboarding_url) window.location.href = result.onboarding_url;
      return result;
    }
  };

  // ── CREDENTIALS ──
  var Credentials = {
    get: async function (slug) {
      var res = await fetch(SUPABASE_URL + '/rest/v1/credentials?public_slug=eq.' + slug + '&is_active=eq.true', {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }
      });
      var data = await res.json();
      return data[0] || null;
    },

    myCredentials: async function () {
      var user = Auth.getUser();
      if (!user) return [];
      var res = await fetch(SUPABASE_URL + '/rest/v1/credentials?user_id=eq.' + user.id + '&is_active=eq.true', {
        headers: authHeaders()
      });
      return await res.json();
    }
  };

  // ── ADMIN ──
  var Admin = {
    overview: async function () {
      var res = await fetch(FUNCTIONS_URL + '/admin-actions?action=overview', { headers: authHeaders() });
      return await res.json();
    },

    users: async function (filters) {
      var qs = new URLSearchParams({ action: 'users', ...filters }).toString();
      var res = await fetch(FUNCTIONS_URL + '/admin-actions?' + qs, { headers: authHeaders() });
      return await res.json();
    },

    action: async function (targetId, adminAction, reason, details) {
      return callFunction('admin-actions', {
        target_id: targetId,
        admin_action: adminAction,
        reason: reason,
        details: details
      });
    },

    updateSetting: async function (key, value) {
      return Admin.action(null, 'update_setting', null, { key: key, value: String(value) });
    }
  };

  // ── AUTO-INIT ──
  // Load platform settings on every page
  document.addEventListener('DOMContentLoaded', function () {
    Settings.get().catch(function (e) { console.warn('Settings load failed:', e); });

    // Update notification badge if logged in
    if (Auth.isLoggedIn()) {
      Notifications.list().then(function (data) {
        var count = data.unread_count || 0;
        document.querySelectorAll('[data-notif-badge]').forEach(function (el) {
          el.textContent = count > 0 ? count : '';
          el.style.display = count > 0 ? 'flex' : 'none';
        });
      }).catch(function () {});
    }

    // Handle payment success/cancel URL params
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      var msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;top:1rem;right:1rem;background:#059669;color:#fff;padding:.75rem 1.25rem;border-radius:12px;font-family:sans-serif;font-size:.9rem;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.15)';
      msg.textContent = '✓ Payment successful — booking confirmed!';
      document.body.appendChild(msg);
      setTimeout(function () { msg.remove(); }, 5000);
    }
  });

  // ── EXPOSE GLOBAL API ──
  window.UniSkilled = {
    Auth: Auth,
    Settings: Settings,
    Tutors: Tutors,
    Sessions: Sessions,
    Jobs: Jobs,
    Orders: Orders,
    Messages: Messages,
    Profile: Profile,
    Notifications: Notifications,
    Reviews: Reviews,
    GDPR: GDPR,
    Payments: Payments,
    Credentials: Credentials,
    Admin: Admin,
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY
  };

  console.log('✦ UniSkilled API loaded');

})();
