/* ══════════════════════════════════════════════
   nav.js — Boot sequence and tab router
   Load order: data → api → state → engine →
   projections → montecarlo → events → assets →
   debts → share → friends → auth → nav (last)
══════════════════════════════════════════════ */

const TABS = ['proj', 'mc', 'events', 'assets', 'debts', 'share', 'friends', 'auth'];

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
    case 'mc':      renderMcTab();      break;
    case 'events':  renderEventsTab();  break;
    case 'assets':  renderAssetsTab();  break;
    case 'debts':   renderDebtsTab();   break;
    case 'share':   renderShareTab();   break;
    case 'friends': renderFriendsTab(); break;
    case 'auth':    renderAuthTab();    break;
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
