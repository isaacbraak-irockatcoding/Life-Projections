/* ══════════════════════════════════════════════
   projections.js — Multi-scenario projection chart
   + active scenario editor
══════════════════════════════════════════════ */

const charts = {};

// Draws vertical dashed lines at life event ages
const milestonePlugin = {
  id: 'milestones',
  afterDraw(chart) {
    const scenario = State.getScenario();
    if (!scenario || !scenario.events.length) return;
    const { ctx, chartArea, scales } = chart;
    scenario.events.forEach(ev => {
      const x = scales.x.getPixelForValue(ev.at_age);
      if (!x || x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.strokeStyle = ev.color + 'bb';
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '10px Outfit'; ctx.fillStyle = ev.color;
      const lbl = `${ev.emoji} ${ev.name}`;
      const tw  = ctx.measureText(lbl).width;
      ctx.fillText(lbl, Math.min(x + 4, chartArea.right - tw - 4), chartArea.top + 14);
      ctx.restore();
    });
  },
};
Chart.register(milestonePlugin);

function renderProjTab() {
  renderScenarioChips();
  renderProjChart();
  renderActiveScenarioEditor();
}

// Scenario chip selector at the top of the projections tab
function renderScenarioChips() {
  const container = document.getElementById('scenario-chips');
  if (!container) return;
  const list      = State.getScenarioList();
  const activeId  = State.getActiveId();

  container.innerHTML = list.map((s, i) => {
    const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
    return `<div class="scenario-chip${s.id === activeId ? ' active' : ''}"
      style="${s.id === activeId ? `border-color:${color};color:${color};background:${color}18` : ''}"
      onclick="selectScenarioChip(${s.id})">
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:5px;"></span>
      ${s.name}
    </div>`;
  }).join('') +
  `<div class="scenario-chip scenario-chip-add" onclick="createNewScenario()">＋ New</div>`;
}

async function selectScenarioChip(id) {
  if (id === State.getActiveId()) return;
  try {
    await State.loadScenario(id);
    renderProjTab();
  } catch (err) { showToast(err.message, true); }
}

async function createNewScenario() {
  try {
    const s = await api.createScenario({ name: `Scenario ${State.getScenarioList().length + 1}` });
    State.getScenarioList().push(s);
    State.setActiveScenario(s);
    renderProjTab();
  } catch (err) { showToast(err.message, true); }
}

function renderProjChart() {
  const scenario = State.getScenario();
  if (!scenario) return;

  // Render this scenario + any others the user has loaded (full data)
  // For now we show the active scenario only (multi-scenario overlay is opt-in via chips)
  const scenarios = State.getScenarioList()
    .filter(s => s.events !== undefined); // only those fully loaded

  // Always include active scenario
  const toRender = scenarios.length ? scenarios : [scenario];

  const ages    = getAges(scenario.start_age);
  const results = toRender.map(s => calculatePath(s));
  const infl    = State.getInflation();

  const datasets = toRender.map((s, i) => {
    const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
    return {
      label: s.name, data: applyInflation(results[i].path, infl),
      borderColor: color, backgroundColor: color + '10',
      fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2.5,
    };
  });

  if (charts.proj) charts.proj.destroy();
  charts.proj = new Chart(document.getElementById('projChart').getContext('2d'), {
    type: 'line',
    data: { labels: ages, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          grid: { color: '#1a1e32' },
          ticks: { color: '#4a5370', callback: v =>
            v >= 1e6 ? '$'+(v/1e6).toFixed(1)+'M' : v >= 1000 ? '$'+(v/1000).toFixed(0)+'K' : '$'+v },
        },
        x: { grid: { display: false }, ticks: { color: '#4a5370', maxTicksLimit: 8 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#141720', borderColor: '#1c2038', borderWidth: 1,
          titleColor: '#7a83a8', bodyColor: '#dde3f5',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtM(ctx.parsed.y)}` },
        },
      },
    },
  });

  // Legend
  document.getElementById('proj-legend').innerHTML = toRender.map((s, i) => {
    const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
    return `<div class="legend-item">
      <div class="legend-line" style="background:${color}"></div>
      <span>${s.name}</span>
    </div>`;
  }).join('');

  // Stats
  document.getElementById('proj-stats').innerHTML = `<div class="stats-row">` +
    toRender.map((s, i) => {
      const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
      const path  = applyInflation(results[i].path, infl);
      const final = path[path.length - 1];
      const inc   = Math.round(results[i].annualDrawn);
      return `<div class="stat-box">
        <div class="stat-val" style="color:${color}">${fmtM(final)}</div>
        <div class="stat-sub">${s.name} @ ${(s.start_age || 25) + 45}</div>
        <div class="stat-sub" style="margin-top:3px;color:var(--muted)">~${fmtM(inc)}/yr</div>
      </div>`;
    }).join('') + `</div>`;

  // Breakeven (first two scenarios)
  const beEl = document.getElementById('proj-breakeven');
  if (toRender.length >= 2) {
    const pA = applyInflation(results[0].path, infl);
    const pB = applyInflation(results[1].path, infl);
    let be = null;
    for (let i = 1; i < pA.length; i++) {
      if ((pA[i] > pB[i]) !== (pA[i-1] > pB[i-1])) { be = ages[i]; break; }
    }
    if (be) {
      const aIdx = be - (scenario.start_age || 25);
      const leader  = pA[aIdx] > pB[aIdx] ? toRender[0].name : toRender[1].name;
      const laggard = leader === toRender[0].name ? toRender[1].name : toRender[0].name;
      const lc      = leader === toRender[0].name ? (toRender[0].color || PATH_COLORS[0]) : (toRender[1].color || PATH_COLORS[1]);
      beEl.innerHTML = `<div class="breakeven">
        <div style="width:8px;height:8px;border-radius:50%;background:${lc};flex-shrink:0;"></div>
        <span style="color:var(--muted2);font-size:12px;">
          <strong style="color:${lc}">${leader}</strong> overtakes ${laggard} at age
          <strong style="color:var(--text)">${be}</strong>
        </span>
      </div>`;
    } else { beEl.innerHTML = ''; }
  } else { beEl.innerHTML = ''; }
}

function renderActiveScenarioEditor() {
  const s = State.getScenario();
  const container = document.getElementById('scenario-editors');
  if (!s || !container) return;

  const isCustom = s.job_id === 'custom';

  container.innerHTML = `
    <div class="card card-alt fade-up">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="path-pill" style="background:${s.color}15;color:${s.color};">● ${s.name}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="cloneActiveScenario()" title="Clone">⎘</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteActiveScenario()" title="Delete">🗑</button>
        </div>
      </div>

      <div class="field">
        <label class="micro" style="display:block;margin-bottom:5px;">Scenario Name</label>
        <input type="text" value="${s.name}" oninput="State.patchScenario({name:this.value});updateScenarioChipName(this.value)"/>
      </div>

      <div class="field">
        <label class="micro" style="display:block;margin-bottom:5px;">Career Path</label>
        <select onchange="onJobChange(this.value)">
          ${JOBS.map(j => `<option value="${j.id}"${j.id === s.job_id ? ' selected' : ''}>${j.name}</option>`).join('')}
        </select>
      </div>

      ${isCustom ? `
      <div class="field-row">
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Start Salary ($)</label>
          <input type="number" value="${s.custom_s0 || 60000}" onchange="State.patchScenario({custom_s0:+this.value});renderProjChart()"/>
        </div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Peak Salary ($)</label>
          <input type="number" value="${s.custom_s50 || 115000}" onchange="State.patchScenario({custom_s50:+this.value,custom_s35:Math.round(+this.value*.85)});renderProjChart()"/>
        </div>
      </div>` : ''}

      <div class="field-row">
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Start Age</label>
          <input type="number" min="18" max="60" value="${s.start_age}" onchange="State.patchScenario({start_age:+this.value});renderProjChart()"/>
        </div>
      </div>

      <div class="field">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <label class="micro">Savings Rate</label>
          <span class="micro num" id="sl-sp" style="color:var(--text)">${s.save_pct}%</span>
        </div>
        <input type="range" min="0" max="70" value="${s.save_pct}"
          oninput="updSlider('save_pct',this.value,'sp','%')"/>
      </div>
      <div class="field">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <label class="micro">Avg. Return Rate</label>
          <span class="micro num" id="sl-rr" style="color:var(--text)">${s.return_rate}%</span>
        </div>
        <input type="range" min="1" max="14" step="0.5" value="${s.return_rate}"
          oninput="updSlider('return_rate',this.value,'rr','%')"/>
      </div>
      <div class="field">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <label class="micro">Target Retirement Age</label>
          <span class="micro num" id="sl-ra" style="color:var(--text)">${s.retire_age}</span>
        </div>
        <input type="range" min="45" max="75" value="${s.retire_age}"
          oninput="updSlider('retire_age',this.value,'ra','')"/>
      </div>
    </div>`;
}

function updateScenarioChipName(name) {
  renderScenarioChips();
  renderProjChart();
}

function onJobChange(val) {
  const patch = { job_id: val };
  if (val === 'custom') {
    const s = State.getScenario();
    if (!s.custom_s0) patch.custom_s0 = 60000;
    if (!s.custom_s50) patch.custom_s50 = 115000;
    if (!s.custom_s35) patch.custom_s35 = Math.round(115000 * 0.85);
  }
  State.patchScenario(patch);
  renderActiveScenarioEditor();
  renderProjChart();
}

function updSlider(key, value, abbr, suffix) {
  State.patchScenario({ [key]: parseFloat(value) });
  const lbl = document.getElementById(`sl-${abbr}`);
  if (lbl) lbl.textContent = value + suffix;
  renderProjChart();
}

async function cloneActiveScenario() {
  const s = State.getScenario();
  if (!s) return;
  try {
    const clone = await api.cloneScenario(s.id, `${s.name} (copy)`);
    State.getScenarioList().push(clone);
    State.setActiveScenario(clone);
    renderProjTab();
    showToast('Scenario cloned');
  } catch (err) { showToast(err.message, true); }
}

async function deleteActiveScenario() {
  const s = State.getScenario();
  const list = State.getScenarioList();
  if (!s || list.length <= 1) { showToast('Cannot delete the only scenario', true); return; }
  if (!confirm(`Delete "${s.name}"?`)) return;
  try {
    await api.deleteScenario(s.id);
    const remaining = list.filter(x => x.id !== s.id);
    State.setScenarioList(remaining);
    await State.loadScenario(remaining[0].id);
    renderProjTab();
    showToast('Scenario deleted');
  } catch (err) { showToast(err.message, true); }
}

function toggleInflation() {
  State.toggleInflation();
  document.getElementById('infl-toggle').classList.toggle('on', State.getInflation());
  renderProjChart();
}
