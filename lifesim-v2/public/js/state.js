/* ══════════════════════════════════════════════
   state.js — Single source of truth for the UI
   All mutations set the dirty flag; State.save()
   sends a PATCH to the server for scenario params.
   Events/assets/debts are synced granularly via
   their own modules (real-time, no save button).
══════════════════════════════════════════════ */

const State = (() => {
  const _s = {
    user:             null,    // { id, username, avatar }
    scenarioList:     [],      // lightweight list from GET /api/scenarios
    activeScenarioId: null,
    scenario:         null,    // full scenario object (with assets/debts/events)
    dirty:            false,
    mcPath:           0,
    mcVolatility:     12,
  };

  // ── Dirty flag ─────────────────────────────────────────────────────────────
  function _setDirty(val) {
    _s.dirty = val;
    const btn = document.getElementById('save-btn');
    if (!btn) return;
    if (val) {
      btn.classList.add('dirty');
      btn.textContent = '● Save';
    } else {
      btn.classList.remove('dirty');
      btn.textContent = 'Saved';
    }
  }

  // ── User ───────────────────────────────────────────────────────────────────
  function getUser()            { return _s.user; }
  function setUser(user, token) { _s.user = user; if (token) api.setToken(token); }
  function logout()             { _s.user = null; _s.scenario = null; _s.scenarioList = []; api.clearToken(); }

  // ── Scenario list ──────────────────────────────────────────────────────────
  function getScenarioList()    { return _s.scenarioList; }
  function setScenarioList(lst) { _s.scenarioList = lst; }

  // ── Active scenario ────────────────────────────────────────────────────────
  function getScenario()        { return _s.scenario; }
  function getActiveId()        { return _s.activeScenarioId; }

  async function loadScenario(id) {
    const s = await api.getScenario(id);
    _s.scenario         = s;
    _s.activeScenarioId = id;
    _setDirty(false);
    return s;
  }

  function setActiveScenario(s) {
    _s.scenario         = s;
    _s.activeScenarioId = s.id;
    // Prepend to list if not already there
    if (!_s.scenarioList.find(x => x.id === s.id)) {
      _s.scenarioList.unshift(s);
    }
    _setDirty(false);
  }

  // ── Mutations (set dirty) ──────────────────────────────────────────────────
  function patchScenario(fields) {
    if (!_s.scenario) return;
    Object.assign(_s.scenario, fields);
    _setDirty(true);
  }

  // Events (granular — caller syncs with server immediately)
  function addEvent(ev)     { if (_s.scenario) _s.scenario.events.push(ev); }
  function removeEvent(id)  { if (_s.scenario) _s.scenario.events = _s.scenario.events.filter(e => e.id !== id); }

  // Assets
  function addAsset(a)      { if (_s.scenario) _s.scenario.assets.push(a); }
  function removeAsset(id)  { if (_s.scenario) _s.scenario.assets = _s.scenario.assets.filter(a => a.id !== id); }
  function updateAsset(a)   { if (_s.scenario) { const i = _s.scenario.assets.findIndex(x => x.id === a.id); if (i >= 0) _s.scenario.assets[i] = a; } }

  // Debts
  function addDebt(d)       { if (_s.scenario) _s.scenario.debts.push(d); }
  function removeDebt(id)   { if (_s.scenario) _s.scenario.debts = _s.scenario.debts.filter(d => d.id !== id); }
  function updateDebt(d)    { if (_s.scenario) { const i = _s.scenario.debts.findIndex(x => x.id === d.id); if (i >= 0) _s.scenario.debts[i] = d; } }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function save() {
    if (!_s.scenario || !_s.dirty) return;
    const { id, name, color, job_id, custom_s0, custom_s35, custom_s50,
            start_age, retire_age, save_pct, return_rate, annual_expenses } = _s.scenario;
    await api.saveScenario(id, { name, color, job_id, custom_s0, custom_s35, custom_s50,
                                  start_age, retire_age, save_pct, return_rate, annual_expenses });
    // Update in the scenario list
    const idx = _s.scenarioList.findIndex(x => x.id === id);
    if (idx >= 0) Object.assign(_s.scenarioList[idx], { name, color, updated_at: Date.now() });
    _setDirty(false);
  }

  // ── Display flags ──────────────────────────────────────────────────────────
  function isDirty()          { return _s.dirty; }
  function setMcPath(idx)     { _s.mcPath = idx; }
  function getMcPath()        { return _s.mcPath; }
  function setMcVolatility(v) { _s.mcVolatility = v; }
  function getMcVolatility()  { return _s.mcVolatility; }

  return {
    getUser, setUser, logout,
    getScenarioList, setScenarioList,
    getScenario, getActiveId, loadScenario, setActiveScenario,
    patchScenario,
    addEvent, removeEvent,
    addAsset, removeAsset, updateAsset,
    addDebt, removeDebt, updateDebt,
    save, isDirty,
    setMcPath, getMcPath,
    setMcVolatility, getMcVolatility,
  };
})();
