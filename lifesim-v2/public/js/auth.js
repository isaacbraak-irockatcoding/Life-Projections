/* ══════════════════════════════════════════════
   auth.js — Login / register tab
══════════════════════════════════════════════ */

let _authMode = 'login'; // 'login' | 'register' | 'recover'

function renderAuthTab() {
  const screen = document.getElementById('screen-auth');

  if (_authMode === 'recover') {
    screen.innerHTML = `
      <div class="container">
        <div style="text-align:center;padding:40px 0 24px;">
          <img src="/images/logo.jpeg" alt="LifeSim Finance"
            style="width:220px;max-width:80%;object-fit:contain;margin-bottom:12px;border-radius:12px;"/>
          <p style="color:var(--muted2);font-size:13px;">Reset your password</p>
        </div>
        <div class="card fade-up">
          <div id="auth-error" class="auth-error" style="display:none;"></div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Username</label>
            <input type="text" id="auth-username" placeholder="your_username" autocomplete="username"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Recovery Code</label>
            <input type="text" id="auth-recovery-code" placeholder="LIFESIM-XXXX-XXXX" style="font-family:monospace;letter-spacing:.05em;"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">New Password</label>
            <input type="password" id="auth-new-password" placeholder="••••••••"
              onkeydown="if(event.key==='Enter')submitRecover()"/>
          </div>
          <button class="btn btn-primary" onclick="submitRecover()" id="auth-submit-btn">Reset Password</button>
          <p style="text-align:center;margin-top:12px;">
            <a href="#" onclick="setAuthMode('login');return false;"
              style="font-size:12px;color:var(--teal);text-decoration:none;">← Back to Sign In</a>
          </p>
        </div>
      </div>`;
    return;
  }

  screen.innerHTML = `
    <div class="container">
      <div style="text-align:center;padding:40px 0 24px;">
        <img src="/images/logo.jpeg" alt="LifeSim Finance"
          style="width:220px;max-width:80%;object-fit:contain;margin-bottom:12px;border-radius:12px;"/>
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

        ${_authMode === 'login' ? `
        <p style="text-align:center;margin-top:12px;">
          <a href="#" onclick="setAuthMode('recover');return false;"
            style="font-size:12px;color:var(--muted2);text-decoration:none;">Forgot password?</a>
        </p>` : ''}
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
      errEl.style.display = 'none';
      State.setUser(data.user, data.token);
      await bootAfterAuth();
    } else {
      data = await api.post('/api/auth/register', { username, password, avatar: _selectedAvatar });
      errEl.style.display = 'none';
      State.setUser(data.user, data.token);
      // Show recovery code before booting — it's shown exactly once
      showRecoveryCodeModal(data.recovery_code);
    }
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.textContent = _authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}

function showRecoveryCodeModal(code) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--surf);border-radius:16px;padding:28px 24px;max-width:380px;width:100%;text-align:center;">
      <div style="font-size:32px;margin-bottom:12px;">🔑</div>
      <h3 style="margin-bottom:8px;">Save Your Recovery Code</h3>
      <p style="font-size:13px;color:var(--muted2);margin-bottom:20px;line-height:1.5;">
        This code is shown <strong>once only</strong>. If you forget your password, you'll need it to regain access.
      </p>
      <div style="background:var(--bg2);border-radius:10px;padding:16px;margin-bottom:20px;">
        <div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:.1em;color:var(--accent);">${code}</div>
      </div>
      <p style="font-size:11px;color:var(--coral);margin-bottom:20px;">
        ⚠️ Screenshot this or write it down — it cannot be recovered if lost.
      </p>
      <button class="btn btn-primary" style="width:100%;" onclick="this.closest('div[style]').remove();bootAfterAuth();">
        I've Saved It →
      </button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitRecover() {
  const username    = document.getElementById('auth-username')?.value.trim();
  const code        = document.getElementById('auth-recovery-code')?.value.trim();
  const newPassword = document.getElementById('auth-new-password')?.value;
  const btn         = document.getElementById('auth-submit-btn');

  if (!username || !code || !newPassword) {
    showAuthError('Please fill in all fields');
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';

  try {
    await api.post('/api/auth/recover', { username, recovery_code: code, new_password: newPassword });
    setAuthMode('login');
    showToast('Password reset — please sign in');
  } catch (err) {
    showAuthError(err.message);
    btn.disabled = false;
    btn.textContent = 'Reset Password';
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
