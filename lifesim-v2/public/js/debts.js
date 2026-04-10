/* ══════════════════════════════════════════════
   debts.js — Balance sheet: debts panel
   Real-time sync (no Save button needed).
══════════════════════════════════════════════ */

function renderDebtsTab() { /* replaced by inline section in scenario editor */ }

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

  const scenarioStartAge = State.getScenario()?.start_age || 25;
  el.innerHTML = scenario.debts.map(d => {
    const typeLabel = (DEBT_TYPES.find(t => t.id === d.type) || {}).label || d.type;
    const isFuture  = d.start_age && d.start_age > scenarioStartAge;
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
          <div class="micro" style="margin-top:2px;">${typeLabel}${isFuture ? ` · starts age ${d.start_age}` : (payoffStr ? ' · Payoff ' + payoffStr : '')}</div>
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
      <div class="field-row" style="margin-top:6px;">
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:3px;">Started at age</label>
          <input type="number" value="${d.start_age || ''}" onchange="updateDebt(${d.id},{start_age:this.value?+this.value:null})" placeholder="${scenarioStartAge} (now)"/>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── School loan auto-management ────────────────────────────────────────────────

// Called whenever a school field changes. Patches scenario locally, syncs loan, re-renders.
async function updateSchoolField(field, value) {
  State.patchScenario({ [field]: value });
  await syncSchoolLoan();
  renderActiveScenarioEditor();
  renderProjChart();
}

// Creates, updates, or deletes the auto-managed student loan based on school settings.
async function syncSchoolLoan() {
  const s = State.getScenario();
  if (!s) return;

  const schoolStart = s.school_start_age ?? s.start_age;
  const years       = s.school_years || 4;
  const tuition     = s.school_tuition_annual || 0;
  const schAnnual   = s.school_scholarship_annual || 0;
  const schYears    = s.school_scholarship_years ?? years;

  // Total loan = sum of net tuition each year (tuition minus scholarship while it lasts)
  let totalLoan = 0;
  for (let y = 0; y < years; y++) {
    totalLoan += Math.max(0, tuition - (y < schYears ? schAnnual : 0));
  }

  const needsLoan    = !s.school_parent_pays && totalLoan > 0;
  const loanStartAge = schoolStart + years + 1; // +1 yr ≈ 6-month federal grace period
  const SCHOOL_RATE  = 6.54; // federal direct unsubsidized undergrad rate
  const r = SCHOOL_RATE / 100 / 12;
  // Interest accrues during school years + 6-month grace period (unsubsidized)
  const capitalizeMonths = years * 12 + 6;
  const capitalizedBalance = r > 0 ? Math.round(totalLoan * Math.pow(1 + r, capitalizeMonths)) : totalLoan;
  const n = 120; // 10-year repayment
  const monthlyPmt = r > 0
    ? Math.ceil(capitalizedBalance * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1))
    : Math.ceil(capitalizedBalance / n);

  if (!needsLoan) {
    if (s.school_loan_id) {
      await api.deleteDebt(s.id, s.school_loan_id);
      State.removeDebt(s.school_loan_id);
      State.patchScenario({ school_loan_id: null });
      await api.saveScenario(s.id, { school_loan_id: null });
    }
    return;
  }

  const debtPayload = {
    type:            'student_loan',
    label:           (s.school_name?.trim() || 'School') + ' Loan',
    balance:         capitalizedBalance,
    interest_rate:   SCHOOL_RATE,
    monthly_payment: monthlyPmt,
    start_age:       loanStartAge,
  };

  if (s.school_loan_id) {
    // Update existing school loan
    const d = await api.updateDebt(s.id, s.school_loan_id, debtPayload);
    State.updateDebt(d);
  } else {
    // Create new school loan and persist its ID on the scenario immediately
    const d = await api.createDebt(s.id, debtPayload);
    State.addDebt(d);
    State.patchScenario({ school_loan_id: d.id });
    await api.saveScenario(s.id, { school_loan_id: d.id });
  }
}

// ── Higher education (grad school) loan sync ───────────────────────────────────

async function updateGradSchoolField(field, value) {
  State.patchScenario({ [field]: value });
  await syncGradSchoolLoan();
  renderActiveScenarioEditor();
  renderProjChart();
}

async function syncGradSchoolLoan() {
  const s = State.getScenario();
  if (!s) return;

  const gradStart = s.grad_start_age ?? ((s.school_start_age ?? s.start_age) + (s.school_years || 4));
  const years     = s.grad_years || 2;
  const tuition   = s.grad_tuition_annual || 0;
  const schAnnual = s.grad_scholarship_annual || 0;
  const schYears  = s.grad_scholarship_years ?? years;

  let totalLoan = 0;
  for (let y = 0; y < years; y++) {
    totalLoan += Math.max(0, tuition - (y < schYears ? schAnnual : 0));
  }

  const needsLoan    = !s.grad_parent_pays && totalLoan > 0;
  const loanStartAge = gradStart + years + 1; // +1 yr ≈ 6-month federal grace period
  const GRAD_RATE    = 7.05; // federal direct unsubsidized grad/professional rate
  const r = GRAD_RATE / 100 / 12;
  // Interest accrues during program years + 6-month grace period (unsubsidized)
  const capitalizeMonths = years * 12 + 6;
  const capitalizedBalance = r > 0 ? Math.round(totalLoan * Math.pow(1 + r, capitalizeMonths)) : totalLoan;
  const n = 120;
  const monthlyPmt = r > 0
    ? Math.ceil(capitalizedBalance * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1))
    : Math.ceil(capitalizedBalance / n);

  if (!needsLoan) {
    if (s.grad_loan_id) {
      await api.deleteDebt(s.id, s.grad_loan_id);
      State.removeDebt(s.grad_loan_id);
      State.patchScenario({ grad_loan_id: null });
      await api.saveScenario(s.id, { grad_loan_id: null });
    }
    return;
  }

  const debtPayload = {
    type:            'student_loan',
    label:           (s.grad_name?.trim() || 'Grad School') + ' Loan',
    balance:         capitalizedBalance,
    interest_rate:   GRAD_RATE,
    monthly_payment: monthlyPmt,
    start_age:       loanStartAge,
  };

  if (s.grad_loan_id) {
    const d = await api.updateDebt(s.id, s.grad_loan_id, debtPayload);
    State.updateDebt(d);
  } else {
    const d = await api.createDebt(s.id, debtPayload);
    State.addDebt(d);
    State.patchScenario({ grad_loan_id: d.id });
    await api.saveScenario(s.id, { grad_loan_id: d.id });
  }
}

