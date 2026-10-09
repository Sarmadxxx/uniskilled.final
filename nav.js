// Shared simple top nav for utility pages (calendar.html, complete-payment.html, etc.)
// Usage: <div id="nav-root"></div> ... <script src="nav.js"></script> <script>renderSimpleNav('student-dashboard.html');</script>
// backHref: where the "Back" link should point. If omitted, defaults to '#' and hides the link.
function renderSimpleNav(backHref, backLabel) {
  const root = document.getElementById('nav-root');
  if (!root) {
    console.error('renderSimpleNav: no #nav-root element found on this page.');
    return;
  }
  // Lay the logo and back link out in one row (the wrapper sits inside each page's <nav>)
  root.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:1rem;width:100%;min-width:0;';
  const label = backLabel || '← Back to Dashboard';
  const backLink = backHref ? `<a id="navBackLink" href="${backHref}" class="nav-link" style="white-space:nowrap;">${label}</a>` : '';

  root.innerHTML = `
    <a href="index.html" class="nav-logo">
      <img src="uniskilled-logo-sm.png" alt="UniSkilled" width="127" height="44" style="height:44px;width:auto;display:block;">
    </a>
    ${backLink}
  `;
}

// Optional helper: update the back link target after render (e.g. once role is known).
function setNavBackLink(href, label) {
  const link = document.getElementById('navBackLink');
  if (!link) return;
  link.href = href;
  if (label) link.textContent = label;
}
