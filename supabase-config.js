// UniSkilled — the ONE place the website's database address and public key live.
// Every page loads this file before its own scripts and reads USK_CONFIG.url / USK_CONFIG.anonKey.
//
// The anon key is public by design: it only lets visitors do what the database's access rules
// (RLS) allow. To rotate it, or switch to a Supabase "publishable" key, change it here only.
window.USK_CONFIG = Object.freeze({
  url: 'https://orghkbbohnabcietidiv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2hrYmJvaG5hYmNpZXRpZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzcwMTMsImV4cCI6MjA5MjcxMzAxM30.3bOnZuga8a4xY4mbKdgLnw6EwAV5UuQDz26JI_vM-u8',
});

// "Keep me signed in" unticked: forget the login on this device once the browser has been closed.
// The usk_alive cookie has no expiry date, so the browser deletes it on close; if it's gone, the
// stored login is removed before any page uses it. Runs before the Supabase client starts.
(function () {
  try {
    sessionStorage.removeItem('uniskilled_session_only');   // flag from the old version
    if (localStorage.getItem('usk_session_only') === '1' && !/(?:^|;\s*)usk_alive=1/.test(document.cookie)) {
      localStorage.removeItem('sb-orghkbbohnabcietidiv-auth-token');
      localStorage.removeItem('usk_session_only');
    }
  } catch (e) { /* storage blocked: nothing to forget */ }
})();
