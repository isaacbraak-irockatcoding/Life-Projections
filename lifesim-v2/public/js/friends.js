/* ══════════════════════════════════════════════
   friends.js — Mutual friends UI
══════════════════════════════════════════════ */

let _friendCharts = {};
function _destroyFriendCharts() {
  Object.values(_friendCharts).forEach(c => { try { c.destroy(); } catch {} });
  _friendCharts = {};
}

async function renderFriendsTab() {
  const el = document.getElementById('friends-content');
  if (!el) return;
  el.innerHTML = `<div class="empty"><p>Loading…</p></div>`;

  try {
    const [friends, pending] = await Promise.all([
      api.get('/api/friends'),
      api.get('/api/friends/pending'),
    ]);
    renderFriendsList(friends, pending, el);
  } catch (err) { el.innerHTML = `<div class="empty"><p>${err.message}</p></div>`; }
}

function renderFriendsList(friends, pending, el) {
  _destroyFriendCharts();
  let html = '';
  const withScenarios = friends.filter(f => f.share_token);

  // Pending incoming requests
  if (pending.length) {
    html += `<div class="card fade-up">
      <h3>Friend Requests (${pending.length})</h3>`;
    html += pending.map(p => `
      <div class="friend-item">
        <span style="font-size:22px;">${p.avatar}</span>
        <div class="friend-info">
          <div class="friend-name">${p.username}</div>
          <div class="micro">Wants to connect</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm btn-icon" onclick="acceptFriend(${p.id})">✓</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="rejectFriend(${p.id})">✕</button>
        </div>
      </div>`).join('');
    html += `</div>`;
  }

  // Friends list
  html += `<div class="card fade-up">
    <h3>Friends${friends.length ? ` (${friends.length})` : ''}</h3>`;

  if (friends.length) {
    html += friends.map(f => `
      <div class="friend-item">
        <span style="font-size:22px;">${f.avatar}</span>
        <div class="friend-info">
          <div class="friend-name">${f.username}</div>
          <div class="micro">Friend</div>
        </div>
        <button class="event-del" onclick="removeFriend(${f.id})" title="Remove">✕</button>
      </div>`).join('');
  } else {
    html += `<p style="color:var(--muted2);font-size:12px;">No friends yet.</p>`;
  }
  html += `</div>`;

  // Friends' Scenarios feed
  if (withScenarios.length) {
    html += `<div class="card fade-up">
      <h3>Friends' Scenarios</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:10px;">`;
    html += withScenarios.map(f => `
      <div style="background:var(--input,#1a1e32);border-radius:10px;padding:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:18px;">${f.avatar}</span>
          <div>
            <div style="font-size:13px;font-weight:600;">${escapeHtml(f.username)}</div>
            <div style="font-size:11px;color:var(--muted2);min-height:14px;">
              <span id="ff-occ-${f.id}"></span>
            </div>
          </div>
        </div>
        <canvas id="ff-chart-${f.id}" height="120" style="width:100%;"></canvas>
      </div>`).join('');
    html += `</div></div>`;
  }

  // Add friend form
  html += `<div class="card fade-up">
    <h3>Add a Friend</h3>
    <div class="field">
      <input type="text" id="friend-username-input" placeholder="Enter username"
        onkeydown="if(event.key==='Enter')sendFriendRequest()"/>
    </div>
    <button class="btn btn-ghost" onclick="sendFriendRequest()">Send Request</button>
  </div>`;

  html += `<div id="groups-section"></div>`;
  document.getElementById('friends-content').innerHTML = html;
  renderGroupsSection(document.getElementById('groups-section'));
  withScenarios.forEach(f => _renderFriendChart(f.id, f.share_token));
}

async function _renderFriendChart(friendId, shareToken) {
  const canvas = document.getElementById(`ff-chart-${friendId}`);
  if (!canvas) return;
  try {
    const scenario = await api.getPublicScenario(shareToken);
    const result   = calculatePath(scenario);
    const ages     = getAges(scenario.start_age || 25);
    const color    = scenario.color || '#00d4aa';
    const finalWl  = result.path[result.path.length - 1];

    _friendCharts[`ff-chart-${friendId}`] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: ages, datasets: [{ data: result.path, borderColor: color,
        backgroundColor: color + '15', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
      options: {
        responsive: true,
        scales: {
          y: { grid: { color: '#1a1e32' }, ticks: { color: '#4a5370',
            callback: v => v >= 1e6 ? '$' + (v/1e6).toFixed(1) + 'M' : v >= 1000 ? '$' + (v/1000).toFixed(0) + 'K' : '$' + v } },
          x: { grid: { display: false }, ticks: { color: '#4a5370', maxTicksLimit: 5 } },
        },
        plugins: { legend: { display: false } },
      },
    });

    const primaryJobId = scenario.careers && scenario.careers.length > 0
      ? scenario.careers.slice().sort((a, b) => a.start_age - b.start_age)[0].job_id
      : scenario.job_id;
    const occEl = document.getElementById(`ff-occ-${friendId}`);
    if (occEl) occEl.textContent = (JOBS.find(j => j.id === primaryJobId) || {}).name || primaryJobId || '';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:var(--muted2);text-align:right;margin-top:4px;';
    label.textContent = `Projected: ${fmtM(finalWl)}`;
    canvas.parentNode.appendChild(label);

    canvas.style.cursor = 'pointer';
    canvas.title = 'Click to view details';
    canvas.onclick = () => _openGroupScenarioModal(scenario, result, finalWl);
  } catch {
    if (canvas) {
      canvas.style.display = 'none';
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:11px;color:var(--muted2);text-align:center;padding:8px 0;';
      msg.textContent = 'Scenario unavailable';
      canvas.parentNode.insertBefore(msg, canvas);
    }
  }
}

async function acceptFriend(requesterId) {
  try {
    await api.acceptFriend(requesterId);
    showToast('Friend request accepted');
    renderFriendsTab();
  } catch (err) { showToast(err.message, true); }
}

async function rejectFriend(userId) {
  try {
    await api.removeFriend(userId);
    renderFriendsTab();
  } catch (err) { showToast(err.message, true); }
}

async function removeFriend(userId) {
  try {
    await api.removeFriend(userId);
    showToast('Friend removed');
    renderFriendsTab();
  } catch (err) { showToast(err.message, true); }
}

async function sendFriendRequest() {
  const input    = document.getElementById('friend-username-input');
  const username = input?.value.trim();
  if (!username) { showToast('Enter a username', true); return; }
  try {
    await api.sendFriendRequest(username);
    showToast(`Request sent to ${username}`);
    if (input) input.value = '';
  } catch (err) { showToast(err.message, true); }
}
