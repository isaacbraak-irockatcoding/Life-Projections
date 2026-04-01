/* ══════════════════════════════════════════════
   nav.js — Tab switching + boot
   Always loaded LAST — runs after all other
   scripts are defined.
══════════════════════════════════════════════ */

const TABS = ['proj', 'mc', 'events', 'share'];

function switchTab(tab) {
  TABS.forEach(t => {
    document.getElementById(`screen-${t}`).style.display = 'none';
    document.getElementById(`nav-${t}`).classList.remove('active');
  });
  document.getElementById(`screen-${tab}`).style.display = 'block';
  document.getElementById(`nav-${tab}`).classList.add('active');

  if (tab === 'proj')   { renderScenarioEditors(); renderProjChart(); }
  if (tab === 'mc')     { setMcPath(ST.mcPath); }
  if (tab === 'events') { renderEventList(); }
  if (tab === 'share')  { renderShareTab(); }
}

// Boot — runs immediately when this script loads
if (ST.user) {
  ST.startAge = ST.user.age || 25;
  document.getElementById('screen-setup').style.display = 'none';
  document.getElementById('main-nav').style.display     = 'flex';
  switchTab('proj');
} else {
  initSetup();
}