/* ══════════════════════════════════════════════
   montecarlo.js — Monte Carlo simulation
══════════════════════════════════════════════ */

function setMcPath(idx) {
    ST.mcPath = idx;
    ['a', 'b', 'c'].forEach((l, i) => {
      const btn = document.getElementById(`mc-btn-${l}`);
      if (!btn) return;
      const active = i === idx;
      btn.style.background  = active ? 'rgba(0,212,170,.15)' : '';
      btn.style.borderColor = active ? 'var(--teal)' : '';
      btn.style.color       = active ? 'var(--teal)' : '';
    });
    runMonteCarlo();
  }
  
  function randNormal(mean, std) {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  
  function runMonteCarlo() {
    const s    = ST.scenarios[ST.mcPath] || ST.scenarios[0];
    const ages = getAges();
    const SIM  = 1000;
    const vol  = parseFloat(document.getElementById('vol-slider').value) / 100;
    const job  = JOBS.find(j => j.id === s.jobId) || JOBS[0];
  
    document.getElementById('mc-sim-label').textContent = `${SIM.toLocaleString()} simulations`;
  
    const paths = [];
    for (let sim = 0; sim < SIM; sim++) {
      let wealth = s.currentAssets - s.currentDebt;
      let retBal = null, drawn = 0;
      const path = [];
      ages.forEach((age, y) => {
        path.push(Math.round(wealth));
        const r  = randNormal(s.returnRate / 100, vol);
        const ev = getEventImpact(age, ST.mcPath);
        if (age < s.retireAge) {
          const sal = getSalary(job, y);
          wealth = wealth * (1 + r) + sal * (s.savePct / 100) - ev.oneTime - ev.annual;
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
  
    drawMcChart(ages, bands, s.color);
    renderProbBars(bands, ages, s);
  }
  
  function drawMcChart(ages, bands, color) {
    const datasets = [
      { label:'90th',   data:bands[4], borderColor:'transparent', backgroundColor:color+'22', fill:'+1', pointRadius:0, tension:0.35 },
      { label:'75th',   data:bands[3], borderColor:'transparent', backgroundColor:color+'33', fill:'+1', pointRadius:0, tension:0.35 },
      { label:'Median', data:bands[2], borderColor:color,         backgroundColor:'transparent', fill:false, borderWidth:2.5, pointRadius:0, tension:0.35 },
      { label:'25th',   data:bands[1], borderColor:'transparent', backgroundColor:color+'33', fill:'+1', pointRadius:0, tension:0.35 },
      { label:'10th',   data:bands[0], borderColor:'transparent', backgroundColor:color+'22', fill:false, pointRadius:0, tension:0.35 },
    ];
  
    if (charts.mc) charts.mc.destroy();
    charts.mc = new Chart(document.getElementById('mcChart').getContext('2d'), {
      type: 'line',
      data: { labels: ages, datasets },
      options: {
        responsive: true,
        scales: {
          y: { grid:{ color:'#1a1e32' }, ticks:{ color:'#4a5370', callback: v =>
            v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v }},
          x: { grid:{ display:false }, ticks:{ color:'#4a5370', maxTicksLimit:8 }},
        },
        plugins: { legend:{ display:false },
          tooltip:{ backgroundColor:'#141720', borderColor:'#1c2038', borderWidth:1,
            titleColor:'#7a83a8', bodyColor:'#dde3f5' }},
      },
    });
  }
  
  function renderProbBars(bands, ages, s) {
    const retIdx  = Math.min(s.retireAge - ST.startAge, ages.length - 1);
    const allVals = bands.map(b => b[retIdx]);
    const targets = [500000, 1000000, 2000000, 5000000];
    const color   = s.color;
  
    function probAbove(target) {
      const pts = [[10,allVals[0]],[25,allVals[1]],[50,allVals[2]],[75,allVals[3]],[90,allVals[4]]];
      if (target <= pts[0][1]) return 90;
      if (target >= pts[4][1]) return 10;
      for (let i = 0; i < pts.length - 1; i++) {
        if (target >= pts[i][1] && target <= pts[i+1][1]) {
          const t = (target - pts[i][1]) / (pts[i+1][1] - pts[i][1]);
          return Math.round(pts[i][0] + t * (pts[i+1][0] - pts[i][0]));
        }
      }
      return 50;
    }
  
    document.getElementById('mc-prob-bars').innerHTML =
      `<div style="margin-bottom:10px;"><span class="micro">Probability of reaching wealth target by retirement</span></div>` +
      targets.map(t => {
        const prob = 100 - probAbove(t);
        return `<div class="prob-bar-wrap">
          <div class="prob-label">
            <span style="color:var(--muted2);font-size:12px;">${fmtM(t)}</span>
            <span class="num" style="font-size:12px;color:${color}">${prob}%</span>
          </div>
          <div class="prob-bar">
            <div class="prob-fill" style="width:${prob}%;background:linear-gradient(90deg,${color}88,${color});"></div>
          </div>
        </div>`;
      }).join('');
  }