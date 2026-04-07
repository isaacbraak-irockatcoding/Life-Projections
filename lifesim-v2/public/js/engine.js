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

// Returns the remaining principal balance across all debts at a given age
function getRemainingDebtBalance(debts, age, scenarioStartAge) {
  return (debts || []).reduce((sum, d) => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age < debtStart) return sum; // debt hasn't started yet
    if (!d.monthly_payment || d.monthly_payment <= 0) return sum + (d.balance || 0);
    const r = d.interest_rate / 100 / 12;
    const monthsElapsed = (age - debtStart) * 12;
    let payoffMonths;
    if (r === 0) {
      payoffMonths = (d.balance || 0) / d.monthly_payment;
    } else if (r * (d.balance || 0) >= d.monthly_payment) {
      return sum + (d.balance || 0); // payment never covers interest
    } else {
      payoffMonths = -Math.log(1 - r * (d.balance || 0) / d.monthly_payment) / Math.log(1 + r);
    }
    if (monthsElapsed >= payoffMonths) return sum; // fully paid off
    const remaining = r === 0
      ? Math.max(0, (d.balance || 0) - d.monthly_payment * monthsElapsed)
      : Math.max(0, (d.balance || 0) * Math.pow(1 + r, monthsElapsed)
          - d.monthly_payment * ((Math.pow(1 + r, monthsElapsed) - 1) / r));
    return sum + remaining;
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

// Returns the annual interest accruing on all active debts at a given age
function getDebtInterest(debts, age, scenarioStartAge) {
  return (debts || []).reduce((sum, d) => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age < debtStart) return sum;
    if (!(d.interest_rate > 0)) return sum;
    // No monthly payment — interest accrues on full balance (not being paid down)
    if (!d.monthly_payment || d.monthly_payment <= 0) {
      return sum + (d.balance || 0) * (d.interest_rate / 100);
    }
    const r = d.interest_rate / 100 / 12;
    const yearIndex = age - debtStart;
    let payoffMonths;
    if (r === 0) {
      payoffMonths = d.balance / d.monthly_payment;
    } else if (r * d.balance >= d.monthly_payment) {
      return sum + d.monthly_payment * 12;
    } else {
      payoffMonths = -Math.log(1 - r * d.balance / d.monthly_payment) / Math.log(1 + r);
    }
    if (yearIndex * 12 >= payoffMonths) return sum; // paid off
    const monthsElapsed = yearIndex * 12;
    let remainingBalance;
    if (r === 0) {
      remainingBalance = d.balance - d.monthly_payment * monthsElapsed;
    } else {
      remainingBalance = d.balance * Math.pow(1 + r, monthsElapsed)
        - d.monthly_payment * ((Math.pow(1 + r, monthsElapsed) - 1) / r);
    }
    return sum + Math.max(0, remainingBalance) * (d.interest_rate / 100);
  }, 0);
}

// Returns one-time cost and annual drag from events at a given age
function getEventImpact(age, events) {
  let oneTime = 0, annual = 0;
  (events || []).forEach(ev => {
    if (ev.at_age === age) oneTime += (ev.one_time_cost || 0);
    if (age >= ev.at_age && age < ev.at_age + (ev.duration_years || 1)) annual += (ev.annual_impact || 0);
  });
  return { oneTime, annual };
}

