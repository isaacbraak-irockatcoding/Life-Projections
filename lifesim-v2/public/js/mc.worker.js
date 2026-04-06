/* ══════════════════════════════════════════════
   mc.worker.js — Monte Carlo simulation worker
   Self-contained: duplicates getSalary and
   getEventImpact from engine.js intentionally
   to avoid importScripts complexity.
══════════════════════════════════════════════ */

// Duplicated from engine.js (intentional — Web Worker isolation)
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

function collapseBalanceSheet(scenario) {
  const s = scenario.start_age || 25;
  const currentAssets = (scenario.assets || [])
    .filter(a => !a.start_age || a.start_age <= s)
    .reduce((sum, a) => sum + (a.value || 0), 0);
  const currentDebt = (scenario.debts || [])
    .filter(d => !d.start_age || d.start_age <= s)
    .reduce((sum, d) => sum + (d.balance || 0), 0);
  return { currentAssets, currentDebt };
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

// Box-Muller normal distribution generator
function randNormal(mean, std) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// JOBS list (duplicated subset — only id and salary fields needed)
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
  const job = (() => {
    const base = JOBS.find(j => j.id === scenario.job_id) || JOBS[0];
    if (scenario.job_id === 'custom' && scenario.custom_s0) {
      return { ...base, s0: scenario.custom_s0, s35: scenario.custom_s35 || base.s35, s50: scenario.custom_s50 || base.s50 };
    }
    return base;
  })();

  const { currentAssets, currentDebt } = collapseBalanceSheet(scenario);
  const volDecimal     = (vol || 12) / 100;
  const startAge       = scenario.start_age || 25;
  const careerStartAge = scenario.career_start_age ?? 22;
  const ages = Array.from({ length: 46 }, (_, i) => startAge + i);

  const paths = [];
  for (let sim = 0; sim < simCount; sim++) {
    let wealth = currentAssets - currentDebt;
    let retBal = null, drawn = 0;
    const path = [];
    ages.forEach((age, y) => {
      path.push(Math.round(wealth));
      const r  = randNormal(scenario.return_rate / 100, volDecimal);
      const ev = getEventImpact(age, scenario.events);
      if (age < scenario.retire_age) {
        const yearsWorked  = Math.max(0, age - careerStartAge);
        const sal          = getSalary(job, yearsWorked);
        const afterTax     = calcAfterTaxSalary(sal, scenario.state_code);
        const debtPayments = getDebtPayments(scenario.debts, age, startAge);
        const available    = Math.max(0, afterTax - debtPayments);
        const savings      = Math.min(afterTax * (scenario.save_pct / 100), available);
        const futureAssets = (scenario.assets || [])
          .filter(a => a.start_age && a.start_age > startAge && a.start_age === age)
          .reduce((sum, a) => sum + (a.value || 0), 0);
        const futureDebts  = (scenario.debts || [])
          .filter(d => d.start_age && d.start_age > startAge && d.start_age === age)
          .reduce((sum, d) => sum + (d.balance || 0), 0);
        wealth = wealth * (1 + r) + savings + futureAssets - futureDebts - ev.oneTime - ev.annual;
      } else {
        if (retBal === null) { retBal = wealth; drawn = retBal * 0.04; }
        wealth = wealth * (1 + r) - drawn;
        if (wealth < 0) wealth = 0;
      }
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
