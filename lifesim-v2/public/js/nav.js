/* ══════════════════════════════════════════════
   nav.js — Boot sequence and tab router
   Load order: data → api → state → engine →
   projections → montecarlo → events → assets →
   debts → share → friends → auth → nav (last)
══════════════════════════════════════════════ */

const TABS = ['proj', 'share', 'friends', 'explore', 'auth'];

// ── Guest signup prompt ────────────────────────────────────────────────────────
let _guestPromptShown = false;

function _showGuestSignupModal() {
  const existing = document.getElementById('guest-signup-modal');
  if (existing) return;
  const modal = document.createElement('div');
  modal.id = 'guest-signup-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:8000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);';
  modal.innerHTML = `
    <div style="background:var(--surf);border-radius:20px 20px 0 0;padding:28px 24px 32px;width:100%;max-width:520px;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px;">✨</div>
      <h3 style="margin:0 0 8px;">Create a Free Profile</h3>
      <p style="font-size:14px;color:var(--muted2);line-height:1.55;margin-bottom:24px;">
        Create a free profile to save scenarios<br>and connect with friends.
      </p>
      <button class="btn btn-primary" style="width:100%;margin-bottom:10px;"
        onclick="document.getElementById('guest-signup-modal').remove();handleLogout();setAuthMode('register');">
        Create Profile
      </button>
      <button class="btn" style="width:100%;background:transparent;border:1px solid var(--border);color:var(--muted2);"
        onclick="document.getElementById('guest-signup-modal').remove();handleLogout();setAuthMode('login');">
        Sign In
      </button>
      <p style="margin-top:14px;">
        <a href="#" onclick="document.getElementById('guest-signup-modal').remove();return false;"
          style="font-size:12px;color:var(--muted);text-decoration:none;">Continue as Guest</a>
      </p>
    </div>`;
  document.body.appendChild(modal);
}

function _onFirstGuestInput(e) {
  if (_guestPromptShown) return;
  const user = State.getUser();
  if (!user || !user.username.startsWith('guest_')) return;
  if (!e.target.closest?.('#screen-proj')) return;
  _guestPromptShown = true;
  _showGuestSignupModal();
}
document.addEventListener('change', _onFirstGuestInput, true);
document.addEventListener('input',  _onFirstGuestInput, true);

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
  document.getElementById('app-footer').style.display = '';

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
  const storedToken = localStorage.getItem('ls_token');
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

  // 3. Auto-start as guest (show auth on error)
  try {
    await enterGuestMode();
  } catch {
    document.getElementById('screen-auth').style.display = '';
    renderAuthTab();
  }
})();
