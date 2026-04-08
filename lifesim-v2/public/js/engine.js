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
    if (age <= debtStart) return sum; // debt hasn't started yet
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

function getRemainingDebtBreakdown(debts, age, scenarioStartAge) {
  return (debts || []).map(d => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age <= debtStart) return null;
    if (!d.monthly_payment || d.monthly_payment <= 0) return { label: d.label, value: d.balance || 0 };
    const r = d.interest_rate / 100 / 12;
    const monthsElapsed = (age - debtStart) * 12;
    let payoffMonths;
    if (r === 0) {
      payoffMonths = (d.balance || 0) / d.monthly_payment;
    } else if (r * (d.balance || 0) >= d.monthly_payment) {
      return { label: d.label, value: d.balance || 0 };
    } else {
      payoffMonths = -Math.log(1 - r * (d.balance || 0) / d.monthly_payment) / Math.log(1 + r);
    }
    if (monthsElapsed >= payoffMonths) return null;
    const remaining = r === 0
      ? Math.max(0, (d.balance || 0) - d.monthly_payment * monthsElapsed)
      : Math.max(0, (d.balance || 0) * Math.pow(1 + r, monthsElapsed)
          - d.monthly_payment * ((Math.pow(1 + r, monthsElapsed) - 1) / r));
    return remaining > 0 ? { label: d.label, value: Math.round(remaining) } : null;
  }).filter(Boolean);
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

// Returns per-debt annual interest breakdown at a given age
function getDebtInterestBreakdown(debts, age, scenarioStartAge) {
  const result = [];
  (debts || []).forEach(d => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age < debtStart) return;
    if (!(d.interest_rate > 0) && !(d.monthly_payment > 0)) return;
    const r = d.interest_rate / 100 / 12;
    if (!d.monthly_payment || d.monthly_payment <= 0) {
      const annualInterest = (d.balance || 0) * (d.interest_rate / 100);
      result.push({ label: d.label, interest: Math.round(annualInterest), principal: 0, total: Math.round(annualInterest) });
      return;
    }
    let payoffMonths;
    if (r === 0) {
      payoffMonths = d.balance / d.monthly_payment;
    } else if (r * d.balance >= d.monthly_payment) {
      result.push({ label: d.label, interest: Math.round(d.monthly_payment * 12), principal: 0, total: Math.round(d.monthly_payment * 12) });
      return;
    } else {
      payoffMonths = -Math.log(1 - r * d.balance / d.monthly_payment) / Math.log(1 + r);
    }
    const monthsElapsed = (age - debtStart) * 12;
    if (monthsElapsed >= payoffMonths) return;
    const remaining = r === 0
      ? d.balance - d.monthly_payment * monthsElapsed
      : d.balance * Math.pow(1 + r, monthsElapsed) - d.monthly_payment * ((Math.pow(1 + r, monthsElapsed) - 1) / r);
    const annualInterest  = Math.round(Math.max(0, remaining) * (d.interest_rate / 100));
    const annualTotal     = Math.round(d.monthly_payment * 12);
    const annualPrincipal = Math.max(0, annualTotal - annualInterest);
    result.push({ label: d.label, interest: annualInterest, principal: annualPrincipal, total: annualTotal });
  });
  return result;
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

