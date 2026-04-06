/* ══════════════════════════════════════════════
   groups.js — Teacher/Student Groups UI
══════════════════════════════════════════════ */

let _activeGroupId  = null;
let _groupPollTimer = null;
let _groupCharts    = {};

// ── Groups section (inside Friends tab) ────────────────────────────────────

async function renderGroupsSection(containerEl) {
  if (!containerEl) return;
  try {
    const groups = await api.listGroups();
    let html = `<div class="card fade-up"><h3>Groups</h3>`;

    if (groups.length) {
      html += groups.map(g => `
        <div class="friend-item">
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(g.name)}</div>
            <div class="micro">${g.member_count} member${g.member_count !== 1 ? 's' : ''}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="openGroupView(${g.id})">View →</button>
        </div>`).join('');
    } else {
      html += `<p style="color:var(--muted2);font-size:12px;">No groups yet.</p>`;
    }
    html += `</div>`;

    html += `<div class="card fade-up">
      <h3>Create a Group</h3>
      <div class="field">
        <input type="text" id="group-name-input" placeholder="e.g. Math Class 2026"
          onkeydown="if(event.key==='Enter')createGroup()"/>
      </div>
      <button class="btn btn-ghost" onclick="createGroup()">Create Group</button>
    </div>`;

    html += `<div class="card fade-up">
      <h3>Join a Group</h3>
      <div class="field">
        <input type="text" id="group-join-code-input" placeholder="Enter join code"
          onkeydown="if(event.key==='Enter')joinGroupByCode()"
          style="text-transform:uppercase;letter-spacing:.1em;"/>
      </div>
      <button class="btn btn-ghost" onclick="joinGroupByCode()">Join</button>
    </div>`;

    containerEl.innerHTML = html;
  } catch (err) {
    containerEl.innerHTML = `<div class="card fade-up"><p style="color:var(--muted2);font-size:12px;">${escapeHtml(err.message)}</p></div>`;
  }
}

async function createGroup() {
  const input = document.getElementById('group-name-input');
  const name  = input?.value.trim();
  if (!name) { showToast('Enter a group name', true); return; }
  try {
    const group = await api.createGroup(name);
    if (input) input.value = '';
    openGroupView(group.id);
  } catch (err) { showToast(err.message, true); }
}

async function joinGroupByCode() {
  const input = document.getElementById('group-join-code-input');
  const code  = input?.value.trim().toUpperCase();
  if (!code) { showToast('Enter a join code', true); return; }
  try {
    const result = await api.joinGroup(code);
    showToast(`Joined "${result.name}"!`);
    if (input) input.value = '';
    const container = document.getElementById('groups-section');
    if (container) renderGroupsSection(container);
  } catch (err) { showToast(err.message, true); }
}

// ── Group detail view ───────────────────────────────────────────────────────

