/* ══════════════════════════════════════════════
   mc.worker.js — Monte Carlo simulation worker
   Self-contained: duplicates helpers from engine.js
   intentionally to avoid importScripts complexity.
══════════════════════════════════════════════ */

function getSalary(job, yearsWorked) {
  if (yearsWorked <= 0)  return job.s0;
  if (yearsWorked <= 35) return job.s0 + (job.s35 - job.s0) * (yearsWorked / 35);
  return job.s35 + (job.s50 - job.s35) * Math.min((yearsWorked - 35) / 15, 1);
}

function getEventImpact(age, events) {
  let oneTime = 0, annual = 0;
  (events || []).forEach(ev => {
    if (ev.at_age === age) oneTime += (ev.one_time_cost || 0);
    if (age >= ev.at_age && age < ev.at_age + (ev.duration_years || 1)) annual += (ev.annual_impact || 0);
  });
  return { oneTime, annual };
}

function getDebtPayments(debts, age, scenarioStartAge) {
  return (debts || []).reduce((sum, d) => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age < debtStart) return sum;
    if (!d.monthly_payment || d.monthly_payment <= 0) return sum;
    const yearIndex = age - debtStart;
    const r = d.interest_rate / 100 / 12;
    let payoffMonths;
    if (r === 0) {
      payoffMonths = d.balance / d.monthly_payment;
    } else if (r * d.balance >= d.monthly_payment) {
      return sum + d.monthly_payment * 12;
    } else {
      payoffMonths = -Math.log(1 - r * d.balance / d.monthly_payment) / Math.log(1 + r);
    }
    return yearIndex * 12 < payoffMonths ? sum + d.monthly_payment * 12 : sum;
  }, 0);
}

function getRemainingDebtBalance(debts, age, scenarioStartAge) {
  return (debts || []).reduce((sum, d) => {
    const debtStart = d.start_age || scenarioStartAge;
    if (age < debtStart) return sum;
    if (!d.monthly_payment || d.monthly_payment <= 0) return sum + (d.balance || 0);
    const r = d.interest_rate / 100 / 12;
    const monthsElapsed = (age - debtStart) * 12;
    let payoffMonths;
    if (r === 0) {
      payoffMonths = (d.balance || 0) / d.monthly_payment;
    } else if (r * (d.balance || 0) >= d.monthly_payment) {
      return sum + (d.balance || 0);
    } else {
      payoffMonths = -Math.log(1 - r * (d.balance || 0) / d.monthly_payment) / Math.log(1 + r);
    }
    if (monthsElapsed >= payoffMonths) return sum;
    const remaining = r === 0
      ? Math.max(0, (d.balance || 0) - d.monthly_payment * monthsElapsed)
      : Math.max(0, (d.balance || 0) * Math.pow(1 + r, monthsElapsed)
          - d.monthly_payment * ((Math.pow(1 + r, monthsElapsed) - 1) / r));
    return sum + remaining;
  }, 0);
}

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

function calcAfterTaxSalary(gross, stateCode) {
  const federal = calcFederalTax(gross);
  const state   = gross * (STATE_TAX_RATES[stateCode || 'none'] ?? 0);
  return Math.max(0, gross - federal - state);
}

// Box-Muller normal distribution generator
function randNormal(mean, std) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const JOBS = [
  { id: 'sw_eng',      s0: 95000,  s35: 195000, s50: 220000 },
  { id: 'nurse',       s0: 72000,  s35: 115000, s50: 128000 },
  { id: 'electrician', s0: 55000,  s35: 95000,  s50: 106000 },
  { id: 'acc',         s0: 65000,  s35: 140000, s50: 158000 },
  { id: 'teacher',     s0: 44000,  s35: 74000,  s50: 80000  },
  { id: 'doctor',      s0: 120000, s35: 280000, s50: 315000 },
  { id: 'plumber',     s0: 52000,  s35: 90000,  s50: 100000 },
  { id: 'designer',    s0: 78000,  s35: 150000, s50: 168000 },
  { id: 'lawyer',      s0: 80000,  s35: 210000, s50: 250000 },
  { id: 'custom',      s0: 60000,  s35: 100000, s50: 115000 },
];

