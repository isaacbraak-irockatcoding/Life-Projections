/* ══════════════════════════════════════════════
   friends.js — Mutual friends UI
══════════════════════════════════════════════ */

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
  let html = '';

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
