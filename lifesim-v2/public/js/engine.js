/* ══════════════════════════════════════════════
   engine.js — Math engine and formatters
   All financial calculations live here.
   No DOM access; pure functions only.
══════════════════════════════════════════════ */

// Salary interpolation: start → year-35 peak → year-50 true peak
function getSalary(job, yearsWorked) {
  if (yearsWorked <= 0)  return job.s0;
  if (yearsWorked <= 35) return job.s0 + (job.s35 - job.s0) * (yearsWorked / 35);
  return job.s35 + (job.s50 - job.s35) * Math.min((yearsWorked - 35) / 15, 1);
}

// Collapses the assets and debts arrays into two numbers for the projection loop
// Only includes items that have already started (start_age <= scenario.start_age or no start_age)
function collapseBalanceSheet(scenario) {
  const s = scenario.start_age || 25;
  const currentAssets = (scenario.assets || [])
    .filter(a => (!a.start_age || a.start_age <= s) && !a.event_id)
    .reduce((sum, a) => sum + (a.value || 0), 0);
  const currentDebt = (scenario.debts || [])
    .filter(d => !d.start_age || d.start_age <= s)
    .reduce((sum, d) => sum + (d.balance || 0), 0);
  return { currentAssets, currentDebt };
}

// Returns total annual debt payments still owed at a given age
// Offsets amortization by each debt's individual start_age
function getDebtPayments(debts, age, scenarioStartAge) {
  return (debts || []).reduce((sum, d) => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age < debtStart) return sum; // debt hasn't started yet
    if (!d.monthly_payment || d.monthly_payment <= 0) return sum;
    const yearIndex = age - debtStart; // years since this debt started
    const r = d.interest_rate / 100 / 12;
    let payoffMonths;
    if (r === 0) {
      payoffMonths = d.balance / d.monthly_payment;
    } else if (r * d.balance >= d.monthly_payment) {
      return sum + d.monthly_payment * 12; // payment < interest: debt never paid off
    } else {
      payoffMonths = -Math.log(1 - r * d.balance / d.monthly_payment) / Math.log(1 + r);
    }
    return yearIndex * 12 < payoffMonths ? sum + d.monthly_payment * 12 : sum;
  }, 0);
}

// ── Tax calculations ───────────────────────────────────────────────────────────

// 2024 federal income tax (single filer, standard deduction $14,600)
function calcFederalTax(gross) {
  const taxable = Math.max(0, gross - 14600);
  const brackets = [
    [11600,  0.10],
    [35550,  0.12],
    [53375,  0.22],
    [91425,  0.24],
    [51775,  0.32],
    [365625, 0.35],
    [Infinity, 0.37],
  ];
  let tax = 0, remaining = taxable;
  for (const [size, rate] of brackets) {
    if (remaining <= 0) break;
    const chunk = Math.min(remaining, size);
    tax += chunk * rate;
    remaining -= chunk;
  }
  return tax;
}

// Approximate effective state income tax rates (flat simplification)
const STATE_TAX_RATES = {
  none: 0,
  AK: 0, FL: 0, NV: 0, NH: 0, SD: 0, TN: 0, TX: 0, WA: 0, WY: 0,
  AL: 0.040, AZ: 0.025, AR: 0.047, CA: 0.0725, CO: 0.044, CT: 0.055,
  DE: 0.052, DC: 0.085, GA: 0.055, HI: 0.079, ID: 0.058, IL: 0.0495,
  IN: 0.0305, IA: 0.057, KS: 0.052, KY: 0.045, LA: 0.042, ME: 0.063,
  MD: 0.055, MA: 0.050, MI: 0.0425, MN: 0.068, MS: 0.047, MO: 0.049,
  MT: 0.065, NE: 0.059, NJ: 0.063, NM: 0.049, NY: 0.065, NC: 0.0475,
  ND: 0.025, OH: 0.038, OK: 0.047, OR: 0.088, PA: 0.0307, RI: 0.055,
  SC: 0.064, UT: 0.0465, VT: 0.066, VA: 0.057, WV: 0.065, WI: 0.054,
};

function getStateTaxRate(stateCode) {
  return STATE_TAX_RATES[stateCode] ?? 0;
}

