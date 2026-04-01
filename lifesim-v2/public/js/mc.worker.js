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
  const currentAssets = (scenario.assets || []).reduce((sum, a) => sum + (a.value || 0), 0);
  const currentDebt   = (scenario.debts  || []).reduce((sum, d) => sum + (d.balance || 0), 0);
  return { currentAssets, currentDebt };
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
  const volDecimal = (vol || 12) / 100;
  const startAge = scenario.start_age || 25;
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
        const sal = getSalary(job, y);
        wealth = wealth * (1 + r) + sal * (scenario.save_pct / 100) - ev.oneTime - ev.annual;
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