// Superset of getEventImpact — returns per-event detail arrays plus the same scalar totals
// Also computes spouse income for marriage events dynamically via getSalary()
function getEventImpactDetail(age, events) {
  const oneTimeItems = [], annualItems = [], spouseIncomeItems = [];
  let oneTime = 0, annual = 0, spouseIncome = 0;
  (events || []).forEach(ev => {
    if (ev.at_age === age && (ev.one_time_cost || 0) !== 0) {
      oneTimeItems.push({ name: ev.name || ev.emoji || 'Event', amount: ev.one_time_cost });
      oneTime += ev.one_time_cost;
    }
    if (age >= ev.at_age && age < ev.at_age + (ev.duration_years || 1)) {
      if ((ev.annual_impact || 0) !== 0) {
        annualItems.push({ name: ev.name || ev.emoji || 'Event', amount: ev.annual_impact });
        annual += ev.annual_impact;
      }
      // Spouse income for marriage events — computed dynamically from career curve (after tax)
      if (ev.event_type === 'marriage' && ev.spouse_job_id) {
        const spouseJobBase = JOBS.find(j => j.id === ev.spouse_job_id) || JOBS[0];
        const spouseJob = ev.spouse_s0 != null
          ? { ...spouseJobBase, s0: ev.spouse_s0, s35: ev.spouse_s35 || spouseJobBase.s35, s50: ev.spouse_s50 || spouseJobBase.s50 }
          : spouseJobBase;
        const spouseYrsWorked = age - (ev.spouse_career_start_age ?? 22);
        if (spouseYrsWorked >= 0) {
          const grossSalary = getSalary(spouseJob, spouseYrsWorked);
          const amount = Math.round(calcAfterTaxSalary(grossSalary, scenario.state_code));
          spouseIncomeItems.push({ name: `${ev.name || 'Spouse'} — Income`, amount });
          spouseIncome += amount;
        }
      }
    }
  });
  return { oneTime, annual, oneTimeItems, annualItems, spouseIncome, spouseIncomeItems };
}

