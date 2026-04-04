/* ══════════════════════════════════════════════
   projections.js — Multi-scenario projection chart
   + consolidated scenario editor (collapsible sections)
══════════════════════════════════════════════ */

const charts = {};

// Which sections are expanded per-session (global, survives scenario switches)
const _openSections = { career: true, finances: false, events: false, settings: false };

function toggleSection(key) {
  _openSections[key] = !_openSections[key];
  renderActiveScenarioEditor();
}

// Draws vertical dashed lines at life event ages
const milestonePlugin = {
  id: 'milestones',
  afterDraw(chart) {
    const scenario = State.getScenario();
    if (!scenario || !scenario.events.length) return;
    const { ctx, chartArea, scales } = chart;
    scenario.events.forEach(ev => {
      const x = scales.x.getPixelForValue(+ev.at_age);
      if (x == null || x < chartArea.left || x > chartArea.right) return;
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
    const used  = State.getScenarioList().map(s => s.color).filter(Boolean);
    const color = PATH_COLORS.find(c => !used.includes(c)) || PATH_COLORS[0];
    const s = await api.createScenario({ name: `Scenario ${State.getScenarioList().length + 1}`, color });
    State.getScenarioList().push(s);
    State.setActiveScenario(s);
    renderProjTab();
  } catch (err) { showToast(err.message, true); }
}

function renderProjChart() {
  const scenario = State.getScenario();
  if (!scenario) return;

  const scenarios = State.getScenarioList()
    .filter(s => s.events !== undefined);

  const toRender = scenarios.length ? scenarios : [scenario];

  const ages    = getAges(scenario.start_age);
  const results = toRender.map(s => calculatePath(s));
  const infl    = State.getInflation();

  const datasets = toRender.map((s, i) => {
    const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
    return {
      label: s.name, data: applyInflation(results[i].path, infl),
      borderColor: color, backgroundColor: color + '10',
      fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2.5, spanGaps: false,
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

// ── Salary helper ──────────────────────────────────────────────────────────────
function onSalaryChange(field, val) {
  const s   = State.getScenario();
  if (!s) return;
  const job = JOBS.find(j => j.id === s.job_id) || JOBS[0];
  const s0  = field === 's0'  ? +val : (s.custom_s0  != null ? s.custom_s0  : job.s0);
  const s50 = field === 's50' ? +val : (s.custom_s50 != null ? s.custom_s50 : job.s50);
  const s35 = Math.round(s0 + (s50 - s0) * 0.65);
  State.patchScenario({ custom_s0: s0, custom_s35: s35, custom_s50: s50 });
  renderProjChart();
}

// ── Scenario editor ────────────────────────────────────────────────────────────
function renderActiveScenarioEditor() {
  const s = State.getScenario();
  const container = document.getElementById('scenario-editors');
  if (!s || !container) return;

  const job     = JOBS.find(j => j.id === s.job_id) || JOBS[0];
  const isCustom = s.job_id === 'custom';
  const effS0   = s.custom_s0  != null ? s.custom_s0  : job.s0;
  const effS50  = s.custom_s50 != null ? s.custom_s50 : job.s50;

  const financeCount = (s.assets || []).length + (s.debts || []).length;
  const eventCount   = (s.events || []).length;

  function secHdr(key, title, badge) {
    const open = _openSections[key];
    return `<div class="sec-hdr" onclick="toggleSection('${key}')">
      <span class="sec-arrow">${open ? '▾' : '▸'}</span>
      <span class="sec-title">${title}</span>
      ${badge ? `<span class="sec-badge">${badge}</span>` : ''}
    </div>`;
  }

  container.innerHTML = `
    <div class="card card-alt fade-up">

      <!-- Scenario header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="path-pill" style="background:${s.color}15;color:${s.color};">● ${s.name}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="cloneActiveScenario()" title="Clone">⎘</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteActiveScenario()" title="Delete">🗑</button>
        </div>
      </div>

      <div class="field" style="margin-bottom:14px;">
        <label class="micro" style="display:block;margin-bottom:5px;">Scenario Name</label>
        <input type="text" value="${s.name}" oninput="State.patchScenario({name:this.value});updateScenarioChipName(this.value)"/>
      </div>

      <!-- Color swatches -->
      <div class="field" style="margin-bottom:14px;">
        <label class="micro" style="display:block;margin-bottom:8px;">Line Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${PATH_COLORS.map(c => `
            <div onclick="pickScenarioColor('${c}')"
              style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;
                     box-shadow:${s.color===c ? '0 0 0 3px #07080f, 0 0 0 5px '+c : 'none'};
                     transition:.15s;"></div>
          `).join('')}
        </div>
      </div>

      <!-- Start Age -->
      <div class="field" style="margin-bottom:14px;">
        <label class="micro" style="display:block;margin-bottom:5px;">Your Current Age</label>
        <input type="number" min="0" max="80" value="${s.start_age}" onchange="State.patchScenario({start_age:+this.value});renderProjChart()"/>
      </div>

      <!-- ── Career ── -->
      ${secHdr('career', 'Career')}
      <div class="sec-body" style="display:${_openSections.career ? '' : 'none'};">
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Career Path</label>
          <select onchange="onJobChange(this.value)">
            ${JOBS.map(j => `<option value="${j.id}"${j.id === s.job_id ? ' selected' : ''}>${j.name}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Start Salary ($)</label>
            <input type="number" value="${effS0}" onchange="onSalaryChange('s0',this.value)"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Peak Salary ($)</label>
            <input type="number" value="${effS50}" onchange="onSalaryChange('s50',this.value)"/>
          </div>
        </div>
        ${!isCustom ? `<p class="micro" style="color:var(--muted2);margin-top:-4px;margin-bottom:10px;text-transform:none;letter-spacing:0;font-size:11px;">Estimated salary — adjust if needed</p>` : ''}
      </div>

      <!-- ── Finances ── -->
      ${secHdr('finances', 'Finances', financeCount || '')}
      <div class="sec-body" style="display:${_openSections.finances ? '' : 'none'};">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
          <span class="micro">Assets</span>
          <div class="balance-total" id="assets-total" style="font-size:16px;">$0</div>
        </div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Type</label>
          <select id="asset-type-select">
            ${ASSET_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Name</label>
            <input type="text" id="asset-label" placeholder="Company 401(k)"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Value ($)</label>
            <input type="number" id="asset-value" placeholder="0"/>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Annual Contribution ($)</label>
            <input type="number" id="asset-contrib" placeholder="0"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Return %</label>
            <input type="number" id="asset-rate" placeholder="7" value="7" step="0.5"/>
          </div>
        </div>
        <button class="btn btn-primary" style="margin-bottom:16px;" onclick="addAsset()">Add Asset</button>
        <div id="assets-list"></div>

        <div style="display:flex;justify-content:space-between;align-items:baseline;margin:16px 0 10px;">
          <span class="micro">Debts</span>
          <div class="balance-total" style="font-size:16px;color:var(--coral);" id="debts-total">$0</div>
        </div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Type</label>
          <select id="debt-type-select">
            ${DEBT_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Name</label>
            <input type="text" id="debt-label" placeholder="Federal Student Loans"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Balance ($)</label>
            <input type="number" id="debt-balance" placeholder="0"/>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Rate %</label>
            <input type="number" id="debt-rate" placeholder="5" value="5" step="0.1"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Monthly Payment ($)</label>
            <input type="number" id="debt-pmt" placeholder="0"/>
          </div>
        </div>
        <button class="btn btn-primary" style="margin-bottom:16px;" onclick="addDebt()">Add Debt</button>
        <div id="debts-list"></div>
      </div>

      <!-- ── Life Events ── -->
      ${secHdr('events', 'Life Events', eventCount || '')}
      <div class="sec-body" style="display:${_openSections.events ? '' : 'none'};">
        <div id="ev-type-chips" class="event-type-chips"></div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Event Name</label>
            <input type="text" id="ev-name" placeholder="e.g. Buy a house"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Emoji</label>
            <input type="text" id="ev-emoji" placeholder="🏠" maxlength="4" style="width:60px;"/>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">At Age</label>
            <input type="number" id="ev-age" placeholder="30" min="18" max="90"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Duration (yrs)</label>
            <input type="number" id="ev-years" value="1" min="1" max="50"/>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">One-time Cost ($)</label>
            <input type="number" id="ev-cost" placeholder="0"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Annual Impact ($)</label>
            <input type="number" id="ev-annual" placeholder="0"/>
          </div>
        </div>
        <p style="font-size:11px;color:var(--muted2);margin-bottom:10px;">
          Positive = expense. For inheritance or income events, enter as positive — the app flips the sign.
        </p>
        <button class="btn btn-primary" style="margin-bottom:16px;" onclick="addEvent()">Add to Timeline</button>
        <div id="event-list"></div>
      </div>

      <!-- ── Projection Settings ── -->
      ${secHdr('settings', 'Projection Settings')}
      <div class="sec-body" style="display:${_openSections.settings ? '' : 'none'};">
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
      </div>

    </div>`;

  // Populate sub-lists for open sections
  if (_openSections.finances) {
    renderAssetsList();
    renderDebtsList();
  }
  if (_openSections.events) {
    renderEventTypeSelector();
    renderEventList();
  }
}

function pickScenarioColor(color) {
  State.patchScenario({ color });
  renderProjTab();
}

function updateScenarioChipName(name) {
  renderScenarioChips();
  renderProjChart();
}

function onJobChange(val) {
  // Clear salary overrides so new job's defaults populate the fields
  State.patchScenario({ job_id: val, custom_s0: null, custom_s35: null, custom_s50: null });
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