// ── Main projection ────────────────────────────────────────────────────────────
// Each asset compounds at its own expected_return_rate with its annual_contribution.
// Annual salary savings accumulate in a separate savings pool at the scenario return_rate.
// Net worth = sum(asset values) + savingsPool + homeValues - remainingDebtBalances
function calculatePath(scenario) {
  const job = JOBS.find(j => j.id === scenario.job_id) || JOBS[0];
  const effectiveJob = scenario.custom_s0
    ? { ...job, s0: scenario.custom_s0, s35: scenario.custom_s35 || job.s35, s50: scenario.custom_s50 || job.s50 }
    : job;

  const startAge       = scenario.start_age || 25;
  const careerStartAge = scenario.career_start_age ?? 22;
  const returnRate     = scenario.return_rate / 100;
  const savePct        = scenario.save_pct / 100;

  // Individual asset pools — each grows at its own rate with its own annual contribution
  const assetPools = (scenario.assets || [])
    .filter(a => (!a.start_age || a.start_age <= startAge) && !a.event_id)
    .map(a => ({
      id: a.id, start_age: a.start_age,
      rate:   (a.expected_return_rate || 7) / 100,
      contrib: a.annual_contribution || 0,
      value:   a.value || 0,
    }));

  // Savings pool: salary savings accumulate here, compounds at scenario return_rate
  // Starts at 0; debts are tracked as separate liabilities via getRemainingDebtBalance
  let savingsPool = 0;

  const workAges = Array.from({ length: 46 }, (_, i) => startAge + i);
  const path     = new Array(startAge).fill(null);
  let retireBal = null, annualDrawn = 0;
  const homes = []; // { value, rate } — house_purchase events
  const rows  = []; // per-year detail for table view

  workAges.forEach(age => {
    // Register house purchases at the start of this year
    (scenario.events || []).forEach(e => {
      if (e.event_type === 'house_purchase' && e.at_age === age && (e.home_value || 0) > 0) {
        homes.push({ value: e.home_value, rate: e.home_appreciation_rate || 3 });
      }
    });

    // Net worth snapshot (before this year's growth)
    const assetTotal    = assetPools.reduce((s, a) => s + a.value, 0);
    const homeTotal     = homes.reduce((s, h) => s + h.value, 0);
    const remainingDebt = getRemainingDebtBalance(scenario.debts, age, startAge);
    const netWorth      = assetTotal + savingsPool + homeTotal - remainingDebt;
    path.push(Math.round(netWorth));

    const ev = getEventImpact(age, scenario.events);

    // Interest income: sum of each asset's return + positive savings pool return
    const assetInterest  = assetPools.reduce((s, a) => s + a.value * a.rate, 0);
    const poolInterest   = Math.max(0, savingsPool) * returnRate;
    const interestIncome  = Math.round(assetInterest + poolInterest);
    const interestExpense = Math.round(getDebtInterest(scenario.debts, age, startAge));

    // Row variables — hoisted so they're available after the if/else for the row push
    let rowIncome = 0, rowExpenses = 0;

    if (age < scenario.retire_age) {
      const yearsWorked  = age - careerStartAge;
      const salary       = yearsWorked >= 0 ? getSalary(effectiveJob, yearsWorked) : 0;
      const afterTax     = salary > 0 ? calcAfterTaxSalary(salary, scenario.state_code) : 0;
      const debtPayments = getDebtPayments(scenario.debts, age, startAge);
      const available    = Math.max(0, afterTax - debtPayments);
      const savings      = Math.min(afterTax * savePct, available);

      rowIncome   = Math.round(afterTax);
      rowExpenses = Math.round(debtPayments + ev.oneTime + ev.annual);

      // Compound each asset at its own rate + add its annual contribution
      assetPools.forEach(a => {
        a.value = a.value * (1 + a.rate) + a.contrib;
      });

      // Register future assets entering the projection this year
      (scenario.assets || [])
        .filter(a => a.start_age && a.start_age > startAge && a.start_age === age && !a.event_id)
        .forEach(a => assetPools.push({
          id: a.id, start_age: a.start_age,
          rate:   (a.expected_return_rate || 7) / 100,
          contrib: a.annual_contribution || 0,
          value:   a.value || 0,
        }));

      // When income can't fully cover debt payments, draw the shortfall from savings pool
      const debtShortfall = Math.max(0, debtPayments - afterTax);
      // Compound savings pool at scenario rate + deposit savings - events - any debt payment shortfall
      savingsPool = savingsPool * (1 + returnRate) + savings - ev.oneTime - ev.annual - debtShortfall;
    } else {
      // Retirement: compound assets (no new contributions), withdraw from savings pool
      if (retireBal === null) {
        retireBal   = netWorth;
        annualDrawn = retireBal * 0.04;
      }
      rowExpenses = Math.round(annualDrawn);
      assetPools.forEach(a => { a.value = a.value * (1 + a.rate); });
      savingsPool = savingsPool * (1 + returnRate) - annualDrawn;
    }

    // Appreciate homes at end of each year
    homes.forEach(h => { h.value *= (1 + h.rate / 100); });

    // Closing balance (end-of-year) for table — computed after all updates
    const closingAssets  = assetPools.reduce((s, a) => s + a.value, 0);
    const closingHomes   = homes.reduce((s, h) => s + h.value, 0);
    const closingDebt    = getRemainingDebtBalance(scenario.debts, age + 1, startAge);
    const closingBalance = Math.round(closingAssets + savingsPool + closingHomes - closingDebt);
    rows.push({ age, income: rowIncome, interestIncome, expenses: rowExpenses, interestExpense, balance: closingBalance });
  });

  return { path, annualDrawn, rows };
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
