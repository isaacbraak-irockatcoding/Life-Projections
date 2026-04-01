/* ══════════════════════════════════════════════
   engine.js — Math engine, onboarding, formatters
   All financial calculations live here.
   Nothing in this file touches the DOM directly.
══════════════════════════════════════════════ */

function initSetup() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = '';
    AVATARS.forEach(a => {
      const d = document.createElement('div');
      d.className = 'avatar-item' + (a === selectedAvatar ? ' sel' : '');
      d.textContent = a;
      d.onclick = () => {
        document.querySelectorAll('.avatar-item').forEach(el => el.classList.remove('sel'));
        d.classList.add('sel');
        selectedAvatar = a;
      };
      grid.appendChild(d);
    });
  }
  
  function completeSetup() {
    const name = document.getElementById('setup-name').value.trim();
    const age  = parseInt(document.getElementById('setup-age').value) || 25;
    const nw   = parseFloat(document.getElementById('setup-nw').value) || 0;
    if (!name) { alert('Please enter your name'); return; }
  
    ST.user     = { name, avatar: selectedAvatar, age };
    ST.startAge = age;
    ST.scenarios.forEach(s => { s.currentAssets = Math.max(0, nw); });
  
    localStorage.setItem('ls_user', JSON.stringify(ST.user));
    save();
  
    document.getElementById('screen-setup').style.display = 'none';
    document.getElementById('main-nav').style.display = 'flex';
    switchTab('proj');
  }
  
  // Salary interpolation: start → year 35 peak → year 50 true peak
  function getSalary(job, yearsWorked) {
    if (yearsWorked <= 0)  return job.s0;
    if (yearsWorked <= 35) return job.s0 + (job.s35 - job.s0) * (yearsWorked / 35);
    return job.s35 + (job.s50 - job.s35) * Math.min((yearsWorked - 35) / 15, 1);
  }
  
  // Returns one-time cost and annual drag from events at a given age
  function getEventImpact(age, scenarioIdx) {
    let oneTime = 0, annual = 0;
    ST.events.forEach(ev => {
      const applies = ev.applies === 'all' || parseInt(ev.applies) === scenarioIdx;
      if (!applies) return;
      if (ev.age === age) oneTime += (ev.cost || 0);
      if (age >= ev.age && age < ev.age + (ev.years || 1)) annual += (ev.annual || 0);
    });
    return { oneTime, annual };
  }
  
  // Main projection: returns { path, annualDrawn }
  function calculatePath(s, idx) {
    const job    = JOBS.find(j => j.id === s.jobId) || JOBS[0];
    let wealth   = s.currentAssets - s.currentDebt;
    const ages   = getAges();
    const path   = [];
    let retireBal = null, annualDrawn = 0;
  
    ages.forEach((age, y) => {
      path.push(Math.round(wealth));
      const ev = getEventImpact(age, idx);
  
      if (age < s.retireAge) {
        const salary = getSalary(job, y);
        wealth = wealth * (1 + s.returnRate / 100)
               + salary * (s.savePct / 100)
               - ev.oneTime - ev.annual;
      } else {
        if (retireBal === null) { retireBal = wealth; annualDrawn = retireBal * 0.04; }
        wealth = wealth * (1 + s.returnRate / 100) - annualDrawn;
        if (wealth < 0) wealth = 0;
      }
    });
  
    return { path, annualDrawn };
  }
  
  function getAges() {
    return Array.from({ length: 46 }, (_, i) => ST.startAge + i);
  }
  
  function applyInflation(path) {
    if (!ST.inflation) return path;
    return path.map((v, i) => Math.round(v / Math.pow(1.025, i)));
  }
  
  function fmtM(v) {
    const av = Math.abs(v);
    if (av >= 1_000_000) return (v < 0 ? '-' : '') + '$' + (av / 1_000_000).toFixed(2) + 'M';
    if (av >= 1_000)     return (v < 0 ? '-' : '') + '$' + (av / 1_000).toFixed(0) + 'K';
    return '$' + Math.round(v).toLocaleString();
  }