/* ══════════════════════════════════════════════
   assets.js — Balance sheet: assets panel
   Real-time sync (no Save button needed).
══════════════════════════════════════════════ */

function renderAssetsTab() { /* replaced by inline section in scenario editor */ }

function renderAssetsList() {
  const scenario = State.getScenario();
  const el = document.getElementById('assets-list');
  if (!el || !scenario) return;

  const totalAssets = scenario.assets.reduce((s, a) => s + (a.value || 0), 0);
  document.getElementById('assets-total').textContent = fmtM(totalAssets);

  if (!scenario.assets.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📈</div>
      <p>No assets added yet.</p></div>`;
    return;
  }

  const scenarioStartAge = State.getScenario()?.start_age || 25;
  el.innerHTML = scenario.assets.map(a => {
    const typeLabel = (ASSET_TYPES.find(t => t.id === a.type) || {}).label || a.type;
    const isFuture  = a.start_age && a.start_age > scenarioStartAge;
    return `<div class="asset-row card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${a.label}</div>
          <div class="micro" style="margin-top:2px;">${typeLabel}${isFuture ? ` · starts age ${a.start_age}` : ''}</div>
        </div>
        <button class="event-del" onclick="deleteAsset(${a.id})">✕</button>
      </div>
      <div class="field-row3">
        <div>
          <label class="micro" style="display:block;margin-bottom:3px;">Current Value</label>
          <input type="number" value="${a.value}" onchange="updateAsset(${a.id},{value:+this.value})" placeholder="0"/>
        </div>
        <div>
          <label class="micro" style="display:block;margin-bottom:3px;">Annual Contribution</label>
          <input type="number" value="${a.annual_contribution}" onchange="updateAsset(${a.id},{annual_contribution:+this.value})" placeholder="0"/>
        </div>
        <div>
          <label class="micro" style="display:block;margin-bottom:3px;">Return Rate %</label>
          <input type="number" step="0.5" value="${a.expected_return_rate}" onchange="updateAsset(${a.id},{expected_return_rate:+this.value})" placeholder="7"/>
        </div>
      </div>
      <div class="field-row" style="margin-top:6px;">
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:3px;">Acquired at age</label>
          <input type="number" value="${a.start_age || ''}" onchange="updateAsset(${a.id},{start_age:this.value?+this.value:null})" placeholder="${scenarioStartAge} (now)"/>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function addAsset() {
  const scenario = State.getScenario();
  if (!scenario) return;
  const type  = document.getElementById('asset-type-select').value;
  const label = document.getElementById('asset-label').value.trim();
  const value = parseFloat(document.getElementById('asset-value').value) || 0;
  const contrib   = parseFloat(document.getElementById('asset-contrib').value) || 0;
  const rate      = parseFloat(document.getElementById('asset-rate').value) || 7;
  const startAgeEl = document.getElementById('asset-start-age');
  const start_age  = startAgeEl && startAgeEl.value ? +startAgeEl.value : null;
  if (!label) { showToast('Please enter an asset name', true); return; }
  try {
    const a = await api.createAsset(scenario.id, { type, label, value, annual_contribution: contrib, expected_return_rate: rate, start_age });
    State.addAsset(a);
    // Clear form
    ['asset-label','asset-value','asset-contrib','asset-start-age'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderAssetsList();
    // Refresh projection if open
    if (charts.proj) renderProjChart();
    showToast('Asset added');
  } catch (err) { showToast(err.message, true); }
}

async function updateAsset(id, patch) {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    const a = await api.updateAsset(scenario.id, id, patch);
    State.updateAsset(a);
    renderAssetsList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteAsset(id) {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    await api.deleteAsset(scenario.id, id);
    State.removeAsset(id);
    renderAssetsList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}
