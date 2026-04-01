/* ══════════════════════════════════════════════
   montecarlo.js — Thin orchestrator
   Delegates all simulation math to mc.worker.js
══════════════════════════════════════════════ */

function renderMcTab() {
  const scenario = State.getScenario();
  if (!scenario) return;
  // Render scenario selector buttons
  const list = State.getScenarioList().filter(s => s.events !== undefined);
  const container = document.getElementById('mc-scenario-btns');
  if (container) {
    const mcPath = State.getMcPath();
    container.innerHTML = list.map((s, i) => {
      const color = s.color || '#00d4aa';
      const active = i === mcPath;
      return `<button class="btn btn-ghost btn-sm" id="mc-btn-${i}"
        style="${active ? `background:${color}18;border-color:${color};color:${color}` : ''}"
        onclick="setMcPath(${i})">${s.name}</button>`;
    }).join('');
  }
}

function setMcPath(idx) {
  State.setMcPath(idx);
  renderMcTab();
  runMonteCarlo();
}

function runMonteCarlo() {
  const list     = State.getScenarioList().filter(s => s.events !== undefined);
  const scenario = list[State.getMcPath()] || State.getScenario();
  if (!scenario) return;

  const vol      = State.getMcVolatility();
  const simCount = 1000;

  document.getElementById('mc-sim-label').textContent = `${simCount.toLocaleString()} simulations`;

  const worker = new Worker('/js/mc.worker.js');
  worker.postMessage({ scenario, vol, simCount });
  worker.onmessage = ({ data }) => {
    drawMcChart(data.ages, data.bands, scenario.color || '#00d4aa');
    renderProbBars(data.bands, data.ages, scenario);
    worker.terminate();
  };
  worker.onerror = (e) => { showToast('Simulation failed: ' + e.message, true); worker.terminate(); };
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

function renderProbBars(bands, ages, scenario) {
  const startAge = scenario.start_age || 25;
  const retIdx   = Math.min((scenario.retire_age || 65) - startAge, ages.length - 1);
  const allVals  = bands.map(b => b[retIdx]);
  const targets  = [500000, 1000000, 2000000, 5000000];
  const color    = scenario.color || '#00d4aa';

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

function updateMcVolatility(val) {
  State.setMcVolatility(parseFloat(val));
  const lbl = document.getElementById('vol-label');
  if (lbl) lbl.textContent = val + '%';
}