async function openGroupView(groupId) {
  _destroyGroupCharts();
  clearInterval(_groupPollTimer);
  _activeGroupId = groupId;

  const el = document.getElementById('friends-content');
  if (!el) return;
  el.innerHTML = `<div class="empty"><p>Loading group…</p></div>`;

  try {
    const group = await api.getGroup(groupId);
    await _renderGroupView(group);
    _groupPollTimer = setInterval(() => refreshGroupView(groupId), 30000);
  } catch (err) {
    el.innerHTML = `<div class="empty"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function refreshGroupView(groupId) {
  try {
    const group = await api.getGroup(groupId);
    _destroyGroupCharts();
    await _renderGroupView(group);
  } catch {}
}

function closeGroupView() {
  clearInterval(_groupPollTimer);
  _groupPollTimer = null;
  _activeGroupId  = null;
  _destroyGroupCharts();
  renderFriendsTab();
}

async function _renderGroupView(group) {
  const el = document.getElementById('friends-content');
  if (!el) return;
  const me      = State.getUser();
  const isOwner = me && group.owner_id === me.id;

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" onclick="closeGroupView()">← Back</button>
      <h2 style="margin:0;flex:1;font-size:18px;">${escapeHtml(group.name)}</h2>
      ${isOwner ? `
        <span class="micro" title="Click to copy join code"
          style="background:var(--card);padding:4px 10px;border-radius:6px;letter-spacing:.1em;cursor:pointer;"
          onclick="navigator.clipboard.writeText('${escapeHtml(group.join_code)}').then(()=>showToast('Code copied!'),()=>showToast('Copy failed',true))">
          📋 ${escapeHtml(group.join_code)}
        </span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteGroupConfirm(${group.id})"
          title="Delete group" style="color:var(--red,#ff6b6b);">🗑</button>` : ''}
    </div>

    <div class="card fade-up" style="margin-bottom:14px;">
      <button class="btn btn-primary" onclick="publishMyScenario(${group.id})">📤 Publish My Scenario to Group</button>
      <p style="font-size:11px;color:var(--muted2);margin:8px 0 0;">Shares your currently active scenario with all group members.</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
  `;

  for (const member of group.members) {
    const isSelf = me && member.user_id === me.id;
    html += `
      <div class="card fade-up">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:20px;">${member.avatar}</span>
          <div style="flex:1;">
            <div class="friend-name">${escapeHtml(member.username)}</div>
            ${isSelf ? `<div class="micro">You</div>` : ''}
          </div>
          ${isOwner && !isSelf ? `
            <button class="event-del" onclick="removeGroupMemberConfirm(${group.id},${member.user_id})" title="Remove member">✕</button>` : ''}
        </div>
        ${member.share_token
          ? `<canvas id="group-chart-${member.user_id}" height="160" style="width:100%;"></canvas>`
          : `<div style="height:80px;display:flex;align-items:center;justify-content:center;color:var(--muted2);font-size:12px;">No scenario shared yet</div>`
        }
      </div>
    `;
  }
  html += `</div>`;

  el.innerHTML = html;

  // Draw charts after DOM update
  for (const member of group.members) {
    if (member.share_token) {
      _renderMemberChart(`group-chart-${member.user_id}`, member.share_token);
    }
  }
}

async function _renderMemberChart(canvasId, shareToken) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  try {
    const scenario = await api.getPublicScenario(shareToken);
    const result   = calculatePath(scenario);
    const ages     = getAges(scenario.start_age || 25);
    const color    = scenario.color || '#00d4aa';
    const finalWl  = result.path[result.path.length - 1];

    _groupCharts[canvasId] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: ages, datasets: [{
        data: result.path, borderColor: color, backgroundColor: color + '15',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
      }]},
      options: {
        responsive: true,
        scales: {
          y: { grid: { color: '#1a1e32' }, ticks: { color: '#4a5370', callback: v => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v } },
          x: { grid: { display: false }, ticks: { color: '#4a5370', maxTicksLimit: 6 } },
        },
        plugins: { legend: { display: false } },
      },
    });

    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:var(--muted2);text-align:right;margin-top:4px;';
    label.textContent = `Projected: ${fmtM(finalWl)}`;
    canvas.parentNode.appendChild(label);
  } catch {
    if (canvas) {
      canvas.style.display = 'none';
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:12px;color:var(--muted2);text-align:center;padding:10px 0;';
      msg.textContent = 'Scenario unavailable';
      canvas.parentNode.insertBefore(msg, canvas);
    }
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function publishMyScenario(groupId) {
  const scenarioId = State.getActiveId();
  if (!scenarioId) { showToast('Load a scenario first', true); return; }
  try {
    await api.publishToGroup(groupId, scenarioId);
    showToast('Scenario published to group!');
    refreshGroupView(groupId);
  } catch (err) { showToast(err.message, true); }
}

async function deleteGroupConfirm(groupId) {
  if (!confirm('Delete this group? This cannot be undone.')) return;
  try {
    await api.deleteGroup(groupId);
    showToast('Group deleted');
    closeGroupView();
  } catch (err) { showToast(err.message, true); }
}

async function removeGroupMemberConfirm(groupId, userId) {
  if (!confirm('Remove this member from the group?')) return;
  try {
    await api.removeGroupMember(groupId, userId);
    refreshGroupView(groupId);
  } catch (err) { showToast(err.message, true); }
}

function _destroyGroupCharts() {
  Object.values(_groupCharts).forEach(c => { try { c.destroy(); } catch {} });
  _groupCharts = {};
}
