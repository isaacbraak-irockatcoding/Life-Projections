/* ══════════════════════════════════════════════
   debts.js — Balance sheet: debts panel
   Real-time sync (no Save button needed).
══════════════════════════════════════════════ */

function renderDebtsTab() {
  const scenario = State.getScenario();
  if (!scenario) return;
  renderDebtsList();
}

function renderDebtsList() {
  const scenario = State.getScenario();
  const el = document.getElementById('debts-list');
  if (!el || !scenario) return;

  const totalDebt = scenario.debts.reduce((s, d) => s + (d.balance || 0), 0);
  document.getElementById('debts-total').textContent = fmtM(totalDebt);

  if (!scenario.debts.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">💳</div>
      <p>No debts added yet. Debt-free is the dream!</p></div>`;
    return;
  }

  el.innerHTML = scenario.debts.map(d => {
    const typeLabel = (DEBT_TYPES.find(t => t.id === d.type) || {}).label || d.type;
    // Estimated payoff in months
    const r = d.interest_rate / 100 / 12;
    const pmt = d.monthly_payment;
    let payoffStr = '';
    if (pmt > 0 && d.balance > 0) {
      if (r === 0) {
        payoffStr = `~${Math.ceil(d.balance / pmt)} mo`;
      } else {
        const months = Math.ceil(-Math.log(1 - r * d.balance / pmt) / Math.log(1 + r));
        payoffStr = isFinite(months) ? `~${months} mo` : '∞';
      }
    }
    return `<div class="asset-row card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${d.label}</div>
          <div class="micro" style="margin-top:2px;">${typeLabel}${payoffStr ? ' · Payoff ' + payoffStr : ''}</div>
        </div>
        <button class="event-del" onclick="deleteDebt(${d.id})">✕</button>
      </div>
      <div class="field-row3">
        <div>
          <label class="micro" style="display:block;margin-bottom:3px;">Balance</label>
          <input type="number" value="${d.balance}" onchange="updateDebt(${d.id},{balance:+this.value})" placeholder="0"/>
        </div>
        <div>
          <label class="micro" style="display:block;margin-bottom:3px;">Rate %</label>
          <input type="number" step="0.1" value="${d.interest_rate}" onchange="updateDebt(${d.id},{interest_rate:+this.value})" placeholder="5"/>
        </div>
        <div>
          <label class="micro" style="display:block;margin-bottom:3px;">Monthly Pmt</label>
          <input type="number" value="${d.monthly_payment}" onchange="updateDebt(${d.id},{monthly_payment:+this.value})" placeholder="0"/>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function addDebt() {
  const scenario = State.getScenario();
  if (!scenario) return;
  const type    = document.getElementById('debt-type-select').value;
  const label   = document.getElementById('debt-label').value.trim();
  const balance = parseFloat(document.getElementById('debt-balance').value) || 0;
  const rate    = parseFloat(document.getElementById('debt-rate').value) || 5;
  const pmt     = parseFloat(document.getElementById('debt-pmt').value) || 0;
  if (!label) { showToast('Please enter a debt name', true); return; }
  try {
    const d = await api.createDebt(scenario.id, { type, label, balance, interest_rate: rate, monthly_payment: pmt });
    State.addDebt(d);
    ['debt-label','debt-balance','debt-pmt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderDebtsList();
    if (charts.proj) renderProjChart();
    showToast('Debt added');
  } catch (err) { showToast(err.message, true); }
}

async function updateDebt(id, patch) {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    const d = await api.updateDebt(scenario.id, id, patch);
    State.updateDebt(d);
    renderDebtsList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteDebt(id) {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    await api.deleteDebt(scenario.id, id);
    State.removeDebt(id);
    renderDebtsList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}
