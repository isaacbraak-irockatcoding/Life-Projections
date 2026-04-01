/* ══════════════════════════════════════════════
   share.js — Scenario sharing, comments, public view
══════════════════════════════════════════════ */

function renderShareTab() {
  const scenario = State.getScenario();
  const user     = State.getUser();
  const el       = document.getElementById('share-content');
  if (!el) return;

  if (!scenario) {
    el.innerHTML = `<div class="empty"><p>No scenario loaded.</p></div>`;
    return;
  }

  const { currentAssets, currentDebt } = collapseBalanceSheet(scenario);
  const result  = calculatePath(scenario);
  const finalWl = result.path[result.path.length - 1];

  el.innerHTML = `
    <div class="share-card fade-up">
      <div class="share-badge">🔗 Share your scenario</div>
      <h2>${scenario.name}</h2>
      <p style="color:var(--muted2);font-size:12px;margin:6px 0 20px;">
        ${scenario.job_id !== 'custom' ? (JOBS.find(j => j.id === scenario.job_id) || {}).name || '' : 'Custom salary'} ·
        Retiring at ${scenario.retire_age} ·
        Projected ${fmtM(finalWl)}
      </p>
      <button class="btn btn-primary" onclick="generateShareLink()">📋 Get Share Link</button>
      <div id="share-url-box" style="margin-top:14px;"></div>
    </div>

    <div class="card fade-up" style="margin-top:14px;">
      <h3>Export</h3>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" onclick="exportChart('projChart','lifesim-projection.png')">📥 Download Chart PNG</button>
      </div>
    </div>

    <div id="share-comments-section" style="display:none;" class="fade-up">
      <div class="card" style="margin-top:14px;">
        <h3>Comments</h3>
        <div id="share-comments-list"></div>
        <div class="field" style="margin-top:10px;">
          <input type="text" id="share-comment-input" placeholder="Leave a comment…" maxlength="500"
            onkeydown="if(event.key==='Enter')postShareComment()"/>
          <button class="btn btn-ghost btn-sm" onclick="postShareComment()" style="margin-top:6px;">Post</button>
        </div>
      </div>
    </div>

    <div class="disclaimer" style="margin-top:14px;">
      ⚠️ <span>Educational use only. Not financial advice. Projections assume constant returns and do not account for taxes, fees, or market volatility.</span>
    </div>

    <div style="text-align:center;margin-top:20px;">
      <button class="btn btn-ghost btn-sm" onclick="handleLogout()">Sign Out</button>
    </div>`;
}

let _currentShareToken = null;

async function generateShareLink() {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    const { token, url } = await api.getShareLink(scenario.id);
    _currentShareToken = token;
    const fullUrl = `${location.origin}/?share=${token}`;
    document.getElementById('share-url-box').innerHTML = `
      <div class="share-url-box">
        <code style="font-size:11px;word-break:break-all;color:var(--teal);">${fullUrl}</code>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="copyShareUrl('${fullUrl}')" style="margin-top:8px;width:100%;">Copy Link</button>
      </div>`;
    // Show comments section
    document.getElementById('share-comments-section').style.display = '';
    loadShareComments(token);
  } catch (err) { showToast(err.message, true); }
}

function copyShareUrl(url) {
  navigator.clipboard.writeText(url).then(
    () => showToast('Link copied!'),
    () => showToast('Copy failed — select the URL manually', true)
  );
}

async function loadShareComments(token) {
  try {
    const comments = await api.getComments(token);
    renderComments(comments);
  } catch {}
}

function renderComments(comments) {
  const el = document.getElementById('share-comments-list');
  if (!el) return;
  if (!comments.length) {
    el.innerHTML = `<p style="color:var(--muted2);font-size:12px;">No comments yet.</p>`;
    return;
  }
  el.innerHTML = comments.map(c =>
    `<div class="comment-item">
      <span class="comment-avatar">${c.avatar}</span>
      <div class="comment-body">
        <div class="comment-author">${c.username}</div>
        <div class="comment-text">${escapeHtml(c.body)}</div>
      </div>
    </div>`
  ).join('');
}

