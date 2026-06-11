# UniSkilled — Frontend Integration Guide
How to connect every HTML file to the live backend.

---

## Step 1 — Add the API script to every HTML page

Paste this line before `</body>` on **every** HTML file:

```html
<script src="uniskilled-api.js"></script>
```

That's it. The script automatically:
- Loads platform feature flags on every page
- Shows/hides freelance features based on `freelance_enabled` flag
- Shows maintenance mode if enabled
- Updates notification badges if logged in
- Shows payment success message after Stripe redirect

---

## Step 2 — Wire the Sign In page (signin.html)

Replace the sign-in button handler with:

```javascript
async function handleSignIn(email, password) {
  var result = await UniSkilled.Auth.login(email, password);
  if (result.access_token) {
    var roles = result.user?.user_metadata?.roles || ['student'];
    // Redirect based on role
    if (roles.includes('admin')) window.location.href = '/admin-dashboard.html';
    else if (roles.includes('tutor')) window.location.href = '/tutor-dashboard.html';
    else if (roles.includes('business')) window.location.href = '/business-dashboard.html';
    else window.location.href = '/student-dashboard.html';
  } else {
    showError(result.error_description || 'Invalid email or password');
  }
}
```

---

## Step 3 — Wire the Onboarding page (onboarding.html)

Replace the registration submit handler with:

```javascript
async function handleRegister(formData) {
  var result = await UniSkilled.Auth.register(
    formData.email,
    formData.password,
    formData.full_name,
    formData.role, // 'student' | 'tutor' | 'business'
    {
      university: formData.university,
      company_name: formData.company_name
    }
  );
  if (result.success) {
    showSuccess('Check your email to verify your account.');
  } else {
    showError(result.error);
  }
}
```

---

## Step 4 — Wire the Tutoring page (tutoring.html)

Replace the hardcoded tutor cards with:

```javascript
async function loadTutors(filters) {
  var result = await UniSkilled.Tutors.search({
    subject: filters.subject,
    format: filters.format,
    max_rate: filters.maxRate,
    min_rating: filters.minRating,
    language: filters.language
  });
  renderTutorCards(result.data); // your existing render function
}
```

---

## Step 5 — Wire the Tutor Profile booking (tutor-profile.html)

Replace the Book Session button handler:

```javascript
async function handleBookSession(tutorProfileId, subject, date, time, duration) {
  var scheduledAt = new Date(date + 'T' + time + ':00Z').toISOString();
  // This creates the session AND redirects to Stripe checkout automatically
  await UniSkilled.Sessions.book(tutorProfileId, subject, scheduledAt, duration);
}
```

---

## Step 6 — Wire the Student Dashboard (student-dashboard.html)

Replace the hardcoded data objects:

```javascript
// Load sessions
async function loadSessions() {
  var result = await UniSkilled.Sessions.list('student');
  renderSessions(result.data); // your existing render function
}

// Load profile
async function loadProfile() {
  var profile = await UniSkilled.Profile.get();
  renderProfile(profile); // your existing render function
}

// Load notifications
async function loadNotifications() {
  var result = await UniSkilled.Notifications.list();
  renderNotifications(result.data);
}

// Subscribe to real-time notifications
UniSkilled.Notifications.subscribe(function(notification) {
  // Called instantly when a new notification arrives
  showNotificationToast(notification.title, notification.body);
  loadNotifications(); // refresh the list
});
```

---

## Step 7 — Wire the Tutor Dashboard (tutor-dashboard.html)

```javascript
// Load tutor sessions
async function loadTutorSessions() {
  var result = await UniSkilled.Sessions.list('tutor');
  renderSessions(result.data);
}

// Mark session complete (releases escrow)
async function completeSession(sessionId) {
  var result = await UniSkilled.Sessions.complete(sessionId);
  if (result.success) showToast('✅', 'Session completed', 'Payment will be processed shortly');
}
```

---

## Step 8 — Wire the Business Dashboard (business-dashboard.html)