// ── Main projection ────────────────────────────────────────────────────────────
// Each asset compounds at its own expected_return_rate with its annual_contribution.
// Leftover cash (income − debt payments − events − asset contribs) accumulates in a
// cash pool at 0% return. Net worth = sum(asset values) + cashPool + homeValues − remainingDebt
function calculatePath(scenario) {
  const job = JOBS.find(j => j.id === scenario.job_id) || JOBS[0];
  const effectiveJob = scenario.custom_s0
    ? { ...job, s0: scenario.custom_s0, s35: scenario.custom_s35 || job.s35, s50: scenario.custom_s50 || job.s50 }
    : job;

  const startAge       = scenario.start_age || 25;
  const careerStartAge = scenario.career_start_age ?? 22;

  // Individual asset pools — each grows at its own rate with its own annual contribution
  const assetPools = (scenario.assets || [])
    .filter(a => (!a.start_age || a.start_age <= startAge) && !a.event_id)
    .map(a => ({
      id: a.id, start_age: a.start_age,
      rate:   (a.expected_return_rate || 7) / 100,
      contrib: a.annual_contribution || 0,
      value:   a.value || 0,
    }));

  // Cash pool: leftover income after all outflows accumulates here at 0% return
  // Debts are tracked as separate liabilities via getRemainingDebtBalance
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
        homes.push({ value: e.home_value, rate: e.home_appreciation_rate || 3, name: e.name || 'Home' });
      }
    });

    // Net worth snapshot (before this year's growth) — used for retirement calculation
    const assetTotal    = assetPools.reduce((s, a) => s + a.value, 0);
    const homeTotal     = homes.reduce((s, h) => s + h.value, 0);
    const remainingDebt = getRemainingDebtBalance(scenario.debts, age, startAge);
    const netWorth      = assetTotal + savingsPool + homeTotal - remainingDebt;

    const ev = getEventImpactDetail(age, scenario.events);

    // Interest income: sum of each asset's return (cash pool earns 0%)
    const assetInterest      = assetPools.reduce((s, a) => s + a.value * a.rate, 0);
    const assetInterestIncome = Math.round(assetInterest);
    const poolInterestIncome  = 0;
    const interestIncome      = assetInterestIncome;
    const debtInterestBreakdown = getDebtInterestBreakdown(scenario.debts, age, startAge);
    const interestExpense = Math.round(debtInterestBreakdown.reduce((s, d) => s + d.interest, 0));

    // Row variables — hoisted so they're available after the if/else for the row push
    let rowIncome = 0, rowExpenses = 0;
    let debtPayments = 0;
    const isRetired = age >= scenario.retire_age;

    if (!isRetired) {
      const yearsWorked  = age - careerStartAge;
      const salary       = yearsWorked >= 0 ? getSalary(effectiveJob, yearsWorked) : 0;
      const afterTax     = salary > 0 ? calcAfterTaxSalary(salary, scenario.state_code) : 0;
      debtPayments = getDebtPayments(scenario.debts, age, startAge);

      rowIncome   = Math.round(afterTax + ev.spouseIncome);
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

      // All leftover cash (after debt payments, events, asset contribs) accumulates at 0%
      const totalAssetContribsNow = assetPools.reduce((s, a) => s + a.contrib, 0);
      const netCashToPool = afterTax + ev.spouseIncome - debtPayments - ev.oneTime - ev.annual - totalAssetContribsNow;
      savingsPool = savingsPool + netCashToPool;
    } else {
      // Retirement: compound assets (no new contributions), withdraw from cash pool
      if (retireBal === null) {
        retireBal   = netWorth;
        annualDrawn = retireBal * 0.04;
      }
      rowExpenses = Math.round(annualDrawn);
      assetPools.forEach(a => { a.value = a.value * (1 + a.rate); });
      savingsPool = savingsPool - annualDrawn;
    }

    // Appreciate homes at end of each year
    homes.forEach(h => { h.value *= (1 + h.rate / 100); });

    // Closing balance (end-of-year) for table — computed after all updates
    const closingAssets  = assetPools.reduce((s, a) => s + a.value, 0);
    const closingHomes   = homes.reduce((s, h) => s + h.value, 0);
    const closingDebt    = getRemainingDebtBalance(scenario.debts, age + 1, startAge);
    const closingBalance = Math.round(closingAssets + savingsPool + closingHomes - closingDebt);
    path.push(closingBalance);
    const assetBreakdown = assetPools.map(a => ({
      name: ((scenario.assets || []).find(x => x.id === a.id) || {}).label || 'Asset',
      value: Math.round(a.value),
    }));
    const homeBreakdown = homes.map(h => ({ name: h.name, value: Math.round(h.value) }));
    const liabilityBreakdown = getRemainingDebtBreakdown(scenario.debts, age + 1, startAge);

    const cashValue   = savingsPool >= 0 ? Math.round(savingsPool) : 0;
    const deficitValue = savingsPool < 0 ? Math.round(Math.abs(savingsPool)) : 0;
    if (deficitValue > 0) liabilityBreakdown.unshift({ label: 'Cash Deficit', value: deficitValue });

    const totalAssetContribs = isRetired ? 0 : assetPools.reduce((s, a) => s + a.contrib, 0);
    const assetContribBreakdown = isRetired ? [] : assetPools
      .map(a => ({ name: ((scenario.assets || []).find(x => x.id === a.id) || {}).label || 'Asset', contrib: a.contrib }))
      .filter(a => a.contrib > 0);

    rows.push({
      age,
      income: rowIncome,
      interestIncome,
      expenses: rowExpenses,
      interestExpense,
      balance: closingBalance,
      savingsPool: cashValue,
      assetBreakdown,
      homeBreakdown,
      liabilityBreakdown,
      totalAssets: Math.round(closingAssets + savingsPool + closingHomes),
      totalLiabilities: Math.round(closingDebt),
      // Cashflow fields
      isRetired,
      debtPayments:          Math.round(debtPayments),
      debtInterestBreakdown,
      debtPrincipalPayments: Math.round(Math.max(0, debtPayments - interestExpense)),
      totalAssetContribs:    Math.round(totalAssetContribs),
      assetContribBreakdown,
      eventOneTimeItems:     ev.oneTimeItems,
      eventAnnualItems:      ev.annualItems,
      retirementWithdrawal:  isRetired ? Math.round(annualDrawn) : 0,
      spouseIncome:          isRetired ? 0 : Math.round(ev.spouseIncome || 0),
      spouseIncomeItems:     isRetired ? [] : (ev.spouseIncomeItems || []),
      assetInterestIncome,
      poolInterestIncome,
    });
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
