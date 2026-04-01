/* ══════════════════════════════════════════════
   state.js — Global app state and localStorage sync
   ST is the single source of truth for all data.
   Call save() after any mutation to persist it.
══════════════════════════════════════════════ */

function defaultScenarios() {
    return [
      {
        label: 'Path A', color: '#00d4aa', jobId: 'sw_eng',
        currentAssets: 15000, currentDebt: 30000,
        savePct: 20, returnRate: 7, retireAge: 65,
      },
      {
        label: 'Path B', color: '#a78bfa', jobId: 'nurse',
        currentAssets: 5000, currentDebt: 0,
        savePct: 15, returnRate: 7, retireAge: 65,
      },
    ];
  }
  
  // Central state — everything lives here
  let ST = {
    user:      JSON.parse(localStorage.getItem('ls_user'))  || null,
    scenarios: JSON.parse(localStorage.getItem('ls_scen'))  || defaultScenarios(),
    events:    JSON.parse(localStorage.getItem('ls_evts'))  || [],
    showC:     JSON.parse(localStorage.getItem('ls_showC')) || false,
  
    // Runtime only (not persisted)
    inflation: false,
    mcPath:    0,
    startAge:  25,
  };
  
  // Chart instances — kept here so any file can destroy/recreate them
  let charts = { proj: null, mc: null };
  
  // Tracks which event color to assign next
  let evColorIdx = 0;
  
  // Tracks the selected avatar during onboarding
  let selectedAvatar = AVATARS[0];
  
  // Persist everything that should survive a page refresh
  function save() {
    localStorage.setItem('ls_scen',  JSON.stringify(ST.scenarios));
    localStorage.setItem('ls_evts',  JSON.stringify(ST.events));
    localStorage.setItem('ls_showC', JSON.stringify(ST.showC));
  }