// ── Manual debt form helpers ────────────────────────────────────────────────────

// Calculates and fills the monthly payment field using standard 10-year amortization
function autoCalcDebtPayment() {
  const balance = parseFloat(document.getElementById('debt-balance').value) || 0;
  const rate    = parseFloat(document.getElementById('debt-rate').value) || 0;
  if (!balance) return;
  const r = rate / 100 / 12;
  const n = 120; // 10-year standard repayment
  const pmt = r > 0
    ? balance * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
    : balance / n;
  document.getElementById('debt-pmt').value = Math.ceil(pmt);
}

// Auto-fill payment when type changes to student_loan (if balance/rate are already set)
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'debt-type-select' && e.target.value === 'student_loan') {
    const balance = parseFloat(document.getElementById('debt-balance').value) || 0;
    if (balance > 0) autoCalcDebtPayment();
  }
});

async function addDebt() {
  const scenario = State.getScenario();
  if (!scenario) return;
  const type    = document.getElementById('debt-type-select').value;
  const label   = document.getElementById('debt-label').value.trim();
  const balance = parseFloat(document.getElementById('debt-balance').value) || 0;
  const rate       = parseFloat(document.getElementById('debt-rate').value) || 5;
  const pmt        = parseFloat(document.getElementById('debt-pmt').value) || 0;
  const startAgeEl = document.getElementById('debt-start-age');
  const start_age  = startAgeEl && startAgeEl.value ? +startAgeEl.value : null;
  if (!label) { showToast('Please enter a debt name', true); return; }
  try {
    const d = await api.createDebt(scenario.id, { type, label, balance, interest_rate: rate, monthly_payment: pmt, start_age });
    State.addDebt(d);
    ['debt-label','debt-balance','debt-pmt','debt-start-age'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
