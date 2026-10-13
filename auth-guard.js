/* UniSkilled — login check before protected actions (payments, cancellations, reschedules…).
 *
 * The browser keeps a copy of your login. If that login was ended on the server — for example by
 * signing out of the same account in another tab or browser — the copy still looks valid to the
 * page, but secured server functions reject it. usFreshToken() asks the server first; if the login
 * has ended it tries to renew it, and if that fails it sends the person to sign in and back to the
 * same page, instead of showing a confusing "Not signed in" error.
 *
 * Usage:  const token = await usFreshToken(_sb);   // never resolves while redirecting to sign-in
 */
(function () {
  var redirecting = false;

  function goToSignIn() {
    if (redirecting) return;
    redirecting = true;
    var msg = 'Your login has expired — please sign in again. You\'ll come straight back here.';
    try { if (window.showToast) window.showToast(msg, 'error'); else alert(msg); } catch (e) {}
    var back = location.pathname.split('/').pop() + location.search + location.hash;
    setTimeout(function () {
      location.href = 'signin.html?redirect=' + encodeURIComponent(back);
    }, 1600);
  }

  window.usFreshToken = async function (sb) {
    try {
      var cur = await sb.auth.getSession();
      var session = cur && cur.data ? cur.data.session : null;
      if (session) {
        // getUser() checks with the server that this login is still active.
        var u = await sb.auth.getUser();
        if (!u.error && u.data && u.data.user) {
          var again = await sb.auth.getSession();   // may have been refreshed meanwhile
          return (again.data.session || session).access_token;
        }
        var r = await sb.auth.refreshSession();
        if (!r.error && r.data && r.data.session) return r.data.session.access_token;
      }
    } catch (e) { /* fall through to sign-in */ }
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    goToSignIn();
    return new Promise(function () {});   // stop the caller here; the page is about to navigate
  };

  // Headers for a secured Edge Function call.
  window.usAuthHeaders = async function (sb) {
    var token = await window.usFreshToken(sb);
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
  };
})();
