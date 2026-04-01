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
  const effectiveJob = scenario.job_id === 'custom' && scenario.custom_s0
    ? { ...job, s0: scenario.custom_s0, s35: scenario.custom_s35 || job.s35, s50: scenario.custom_s50 || job.s50 }
    : job;

  const { currentAssets, currentDebt } = collapseBalanceSheet(scenario);
  let wealth   = currentAssets - currentDebt;
  const ages   = getAges(scenario.start_age);
  const path   = [];
  let retireBal = null, annualDrawn = 0;

  ages.forEach((age, y) => {
    path.push(Math.round(wealth));
    const ev = getEventImpact(age, scenario.events);

    if (age < scenario.retire_age) {
      const salary = getSalary(effectiveJob, y);
      wealth = wealth * (1 + scenario.return_rate / 100)
             + salary * (scenario.save_pct / 100)
             - ev.oneTime - ev.annual;
    } else {
      if (retireBal === null) { retireBal = wealth; annualDrawn = retireBal * 0.04; }
      wealth = wealth * (1 + scenario.return_rate / 100) - annualDrawn;
      if (wealth < 0) wealth = 0;
    }
  });

  return { path, annualDrawn };
}

function getAges(startAge) {
  return Array.from({ length: 46 }, (_, i) => (startAge || 25) + i);
}

function applyInflation(path, on) {
  if (!on) return path;
  return path.map((v, i) => Math.round(v / Math.pow(1.025, i)));
}

function fmtM(v) {
  const av = Math.abs(v);
  if (av >= 1_000_000) return (v < 0 ? '-' : '') + '$' + (av / 1_000_000).toFixed(2) + 'M';
  if (av >= 1_000)     return (v < 0 ? '-' : '') + '$' + (av / 1_000).toFixed(0) + 'K';
  return (v < 0 ? '-$' : '$') + Math.round(av).toLocaleString();
}
