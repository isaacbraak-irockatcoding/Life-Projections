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
function collapseBalanceSheet(scenario) {
  const currentAssets = (scenario.assets || []).reduce((sum, a) => sum + (a.value || 0), 0);
  const currentDebt   = (scenario.debts  || []).reduce((sum, d) => sum + (d.balance || 0), 0);
  return { currentAssets, currentDebt };
}

// Returns total annual debt payments still owed at simulation year `yearIndex`
// Payments drop to 0 once a debt is paid off (based on amortization schedule from current balance)
function getDebtPayments(debts, yearIndex) {
  return (debts || []).reduce((sum, d) => {
    if (!d.monthly_payment || d.monthly_payment <= 0) return sum;
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
  const startAge = scenario.start_age || 25;
  const workAges = Array.from({ length: 46 }, (_, i) => startAge + i);
  const path     = new Array(startAge).fill(null); // nulls before user's age
  let retireBal = null, annualDrawn = 0;

  workAges.forEach((age, y) => {
    path.push(Math.round(wealth));
    const ev = getEventImpact(age, scenario.events);

    if (age < scenario.retire_age) {
      const salary       = getSalary(effectiveJob, y);
      const debtPayments = getDebtPayments(scenario.debts, y);
      const savings      = Math.max(0, salary - (scenario.annual_expenses || 0) - debtPayments);
      wealth = wealth * (1 + scenario.return_rate / 100)
             + savings
             - ev.oneTime - ev.annual;
    } else {
      if (retireBal === null) { retireBal = wealth; annualDrawn = retireBal * 0.04; }
      wealth = wealth * (1 + scenario.return_rate / 100) - annualDrawn;
    }
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