async function postShareComment() {
  if (!_currentShareToken) return;
  const input = document.getElementById('share-comment-input');
  const body  = input.value.trim();
  if (!body) return;
  try {
    await api.postComment(_currentShareToken, body);
    input.value = '';
    loadShareComments(_currentShareToken);
  } catch (err) { showToast(err.message, true); }
}

// Public view — rendered when ?share=<token> is in URL
async function renderPublicView(token) {
  document.body.innerHTML = `
    <div class="container" style="padding-top:40px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">📈</div>
      <p style="color:var(--muted2);">Loading scenario…</p>
    </div>`;

  try {
    const scenario = await api.getPublicScenario(token);
    const comments = await api.getComments(token);
    const result   = calculatePath(scenario);
    const ages     = getAges(scenario.start_age || 25);
    const finalWl  = result.path[result.path.length - 1];
    const color    = scenario.color || '#00d4aa';

    document.body.innerHTML = `
      <div class="container" style="padding-top:30px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <span style="font-size:22px;">${scenario.owner?.avatar || '🦊'}</span>
          <div>
            <div style="font-weight:600;">${scenario.owner?.username || 'Anonymous'}</div>
            <div class="micro">shared a scenario</div>
          </div>
        </div>

        <div class="card fade-up">
          <div class="path-pill" style="background:${color}15;color:${color};margin-bottom:10px;">● ${scenario.name}</div>
          <div class="stats-row" style="grid-template-columns:1fr 1fr;">
            <div class="stat-box">
              <div class="stat-val" style="color:${color}">${fmtM(finalWl)}</div>
              <div class="stat-sub">Projected at ${(scenario.start_age || 25) + 45}</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${scenario.retire_age}</div>
              <div class="stat-sub">Retirement age</div>
            </div>
          </div>
          <canvas id="projChart" height="220" style="margin-top:14px;"></canvas>
        </div>

        <div class="card fade-up">
          <h3>Comments</h3>
          <div id="share-comments-list"></div>
          ${api.getToken() ? `
          <div class="field" style="margin-top:10px;">
            <input type="text" id="share-comment-input" placeholder="Leave a comment…" maxlength="500"/>
            <button class="btn btn-ghost btn-sm" onclick="postPublicComment('${token}')" style="margin-top:6px;">Post</button>
          </div>` : `<p style="font-size:12px;color:var(--muted2);margin-top:10px;"><a href="/" style="color:var(--teal);">Sign in</a> to comment.</p>`}
        </div>

        <div class="disclaimer">
          ⚠️ Educational use only. Not financial advice.
        </div>
      </div>`;

    // Draw chart
    const chart = new Chart(document.getElementById('projChart').getContext('2d'), {
      type: 'line',
      data: { labels: ages, datasets: [{
        data: result.path, borderColor: color, backgroundColor: color + '10',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.5,
      }]},
      options: {
        responsive: true,
        scales: {
          y: { grid:{ color:'#1a1e32' }, ticks:{ color:'#4a5370', callback: v => v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v }},
          x: { grid:{ display:false }, ticks:{ color:'#4a5370', maxTicksLimit:8 }},
        },
        plugins: { legend:{ display:false } },
      },
    });

    renderComments(comments);
  } catch (err) {
    document.body.innerHTML = `<div class="container" style="text-align:center;padding-top:60px;">
      <div style="font-size:40px;margin-bottom:12px;">🔗</div>
      <h2>Share link not found</h2>
      <p style="color:var(--muted2);margin-top:8px;">This link may have been revoked or expired.</p>
      <a href="/" class="btn btn-ghost" style="display:inline-block;margin-top:20px;">Go Home</a>
    </div>`;
  }
}

async function postPublicComment(token) {
  const input = document.getElementById('share-comment-input');
  const body  = input.value.trim();
  if (!body) return;
  try {
    await api.postComment(token, body);
    input.value = '';
    const comments = await api.getComments(token);
    renderComments(comments);
  } catch (err) { showToast(err.message, true); }
}

function exportChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