```javascript
// Replace bizData object with real API calls
async function loadBusinessData() {
  // Active orders
  var orders = await UniSkilled.Orders.list('business', 'active');
  updateKPI('activeOrders', orders.data?.length || 0);

  // Job posts
  var jobs = await UniSkilled.Jobs.list();
  updateKPI('liveJobs', jobs.data?.filter(j => j.status === 'live').length || 0);

  // Profile
  var profile = await UniSkilled.Profile.get();
  updateBusinessProfile(profile.business_profile);
}

// Approve a delivery (releases escrow)
async function approveDelivery(orderId) {
  var result = await UniSkilled.Orders.approve(orderId);
  if (result.success) showToast('✅', 'Approved', 'Payment released to student');
}
```

---

## Step 9 — Wire the Opportunities page (opportunities.html)

```javascript
// Load jobs with AI matching
async function loadJobs(filters) {
  var result = await UniSkilled.Jobs.list(filters);
  renderJobCards(result.data); // each card has result.data[n].match_score
}

// Apply for a job
async function applyForJob(jobId, coverLetter) {
  var result = await UniSkilled.Jobs.apply(jobId, coverLetter);
  if (!result.error) showToast('⚡', 'Applied!', 'Your application has been sent');
}
```

---

## Step 10 — Wire the Messages page (messages.html)

```javascript
var currentConvId = null;
var unsubscribeRealtime = null;

// Load conversations
async function loadConversations() {
  var result = await UniSkilled.Messages.listConversations();
  renderConversations(result.data);
}

// Open a conversation
async function openConversation(conversationId) {
  currentConvId = conversationId;
  var result = await UniSkilled.Messages.getMessages(conversationId);
  renderMessages(result.data);

  // Subscribe to real-time new messages
  if (unsubscribeRealtime) unsubscribeRealtime();
  unsubscribeRealtime = UniSkilled.Messages.subscribe(conversationId, function(msg) {
    appendMessage(msg); // add to the chat UI instantly
  });
}

// Send a message
async function sendMessage(content) {
  await UniSkilled.Messages.send(currentConvId, null, content);
  // The real-time subscription above will show it instantly
}
```

---

## Step 11 — Wire the Admin Dashboard (admin-dashboard.html)

```javascript
// Replace hardcoded stats with real data
async function loadAdminOverview() {
  var data = await UniSkilled.Admin.overview();
  // data contains: total_students, total_tutors, open_disputes, gmv_this_month, etc.
  updateDashboardStats(data.data);
}

// Suspend a user
async function suspendUser(userId, reason) {
  var result = await UniSkilled.Admin.action(userId, 'suspend_user', reason);
  if (result.success) showToast('🚫', 'Suspended', result.message);
}

// Toggle feature flag
async function toggleFlag(key, value) {
  var result = await UniSkilled.Admin.updateSetting(key, value);
  if (result.success) showToast('⚙️', 'Updated', key + ' = ' + value);
}

// Load users
async function loadUsers(filters) {
  var result = await UniSkilled.Admin.users(filters);
  renderUsersTable(result.data);
}
```

---

## Step 12 — Wire the Credential page (credential.html)

```javascript
// Load credential by public slug from URL
async function loadCredential() {
  var slug = window.location.pathname.split('/').pop();
  var credential = await UniSkilled.Credentials.get(slug);
  if (credential) {
    renderCredential(credential);
  } else {
    showError('Credential not found or has been revoked');
  }
}
```

---

## Step 13 — VIEWER_ROLE injection

For `tutor-profile.html` and `business-profile.html`, replace:

```javascript
var VIEWER_ROLE = new URLSearchParams(window.location.search).get('role') || 'owner';
```

With:

```javascript
var currentUser = UniSkilled.Auth.getUser();
// Get the profile owner ID from the URL or page data
var profileOwnerId = new URLSearchParams(window.location.search).get('id');
var VIEWER_ROLE = !currentUser ? 'guest'
  : currentUser.id === profileOwnerId ? 'owner'
  : 'student';
```

---

## Uploading to GitHub

After adding `uniskilled-api.js` to your repository, every page that includes the script tag will automatically connect to the live backend.

Files to upload to GitHub:
1. `uniskilled-api.js` — the API connector
2. All updated HTML files with `<script src="uniskilled-api.js"></script>` added

