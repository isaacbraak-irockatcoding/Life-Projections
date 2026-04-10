/* ══════════════════════════════════════════════
   nav.js — Boot sequence and tab router
   Load order: data → api → state → engine →
   projections → montecarlo → events → assets →
   debts → share → friends → auth → nav (last)
══════════════════════════════════════════════ */

const TABS = ['proj', 'share', 'friends', 'explore', 'auth'];

function switchTab(tab) {
  TABS.forEach(t => {
    const screen  = document.getElementById(`screen-${t}`);
    const navItem = document.getElementById(`nav-${t}`);
    if (screen)  screen.style.display  = t === tab ? '' : 'none';
    if (navItem) navItem.classList.toggle('active', t === tab);
  });

  // Render the selected tab
  switch (tab) {
    case 'proj':    renderProjTab();    break;
    case 'share':   renderShareTab();   break;
    case 'friends': renderFriendsTab();  break;
    case 'explore': renderExploreTab();  break;
    case 'auth':    renderAuthTab();     break;
  }
}

async function bootAfterAuth() {
  const list = await api.get('/api/scenarios');
  State.setScenarioList(list);

  if (list.length) {
    await State.loadScenario(list[0].id);
  } else {
    // Auto-create a starter scenario for new users
    const s = await api.createScenario({ name: 'My Scenario' });
    State.setActiveScenario(s);
    State.setScenarioList([s]);
  }

  showApp();
}

function showApp() {
  document.getElementById('screen-auth').style.display = 'none';
  document.getElementById('main-nav').style.display = 'flex';
  document.getElementById('app-header').style.display = 'flex';

  // Guest banner
  const existing = document.getElementById('guest-banner');
  if (existing) existing.remove();
  const user = State.getUser();
  if (user && user.username.startsWith('guest_')) {
    const banner = document.createElement('div');
    banner.id = 'guest-banner';
    banner.style.cssText = 'background:rgba(0,212,170,.07);border-bottom:1px solid rgba(0,212,170,.2);padding:9px 16px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--muted2);';
    banner.innerHTML = `<span>You\'re in guest mode — <a href="#" onclick="handleLogout();setAuthMode(\'register\');return false;" style="color:var(--teal);text-decoration:none;font-weight:600;">Create an account</a> to save your progress</span>
      <span onclick="this.parentElement.remove()" style="cursor:pointer;color:var(--muted);font-size:16px;line-height:1;">✕</span>`;
    document.getElementById('app-header').insertAdjacentElement('afterend', banner);
  }

  switchTab('proj');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  // 1. Check ?share=<token> → render public view, skip auth
  const shareToken = new URLSearchParams(location.search).get('share');
  if (shareToken) {
    renderPublicView(shareToken);
    return;
  }

  // 2. Try silent re-auth via sessionStorage token
  const storedToken = sessionStorage.getItem('ls_token');
  if (storedToken) {
    try {
      api.setToken(storedToken);
      const user = await api.get('/api/auth/me');
      State.setUser(user, storedToken);
      await bootAfterAuth();
      return;
    } catch {
      api.clearToken();
    }
  }

  // 3. Show auth tab
  document.getElementById('screen-auth').style.display = '';
  renderAuthTab();
})();