function calcAfterTaxSalary(gross, stateCode) {
  const federal = calcFederalTax(gross);
  const state   = gross * getStateTaxRate(stateCode || 'none');
  return Math.max(0, gross - federal - state);
}

// Returns one-time cost and annual drag from events at a given age
// Accepts an explicit events array (so it can be used inside a Web Worker)
function getEventImpact(age, events) {
  let oneTime = 0, annual = 0;
  (events || []).forEach(ev => {
    if (ev.at_age === age) oneTime += (ev.one_time_cost || 0);
    if (age >= ev.at_age && age < ev.at_age + (ev.duration_years || 1)) annual += (ev.annual_impact || 0);
  });
  return { oneTime, annual };
}

// Main projection: returns { path, annualDrawn }
// s: full scenario object from the API
function calculatePath(scenario) {
  const job = JOBS.find(j => j.id === scenario.job_id) || JOBS[0];
  // Apply custom salary overrides if present
  const effectiveJob = scenario.custom_s0
    ? { ...job, s0: scenario.custom_s0, s35: scenario.custom_s35 || job.s35, s50: scenario.custom_s50 || job.s50 }
    : job;

  const { currentAssets, currentDebt } = collapseBalanceSheet(scenario);
  let wealth    = currentAssets - currentDebt;
  const startAge       = scenario.start_age || 25;
  const careerStartAge = scenario.career_start_age ?? 22;
  const workAges = Array.from({ length: 46 }, (_, i) => startAge + i);
  const path     = new Array(startAge).fill(null); // nulls before user's age
  let retireBal = null, annualDrawn = 0;

  // Track house purchases as separately-appreciating assets
  const homes = []; // { value, rate }

  workAges.forEach((age, y) => {
    // Register any house purchases happening this age before pushing to path
    (scenario.events || []).forEach(e => {
      if (e.event_type === 'house_purchase' && e.at_age === age && (e.home_value || 0) > 0) {
        homes.push({ value: e.home_value, rate: e.home_appreciation_rate || 3 });
      }
    });

    const homeTotal = homes.reduce((s, h) => s + h.value, 0);
    path.push(Math.round(wealth + homeTotal));
    const ev = getEventImpact(age, scenario.events);

    if (age < scenario.retire_age) {
      const yearsWorked  = Math.max(0, age - careerStartAge);
      const salary       = getSalary(effectiveJob, yearsWorked);
      const afterTax     = calcAfterTaxSalary(salary, scenario.state_code);
      const debtPayments = getDebtPayments(scenario.debts, age, startAge);
      const available    = Math.max(0, afterTax - debtPayments);
      const savings      = Math.min(afterTax * (scenario.save_pct / 100), available);
      // Future assets/debts entering the projection this year
      const futureAssets = (scenario.assets || [])
        .filter(a => a.start_age && a.start_age > startAge && a.start_age === age && !a.event_id)
        .reduce((sum, a) => sum + (a.value || 0), 0);
      const futureDebts  = (scenario.debts || [])
        .filter(d => d.start_age && d.start_age > startAge && d.start_age === age && !d.event_id)
        .reduce((sum, d) => sum + (d.balance || 0), 0);
      wealth = wealth * (1 + scenario.return_rate / 100)
             + savings + futureAssets - futureDebts
             - ev.oneTime - ev.annual;
    } else {
      if (retireBal === null) {
        const homeTotal2 = homes.reduce((s, h) => s + h.value, 0);
        retireBal = wealth + homeTotal2;
        annualDrawn = retireBal * 0.04;
      }
      wealth = wealth * (1 + scenario.return_rate / 100) - annualDrawn;
    }

    // Appreciate homes at end of each year
    homes.forEach(h => { h.value *= (1 + h.rate / 100); });
  });

  return { path, annualDrawn };
}

// Returns ages 0 → (startAge + 45) for chart labels
function getAges(startAge) {
  const end = (startAge || 25) + 45;
  return Array.from({ length: end + 1 }, (_, i) => i);
}

function fmtM(v) {
  const av = Math.abs(v);
  if (av >= 1_000_000) return (v < 0 ? '-' : '') + '$' + (av / 1_000_000).toFixed(2) + 'M';
  if (av >= 1_000)     return (v < 0 ? '-' : '') + '$' + (av / 1_000).toFixed(0) + 'K';
  return (v < 0 ? '-$' : '$') + Math.round(av).toLocaleString();
}
