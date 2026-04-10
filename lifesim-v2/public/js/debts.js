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
// ── Per-school loan sync ───────────────────────────────────────────────────────
// Rates: undergrad 6.54%, grad/professional 7.05% (federal direct unsubsidized)
const SCHOOL_RATES = { undergrad: 6.54, grad: 7.05, professional: 7.05 };

async function syncSchoolLoanForEntry(school) {
  const s = State.getScenario();
  if (!s) return;

  const years     = school.years || 4;
  const tuition   = school.tuition_annual || 0;
  const schAnnual = school.scholarship_annual || 0;
  const schYears  = school.scholarship_years || 0;

  let totalLoan = 0;
  for (let y = 0; y < years; y++) {
    totalLoan += Math.max(0, tuition - (y < schYears ? schAnnual : 0));
  }

  const needsLoan    = !school.parent_pays && totalLoan > 0;
  const RATE         = SCHOOL_RATES[school.type] || 6.54;
  const r            = RATE / 100 / 12;
  const loanStartAge = school.start_age + years + 1; // +1 yr ≈ 6-month grace period
  const capMonths    = years * 12 + 6;               // interest accrues during school + grace
  const capBalance   = r > 0 ? Math.round(totalLoan * Math.pow(1 + r, capMonths)) : totalLoan;
  const n            = 120; // 10-year repayment
  const monthlyPmt   = r > 0
    ? Math.ceil(capBalance * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1))
    : Math.ceil(capBalance / n);

  if (!needsLoan) {
    if (school.loan_id) {
      await api.deleteDebt(s.id, school.loan_id);
      State.removeDebt(school.loan_id);
      const updated = await api.updateSchool(s.id, school.id, { loan_id: null });
      State.updateSchool(updated);
    }
    return;
  }

  const debtPayload = {
    type:            'student_loan',
    label:           (school.name?.trim() || 'School') + ' Loan',
    balance:         capBalance,
    interest_rate:   RATE,
    monthly_payment: monthlyPmt,
    start_age:       loanStartAge,
  };

  if (school.loan_id) {
    const d = await api.updateDebt(s.id, school.loan_id, debtPayload);
    State.updateDebt(d);
  } else {
    const d = await api.createDebt(s.id, debtPayload);
    State.addDebt(d);
    const updated = await api.updateSchool(s.id, school.id, { loan_id: d.id });
    State.updateSchool(updated);
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