onmessage = function({ data: { scenario, vol, simCount } }) {
  const base = JOBS.find(j => j.id === scenario.job_id) || JOBS[0];
  const job  = scenario.custom_s0
    ? { ...base, s0: scenario.custom_s0, s35: scenario.custom_s35 || base.s35, s50: scenario.custom_s50 || base.s50 }
    : base;

  const volDecimal     = (vol || 12) / 100;
  const startAge       = scenario.start_age || 25;
  const careerStartAge = scenario.career_start_age ?? 22;
  const retireAge      = scenario.retire_age || 65;
  const returnRate     = scenario.return_rate / 100;
  const savePct        = scenario.save_pct / 100;
  const ages = Array.from({ length: 46 }, (_, i) => startAge + i);

  // Snapshot of initial asset pool definitions (deep-copied per simulation)
  const initialPools = (scenario.assets || [])
    .filter(a => (!a.start_age || a.start_age <= startAge) && !a.event_id)
    .map(a => ({
      id: a.id, start_age: a.start_age,
      rate:    (a.expected_return_rate || 7) / 100,
      contrib: a.annual_contribution || 0,
      value:   a.value || 0,
    }));

  const paths = [];

  for (let sim = 0; sim < simCount; sim++) {
    // Deep copy asset pools for this simulation run
    const assetPools = initialPools.map(a => ({ ...a }));
    let savingsPool  = 0;
    let retBal = null, drawn = 0;
    const homes = [];
    const path  = [];

    ages.forEach(age => {
      // Register house purchases
      (scenario.events || []).forEach(e => {
        if (e.event_type === 'house_purchase' && e.at_age === age && (e.home_value || 0) > 0) {
          homes.push({ value: e.home_value, rate: e.home_appreciation_rate || 3 });
        }
      });

      const assetTotal    = assetPools.reduce((s, a) => s + a.value, 0);
      const homeTotal     = homes.reduce((s, h) => s + h.value, 0);
      const remainingDebt = getRemainingDebtBalance(scenario.debts, age, startAge);
      const netWorth      = assetTotal + savingsPool + homeTotal - remainingDebt;
      path.push(Math.round(netWorth));

      // Single market shock per year — applies to all assets (correlated market)
      const shock = randNormal(0, volDecimal);
      const ev = getEventImpact(age, scenario.events);

      if (age < retireAge) {
        const yearsWorked  = Math.max(0, age - careerStartAge);
        const sal          = getSalary(job, yearsWorked);
        const afterTax     = calcAfterTaxSalary(sal, scenario.state_code);
        const debtPayments = getDebtPayments(scenario.debts, age, startAge);
        const available    = Math.max(0, afterTax - debtPayments);
        const savings      = Math.min(afterTax * savePct, available);

        // Each asset grows at its own rate ± market shock, plus contribution
        assetPools.forEach(a => {
          a.value = a.value * (1 + a.rate + shock) + a.contrib;
        });

        // Future assets entering this year
        (scenario.assets || [])
          .filter(a => a.start_age && a.start_age > startAge && a.start_age === age && !a.event_id)
          .forEach(a => assetPools.push({
            id: a.id, start_age: a.start_age,
            rate:    (a.expected_return_rate || 7) / 100,
            contrib: a.annual_contribution || 0,
            value:   a.value || 0,
          }));

        savingsPool = savingsPool * (1 + returnRate + shock) + savings - ev.oneTime - ev.annual;
      } else {
        if (retBal === null) { retBal = netWorth; drawn = retBal * 0.04; }
        assetPools.forEach(a => {
          a.value = Math.max(0, a.value * (1 + a.rate + shock));
        });
        savingsPool = savingsPool * (1 + returnRate + shock) - drawn;
      }

      homes.forEach(h => { h.value *= (1 + h.rate / 100); });
    });

    paths.push(path);
  }

  const percentiles = [10, 25, 50, 75, 90];
  const bands = percentiles.map(p =>
    ages.map((_, i) => {
      const vals = paths.map(path => path[i]).sort((a, b) => a - b);
      return vals[Math.floor(p / 100 * vals.length)];
    })
  );

  postMessage({ ages, bands });
};
