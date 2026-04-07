/* ══════════════════════════════════════════════
   auth.js — Login / register tab
══════════════════════════════════════════════ */

let _authMode = 'login'; // 'login' | 'register'

function renderAuthTab() {
  const screen = document.getElementById('screen-auth');
  screen.innerHTML = `
    <div class="container">
      <div style="text-align:center;padding:40px 0 24px;">
        <div style="font-size:48px;margin-bottom:10px;">📈</div>
        <h1 style="margin-bottom:6px;">LifeSim</h1>
        <p style="color:var(--muted2);font-size:13px;">Model your financial future</p>
      </div>

      <div class="card fade-up">
        <div class="auth-tabs" style="display:flex;gap:0;margin-bottom:20px;background:var(--surf);border-radius:10px;padding:3px;">
          <button id="auth-tab-login" class="auth-tab-btn ${_authMode === 'login' ? 'active' : ''}"
            onclick="setAuthMode('login')">Sign In</button>
          <button id="auth-tab-reg" class="auth-tab-btn ${_authMode === 'register' ? 'active' : ''}"
            onclick="setAuthMode('register')">Create Account</button>
          <button class="auth-tab-btn" onclick="enterGuestMode()" style="color:var(--teal);white-space:nowrap;">Try as Guest</button>
        </div>

        <div id="auth-error" class="auth-error" style="display:none;"></div>

        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Username</label>
          <input type="text" id="auth-username" placeholder="your_username" autocomplete="username"/>
        </div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Password</label>
          <input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password"
            onkeydown="if(event.key==='Enter')submitAuth()"/>
        </div>

        <div id="auth-avatar-wrap" style="display:${_authMode === 'register' ? 'block' : 'none'};">
          <label class="micro" style="display:block;margin-bottom:8px;">Choose Avatar</label>
          <div id="auth-avatar-grid" class="avatar-grid"></div>
        </div>

        <button class="btn btn-primary" onclick="submitAuth()" id="auth-submit-btn">
          ${_authMode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </div>

      <p style="text-align:center;font-size:11px;color:var(--muted);margin-top:14px;">
        Your data stays on your device unless you choose to share.
      </p>
    </div>`;

  if (_authMode === 'register') renderAvatarGrid();
}

let _selectedAvatar = '🦊';

function renderAvatarGrid() {
  const grid = document.getElementById('auth-avatar-grid');
  if (!grid) return;
  grid.innerHTML = AVATARS.map(a =>
    `<div class="avatar-item${a === _selectedAvatar ? ' sel' : ''}" onclick="selectAvatar('${a}')">${a}</div>`
  ).join('');
}

function selectAvatar(a) {
  _selectedAvatar = a;
  document.querySelectorAll('#auth-avatar-grid .avatar-item').forEach(el => {
    el.classList.toggle('sel', el.textContent === a);
  });
}

function setAuthMode(mode) {
  _authMode = mode;
  renderAuthTab();
}

async function submitAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');

  if (!username || !password) {
    showAuthError('Please enter username and password');
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';

  try {
    let data;
    if (_authMode === 'login') {
      data = await api.post('/api/auth/login', { username, password });
    } else {
      data = await api.post('/api/auth/register', { username, password, avatar: _selectedAvatar });
    }
    errEl.style.display = 'none';
    State.setUser(data.user, data.token);
    await bootAfterAuth();
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.textContent = _authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

async function enterGuestMode() {
  try {
    const data = await api.post('/api/auth/guest', {});
    State.setUser(data.user, data.token);
  } catch (err) {
    showAuthError('Could not start guest session. Please try again.');
    return;
  }
  await bootAfterAuth();
}

function handleLogout() {
  State.logout();
  showToast('Signed out');
  document.getElementById('main-nav').style.display = 'none';
  setAuthMode('login');
  switchTab('auth');
}
