/* ══════════════════════════════════════════════
   projections.js — Multi-scenario projection chart
   + consolidated scenario editor (collapsible sections)
══════════════════════════════════════════════ */

const charts = {};

// Which sections are expanded per-session (global, survives scenario switches)
const _openSections = { school: false, career: false, finances: false, events: false, living: false };

// Time range for projection chart (null = All)
let _projRange = null;
// View mode: 'chart' or 'table'
let _viewMode = 'chart';
// Per-scenario table rows keyed by scenario id
let _tableRows = {};
// Tracks which scenario+section is expanded in balance-sheet table
const _tableExpanded = {};
// Tracks which cashflow sections are expanded per scenario
const _cashflowExpanded = {};
// Compare mode: show all scenarios on chart simultaneously
let _compareMode = false;
// Cache of fully-loaded scenario objects keyed by id
const _scenarioCache = {};
// Animate mode: progressive line draw on chart
let _animateMode      = false;
let _animDuration     = 9000; // ms, user-adjustable 5–15s
let _finalCelebrating = false; // true after animation completes
let _finalCelebDsIdx  = -1;    // dataset index of the highest net-worth line

function setAnimDuration(seconds) {
  _animDuration = seconds * 1000;
  const label = document.getElementById('anim-duration-label');
  if (label) label.textContent = `${seconds}s`;
  if (_animateMode) renderProjChart(); // re-trigger with new speed
}

// Stick-figure animation state
const MILESTONES = [
  { value:   100_000, label: '$100K' },
  { value:   250_000, label: '$250K' },
  { value:   500_000, label: '$500K' },
  { value: 1_000_000, label: '$1M'   },
  { value: 2_000_000, label: '$2M'   },
  { value: 5_000_000, label: '$5M'   },
];
let _reachedMilestones = new Set();
let _celebratingUntil  = 0;
let _celebrationLabel  = '';
let _sfAnimFrame       = null;

function getToRender() {
  const active = State.getScenario();
  if (!_compareMode) return [active];
  _scenarioCache[State.getActiveId()] = active;
  return State.getScenarioList().map(s => _scenarioCache[s.id]).filter(Boolean);
}

async function toggleCompareMode() {
  _compareMode = !_compareMode;
  if (_compareMode) {
    _scenarioCache[State.getActiveId()] = State.getScenario();
    await Promise.all(
      State.getScenarioList()
        .filter(s => !_scenarioCache[s.id])
        .map(async s => { _scenarioCache[s.id] = await api.getScenario(s.id); })
    );
  }
  document.getElementById('compare-btn')?.classList.toggle('active', _compareMode);
  renderProjChart();
  renderProjTable();
  renderCashflowSummary();
}

function toggleAnimateMode() {
  _animateMode = !_animateMode;
  document.getElementById('animate-btn')?.classList.toggle('active', _animateMode);
  _reachedMilestones = new Set();
  _celebratingUntil  = 0;
  _celebrationLabel  = '';
  _finalCelebrating  = false;
  _finalCelebDsIdx   = -1;
  if (_sfAnimFrame) { cancelAnimationFrame(_sfAnimFrame); _sfAnimFrame = null; }
  renderProjChart();
}

function setProjRange(years) {
  _projRange = years;
  renderProjChart();
}

function setViewMode(mode) {
  _viewMode = mode;
  const canvas   = document.getElementById('projChart');
  const table    = document.getElementById('proj-table');
  const cashflow = document.getElementById('proj-cashflow');
  if (canvas)   canvas.style.display   = mode === 'chart'    ? 'block' : 'none';
  if (table)    table.style.display    = mode === 'table'    ? 'block' : 'none';
  if (cashflow) cashflow.style.display = mode === 'cashflow' ? 'block' : 'none';
  ['chart', 'table', 'cashflow'].forEach(m => {
    const btn = document.getElementById(`view-btn-${m}`);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  if (mode === 'table')    renderProjTable();
  if (mode === 'cashflow') renderCashflowSummary();
}

function toggleSection(key) {
  _openSections[key] = !_openSections[key];
  renderActiveScenarioEditor();
}

async function toggleLiving() {
  _openSections.living = !_openSections.living;
  if (_openSections.living) {
    const s = State.getScenario();
    if (s && (s.lifestyles || []).length === 0) {
      await addLifestyle(); // already calls renderActiveScenarioEditor()
      return;
    }
  }
  renderActiveScenarioEditor();
}

function toggleBalanceSection(scenarioId, section) {
  const key = `${scenarioId}-${section}`;
  _tableExpanded[key] = !_tableExpanded[key];
  renderProjTable();
}

function toggleCashflowSection(scenarioId, section) {
  const key = `${scenarioId}-cf-${section}`;
  _cashflowExpanded[key] = !_cashflowExpanded[key];
  renderCashflowSummary();
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
    await State.save(); // persist any unsaved changes before switching
    const s = await State.loadScenario(id);
    _scenarioCache[id] = s;
    renderProjTab();
    renderShareTab();
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

// ── Stick-figure renderer ────────────────────────────────────────────────────
function _sfStroke(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawStickFigure(ctx, cx, cy, now, color = '#ffffff', isWinner = false) {
  const celebrating = now < _celebratingUntil;
  const R     = isWinner ? 7 : 4;
  const phase = (now / 260) % (Math.PI * 2);
  const bob   = isWinner ? Math.sin(now / 150) * 2.5 : 0;

  ctx.save();

  // Pulsing rings + glow for winner
  if (isWinner) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14 + Math.sin(now / 180) * 6;

    const ringPhase = (now % 900) / 900;
    [0, 0.45].forEach(offset => {
      const p  = (ringPhase + offset) % 1;
      const rr = R * 2 + p * R * 5;
      ctx.beginPath();
      ctx.arc(cx, cy + bob - R * 2.3, rr, 0, Math.PI * 2);
      ctx.strokeStyle  = color;
      ctx.lineWidth    = 1.5;
      ctx.globalAlpha  = (1 - p) * 0.5;
      ctx.stroke();
      ctx.globalAlpha  = 1;
    });
  }

  ctx.translate(cx, cy + bob);
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = isWinner ? 1.6 : 1;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  // Head
  ctx.beginPath();
  ctx.arc(0, -R * 2.3, R * (isWinner ? 0.42 : 0.38), 0, Math.PI * 2);
  ctx.fill();

  if (isWinner) {
    // Dance: arms wave alternately at ~3Hz, legs kick wide
    const dPhase = (now / 330) % (Math.PI * 2);
    const aLeft  =  Math.sin(dPhase);
    const aRight = -Math.sin(dPhase);
    const ls     = Math.sin((now / 260) % (Math.PI * 2));
    _sfStroke(ctx, 0, -R * 1.9, 0, -R * 0.5);
    _sfStroke(ctx, 0, -R * 1.55, -R * 0.9, -R * 1.55 + aLeft  * R * 1.1);
    _sfStroke(ctx, 0, -R * 1.55,  R * 0.9, -R * 1.55 + aRight * R * 1.1);
    _sfStroke(ctx, 0, -R * 0.5, -R * 0.7 + ls * R * 0.4, R * 0.6);
    _sfStroke(ctx, 0, -R * 0.5,  R * 0.7 - ls * R * 0.4, R * 0.6);
  } else if (celebrating) {
    // Milestone celebration — arms up
    _sfStroke(ctx, 0, -R * 1.9, 0, -R * 0.5);
    _sfStroke(ctx, 0, -R * 1.55, -R * 0.8, -R * 2.2);
    _sfStroke(ctx, 0, -R * 1.55,  R * 0.8, -R * 2.2);
    _sfStroke(ctx, 0, -R * 0.5, -R * 0.38, R * 0.55);
    _sfStroke(ctx, 0, -R * 0.5,  R * 0.38, R * 0.55);
    ctx.fillStyle = '#00d4aa';
    ctx.font      = 'bold 7px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(_celebrationLabel, 0, -R * 3.05);
  } else {
    // Running
    const ls = Math.sin(phase);
    const as = Math.sin(phase + Math.PI);
    const lX = ls * R * 0.6;
    const aX = as * R * 0.5;
    _sfStroke(ctx, 0, -R * 1.9, 0, -R * 0.5);
    _sfStroke(ctx, 0, -R * 1.6,  aX, -R * 1.6 - R * 0.45);
    _sfStroke(ctx, 0, -R * 1.6, -aX, -R * 1.6 - R * 0.45);
    _sfStroke(ctx, 0, -R * 0.5,  lX, -R * 0.5 + R * 0.75);
    _sfStroke(ctx, 0, -R * 0.5, -lX, -R * 0.5 + R * 0.75);
  }

  ctx.restore();
}

const stickFigurePlugin = {
  id: 'stickFigure',
  afterDraw(chart) {
    if (!_animateMode) return;
    const now = Date.now();

    chart.data.datasets.forEach((ds, dsIdx) => {
      const meta = chart.getDatasetMeta(dsIdx);
      if (!meta?.data?.length) return;

      // Find the rightmost rendered point for this dataset
      let headX = null, headY = null, headVal = 0;
      for (let i = meta.data.length - 1; i >= 0; i--) {
        const { x, y } = meta.data[i].getProps(['x', 'y'], false);
        if (Number.isFinite(x) && Number.isFinite(y) && x > chart.chartArea.left) {
          headX = x; headY = y; headVal = ds.data[i] ?? 0;
          break;
        }
      }
      if (headX === null) return;

      // Trigger milestone celebrations (keyed per dataset so each tracks independently)
      for (const ms of MILESTONES) {
        const key = `${dsIdx}_${ms.value}`;
        if (headVal >= ms.value && !_reachedMilestones.has(key)) {
          _reachedMilestones.add(key);
          _celebratingUntil = now + 1600;
          _celebrationLabel = ms.label + '!';
        }
      }

      const isWinner = _finalCelebrating && dsIdx === _finalCelebDsIdx;
      drawStickFigure(chart.ctx, headX, headY, now, ds.borderColor, isWinner);
    });
  },
};

// Returns true when the user has not entered any meaningful data yet
function isScenarioBlank(s) {
  return s.custom_s0 == null && s.custom_s50 == null &&
    !(s.assets     || []).length &&
    !(s.debts      || []).length &&
    !(s.events     || []).length &&
    !(s.schools    || []).length &&
    !(s.careers    || []).length &&
    !(s.lifestyles || []).length;
}

function renderRetirementTally(toRender, results) {
  const el = document.getElementById('retirement-tally');
  if (!el) return;

  // Update header net worth badge (active scenario only)
  const nwWrap = document.getElementById('retirement-net-worth');
  const nwVal  = document.getElementById('retirement-net-worth-value');
  if (nwWrap && nwVal && toRender.length > 0) {
    const s         = toRender[0];
    const rows      = results[0].rows || [];
    const retireAge = s.retire_age || 65;
    const retireRow = rows.find(r => r.age >= retireAge) || rows[rows.length - 1] || {};
    const netWorth  = retireRow.balance || 0;
    nwVal.textContent = fmtM(netWorth);
    nwVal.style.color = netWorth >= 0 ? '#00d4aa' : '#ff6b6b';
    nwWrap.style.display = 'flex';
  } else if (nwWrap) {
    nwWrap.style.display = 'none';
  }

  el.innerHTML = '<div class="retirement-tally-grid">' +
    toRender.map((s, i) => {
      const color     = s.color || PATH_COLORS[i % PATH_COLORS.length];
      const rows      = results[i].rows || [];
      const retireAge = s.retire_age || 65;
      const retireRow = rows.find(r => r.age >= retireAge) || rows[rows.length - 1] || {};
      const netWorth  = retireRow.balance || 0;
      const annual    = Math.round(results[i].annualDrawn || 0);

      return `<div class="tally-card" style="--tally-color:${color}">
        <div class="tally-scenario">
          <span class="tally-dot" style="background:${color}"></span>
          <span class="tally-name" style="color:${color}">${s.name}</span>
          <span class="tally-retire-age">@ age ${retireAge}</span>
        </div>
        <div class="tally-numbers">
          <div class="tally-item">
            <div class="tally-label">Net Worth</div>
            <div class="tally-value" style="color:${color}">${fmtM(netWorth)}</div>
          </div>
          <div class="tally-sep"></div>
          <div class="tally-item">
            <div class="tally-label">Annual Draw</div>
            <div class="tally-value tally-draw">${fmtM(annual)}/yr</div>
          </div>
        </div>
      </div>`;
    }).join('') + '</div>';
}

function renderProjChart() {
  const scenario = State.getScenario();
  if (!scenario) return;

  const toRender  = getToRender();
  const emptyEl   = document.getElementById('chart-empty-state');
  const canvas    = document.getElementById('projChart');
  const tallyEl   = document.getElementById('retirement-tally');

  // Empty state — no meaningful data entered yet
  if (isScenarioBlank(scenario)) {
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `<div class="chart-empty-wrap">
        <svg class="chart-empty-path" viewBox="0 0 400 180" preserveAspectRatio="none">
          <path d="M0,160 C60,150 100,120 160,90 S280,30 400,10"
                stroke="#00d4aa" stroke-width="2" stroke-dasharray="6 4" fill="none"/>
        </svg>
        <div class="chart-empty-icon">📈</div>
        <div class="chart-empty-headline">Your financial future starts here<span class="chart-empty-cursor"></span></div>
        <div class="chart-empty-sub">Answer the questions below to map out your financial future</div>
        <div class="chart-empty-hints">
          <span>🎓 School</span>
          <span>💼 Career</span>
          <span>💰 Assets</span>
          <span>🏠 Events</span>
          <span>✨ Living</span>
        </div>
        <div class="chart-empty-arrow">↓</div>
      </div>`;
    }
    if (canvas) canvas.style.display = 'none';
    if (tallyEl) tallyEl.innerHTML = '';
    const nwWrap = document.getElementById('retirement-net-worth');
    if (nwWrap) nwWrap.style.display = 'none';
    document.getElementById('proj-breakeven').innerHTML = '';
    if (charts.proj) { charts.proj.destroy(); charts.proj = null; }
    return;
  }

  // Data present — show chart, hide empty state
  if (emptyEl) emptyEl.style.display = 'none';
  if (canvas)  canvas.style.display  = 'block';

  const startAge = scenario.start_age || 25;
  const ages     = getAges(startAge);
  const results      = toRender.map(s => calculatePath(s));
  const _winnerDsIdx = results
    .map((r, i) => ({ i, val: r.path[r.path.length - 1] ?? -Infinity }))
    .sort((a, b) => b.val - a.val)[0].i;

  // Store per-scenario rows for table view
  toRender.forEach((s, i) => { _tableRows[s.id] = results[i].rows; });
  const xMin     = startAge;
  const xMax     = _projRange ? startAge + _projRange : undefined;

  // Update active range button
  [5, 10, 20, null].forEach(r => {
    const el = document.getElementById(r ? `rb-${r}` : 'rb-all');
    if (el) el.classList.toggle('active', r === _projRange);
  });

  const datasets = toRender.map((s, i) => {
    const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
    return {
      label: s.name, data: results[i].path,
      borderColor: color, backgroundColor: color + '10',
      fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2.5, spanGaps: false,
    };
  });

  // Progressive line-draw animation — each point appears sequentially left to right
  const totalDuration = _animDuration;
  const pointCount    = results[0]?.path?.length || 80;
  const delay         = totalDuration / pointCount;
  const animOptions   = _animateMode ? {
    x: {
      type: 'number', easing: 'linear', duration: delay, from: NaN,
      delay(ctx) {
        if (ctx.type !== 'data' || ctx.xStarted) return 0;
        ctx.xStarted = true;
        return ctx.index * delay;
      },
    },
    y: {
      type: 'number', easing: 'linear', duration: delay,
      from(ctx) {
        if (ctx.index === 0) return ctx.chart.scales.y.getPixelForValue(0);
        const prev = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1];
        return prev ? prev.getProps(['y'], true).y : 0;
      },
      delay(ctx) {
        if (ctx.type !== 'data' || ctx.yStarted) return 0;
        ctx.yStarted = true;
        return ctx.index * delay;
      },
    },
  } : false;

  if (charts.proj) charts.proj.destroy();
  charts.proj = new Chart(document.getElementById('projChart').getContext('2d'), {
    type: 'line',
    plugins: _animateMode ? [stickFigurePlugin] : [],
    data: { labels: ages, datasets },
    options: {
      animation: animOptions,
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          grid: { color: '#1a1e32' },
          ticks: { color: '#4a5370', callback: v =>
            v >= 1e6 ? '$'+(v/1e6).toFixed(1)+'M' : v >= 1000 ? '$'+(v/1000).toFixed(0)+'K' : '$'+v },
        },
        x: { min: xMin, max: xMax, grid: { display: false }, ticks: { color: '#4a5370', maxTicksLimit: 8 } },
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

  // After the line finishes drawing, keep the stick figure animated for 3 more seconds
  if (_animateMode) {
    if (_sfAnimFrame) { cancelAnimationFrame(_sfAnimFrame); _sfAnimFrame = null; }
    setTimeout(() => {
      _finalCelebrating = true;
      _finalCelebDsIdx  = _winnerDsIdx;
      function sfLoop() {
        if (!_animateMode || !charts.proj) return;
        charts.proj.draw();
        _sfAnimFrame = requestAnimationFrame(sfLoop);
      }
      _sfAnimFrame = requestAnimationFrame(sfLoop);
    }, totalDuration + 200);
  }

  // Legend
  document.getElementById('proj-legend').innerHTML = toRender.map((s, i) => {
    const color = s.color || PATH_COLORS[i % PATH_COLORS.length];
    return `<div class="legend-item">
      <div class="legend-line" style="background:${color}"></div>
      <span>${s.name}</span>
    </div>`;
  }).join('');

  // Live retirement tally
  renderRetirementTally(toRender, results);

  // Breakeven (first two scenarios)
  const beEl = document.getElementById('proj-breakeven');
  if (toRender.length >= 2) {
    const pA = results[0].path;
    const pB = results[1].path;
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

  // Sync active view
  if (_viewMode === 'table')    renderProjTable();
  if (_viewMode === 'cashflow') renderCashflowSummary();
}

function renderProjTable() {
  const el = document.getElementById('proj-table');
  if (!el) return;
  const scenario  = State.getScenario();
  if (!scenario) return;
  const toRender  = getToRender();
  const startAge  = scenario.start_age || 25;
  const maxAge    = _projRange ? startAge + _projRange : Infinity;

  el.innerHTML = toRender.map(s => {
    const rows       = (_tableRows[s.id] || []).filter(r => r.age <= maxAge);
    const color      = s.color || '#00d4aa';
    const assetsOpen = !!_tableExpanded[`${s.id}-assets`];
    const liabOpen   = !!_tableExpanded[`${s.id}-liabilities`];

    const tableRows = rows.map(r => {
      let html = `<tr class="bs-summary-row">
        <td class="tbl-age">${r.age}</td>
        <td class="tbl-pos bs-expandable" onclick="toggleBalanceSection(${s.id},'assets')">
          <span class="bs-expand-arrow">${assetsOpen ? '▾' : '▸'}</span>${fmtM(r.totalAssets || 0)}
        </td>
        <td class="tbl-neg bs-expandable" onclick="toggleBalanceSection(${s.id},'liabilities')">
          <span class="bs-expand-arrow">${liabOpen ? '▾' : '▸'}</span>${r.totalLiabilities ? fmtM(r.totalLiabilities) : '—'}
        </td>
        <td class="tbl-bal" style="color:${r.balance >= 0 ? color : 'var(--coral)'};">${fmtM(r.balance)}</td>
      </tr>`;

      if (assetsOpen) {
        if ((r.savingsPool || 0) > 0) {
          html += `<tr class="bs-detail-row">
            <td class="tbl-age">└</td>
            <td class="bs-detail-label" colspan="2">Cash / Savings</td>
            <td class="tbl-pos">${fmtM(r.savingsPool)}</td>
          </tr>`;
        }
        (r.assetBreakdown || []).forEach(a => {
          html += `<tr class="bs-detail-row">
            <td class="tbl-age">└</td>
            <td class="bs-detail-label" colspan="2">${a.name}</td>
            <td class="tbl-pos">${fmtM(a.value)}</td>
          </tr>`;
        });
        (r.homeBreakdown || []).forEach(h => {
          html += `<tr class="bs-detail-row">
            <td class="tbl-age">└</td>
            <td class="bs-detail-label" colspan="2">${h.name}</td>
            <td class="tbl-pos">${fmtM(h.value)}</td>
          </tr>`;
        });
      }

      if (liabOpen) {
        if ((r.liabilityBreakdown || []).length) {
          (r.liabilityBreakdown || []).forEach(d => {
            html += `<tr class="bs-detail-row">
              <td class="tbl-age">└</td>
              <td class="bs-detail-label" colspan="2">${d.label}</td>
              <td class="tbl-neg">${fmtM(d.value)}</td>
            </tr>`;
          });
        } else {
          html += `<tr class="bs-detail-row">
            <td class="tbl-age">└</td>
            <td class="tbl-age bs-detail-label" colspan="3">No active debts</td>
          </tr>`;
        }
      }

      return html;
    }).join('');

    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          <span style="font-size:12px;font-weight:700;color:${color};">${s.name}</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="proj-table">
            <thead>
              <tr>
                <th>Age</th>
                <th class="bs-col-clickable">Assets</th>
                <th class="bs-col-clickable">Liabilities</th>
                <th>Net Worth</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

function renderCashflowSummary() {
  const el = document.getElementById('proj-cashflow');
  if (!el) return;
  const scenario  = State.getScenario();
  if (!scenario) return;
  const toRender  = getToRender();
  const startAge  = scenario.start_age || 25;
  const maxAge    = _projRange ? startAge + _projRange : Infinity;

  el.innerHTML = toRender.map(s => {
    const rows          = (_tableRows[s.id] || []).filter(r => r.age <= maxAge);
    const color         = s.color || '#00d4aa';
    const cashInOpen    = !!_cashflowExpanded[`${s.id}-cf-cashin`];
    const recurringOpen = !!_cashflowExpanded[`${s.id}-cf-recurring`];
    const capitalOpen   = !!_cashflowExpanded[`${s.id}-cf-capital`];

    const tableRows = rows.map(r => {
      const totalCashIn    = r.isRetired ? (r.retirementWithdrawal || 0) : ((r.income || 0) + (r.spouseIncome || 0) + (r.tuitionDisbursement || 0));
      const totalRecurring = (r.interestExpense || 0)
                           + (r.eventAnnualItems || []).reduce((s, i) => s + (i.amount || 0), 0)
                           + (r.debtPrincipalPayments || 0)
                           + (r.livingExpenses || 0)
                           + (r.tuitionDisbursement || 0);
      const totalCapital   = (r.eventOneTimeItems || []).reduce((s, i) => s + (i.amount || 0), 0)
                           + (r.totalAssetContribs || 0);
      const netFlow        = totalCashIn - totalRecurring - totalCapital;
      const netColor       = netFlow >= 0 ? color : 'var(--coral)';

      let html = '';

      // ── Year summary row ──
      html += `<tr class="cf-year-row">
        <td class="tbl-age">${r.age}</td>
        <td class="tbl-pos">${fmtM(totalCashIn)}</td>
        <td class="tbl-neg">${totalRecurring + totalCapital ? fmtM(totalRecurring + totalCapital) : '—'}</td>
        <td class="tbl-bal" style="color:${netColor};">${fmtM(netFlow)}</td>
      </tr>`;

      // ── Cash In section ──
      html += `<tr class="cf-section-hdr" onclick="toggleCashflowSection(${s.id},'cashin')">
        <td class="tbl-age"><span class="bs-expand-arrow">${cashInOpen ? '▾' : '▸'}</span></td>
        <td>Cash In — ${fmtM(totalCashIn)}</td>
        <td></td><td></td>
      </tr>`;
      if (cashInOpen) {
        if (r.isRetired) {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">Retirement Withdrawal</td><td class="tbl-pos">${fmtM(r.retirementWithdrawal || 0)}</td></tr>`;
        } else {
          if ((r.income || 0) > 0) {
            html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">Salary (after tax)</td><td class="tbl-pos">${fmtM(r.income || 0)}</td></tr>`;
          }
          (r.spouseIncomeItems || []).forEach(i => {
            html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">${i.name}</td><td class="tbl-pos">${fmtM(i.amount)}</td></tr>`;
          });
          if ((r.tuitionDisbursement || 0) > 0) {
            html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">Tuition — Loan</td><td class="tbl-pos">${fmtM(r.tuitionDisbursement)}</td></tr>`;
          }
        }
      }

      // ── Recurring Cash Out section ──
      html += `<tr class="cf-section-hdr" onclick="toggleCashflowSection(${s.id},'recurring')">
        <td class="tbl-age"><span class="bs-expand-arrow">${recurringOpen ? '▾' : '▸'}</span></td>
        <td></td>
        <td>Cash Out — ${totalRecurring ? fmtM(totalRecurring) : '—'}</td>
        <td></td>
      </tr>`;
      if (recurringOpen) {
        (r.debtInterestBreakdown || []).forEach(d => {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">${d.label} — Interest</td><td class="tbl-neg">${fmtM(d.interest)}</td></tr>`;
        });
        if ((r.debtPrincipalPayments || 0) > 0) {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">Debt — Principal Paydown</td><td class="tbl-neg">${fmtM(r.debtPrincipalPayments)}</td></tr>`;
        }
        (r.eventAnnualItems || []).forEach(i => {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">${i.name}</td><td class="tbl-neg">${fmtM(i.amount)}</td></tr>`;
        });
        if ((r.livingExpenses || 0) > 0) {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">Living Expenses</td><td class="tbl-neg">${fmtM(r.livingExpenses)}</td></tr>`;
        }
        if ((r.tuitionDisbursement || 0) > 0) {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">Tuition Payment</td><td class="tbl-neg">${fmtM(r.tuitionDisbursement)}</td></tr>`;
        }
        if (!((r.debtInterestBreakdown || []).length) && !(r.debtPrincipalPayments > 0) && !((r.eventAnnualItems || []).length) && !((r.livingExpenses || 0) > 0) && !((r.tuitionDisbursement || 0) > 0)) {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="tbl-age bs-detail-label" colspan="3">None</td></tr>`;
        }
      }

      // ── Capital Deployments section ──
      html += `<tr class="cf-section-hdr" onclick="toggleCashflowSection(${s.id},'capital')">
        <td class="tbl-age"><span class="bs-expand-arrow">${capitalOpen ? '▾' : '▸'}</span></td>
        <td></td>
        <td>Capital Deployments — ${totalCapital ? fmtM(totalCapital) : '—'}</td>
        <td></td>
      </tr>`;
      if (capitalOpen) {
        (r.eventOneTimeItems || []).forEach(i => {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">${i.name} (one-time)</td><td class="tbl-neg">${fmtM(i.amount)}</td></tr>`;
        });
        (r.assetContribBreakdown || []).forEach(a => {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="bs-detail-label" colspan="2">${a.name} — Contribution</td><td class="tbl-neg">${fmtM(a.contrib)}</td></tr>`;
        });
        if (!((r.eventOneTimeItems || []).length) && !((r.assetContribBreakdown || []).length)) {
          html += `<tr class="bs-detail-row"><td class="tbl-age">└</td><td class="tbl-age bs-detail-label" colspan="3">None</td></tr>`;
        }
      }

      // ── Compounding Returns (non-cash reference, split by source) ──
      if ((r.interestIncome || 0) > 0) {
        html += `<tr class="cf-reference-row">
          <td class="tbl-age"></td>
          <td colspan="2">Compounding Returns (not cash income)</td>
          <td style="color:${color};">${fmtM(r.interestIncome)}</td>
        </tr>`;
        if ((r.poolInterestIncome || 0) > 0 && (r.assetInterestIncome || 0) > 0) {
          html += `<tr class="cf-reference-row">
            <td class="tbl-age"></td>
            <td colspan="2" style="padding-left:20px;">└ Savings Pool</td>
            <td style="color:${color};">${fmtM(r.poolInterestIncome)}</td>
          </tr>
          <tr class="cf-reference-row">
            <td class="tbl-age"></td>
            <td colspan="2" style="padding-left:20px;">└ Investment Assets</td>
            <td style="color:${color};">${fmtM(r.assetInterestIncome)}</td>
          </tr>`;
        } else if ((r.poolInterestIncome || 0) > 0) {
          html += `<tr class="cf-reference-row">
            <td class="tbl-age"></td>
            <td colspan="2" style="padding-left:20px;">└ Savings Pool</td>
            <td style="color:${color};">${fmtM(r.poolInterestIncome)}</td>
          </tr>`;
        }
      }

      return html;
    }).join('');

    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          <span style="font-size:12px;font-weight:700;color:${color};">${s.name}</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="proj-table">
            <thead>
              <tr>
                <th>Age</th>
                <th class="tbl-pos">Cash In</th>
                <th class="tbl-neg">Cash Out + Capital</th>
                <th>Net Flow</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

// ── Living expenses helpers ────────────────────────────────────────────────────
function calcLivingExpensesUI(s) {
  const HOUSING_COSTS   = { shared: 700, basic: 1000, modest: 1400, comfortable: 2000, upscale: 3000, luxury: 5000 };
  const DINING_COSTS    = { never: 0, sometimes: 1200, often: 3600, frequently: 7200 };
  const GROCERIES_COSTS = { basic: 2400, average: 3600, generous: 5400 };
  let total = 0;
  total += (HOUSING_COSTS[s.le_housing_tier || 'modest'] || 1400) * 12;
  total += (s.le_utilities_monthly || 0) * 12;
  total += (s.le_pet_count || 0) * 1500;
  total += DINING_COSTS[s.le_dining || 'never'] || 0;
  total += GROCERIES_COSTS[s.le_groceries || 'average'] || 3600;
  if (s.le_has_car) total += 3600;
  total += (s.le_phone_monthly || 0) * 12;
  total += (s.le_healthcare_monthly || 0) * 12;
  total += (s.le_clothing_monthly || 0) * 12;
  return total;
}

function onLivingChange(field, value) {
  State.patchScenario({ [field]: value });
  renderActiveScenarioEditor();
  renderProjChart();
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

  const job   = JOBS.find(j => j.id === s.job_id) || JOBS[0];
  const effS0 = s.custom_s0 != null ? s.custom_s0 : job.s0;

  const healthInsuranceAnnual = calcHealthInsuranceAnnual(s);

  const financeCount = (s.assets || []).length + (s.debts || []).length;
  const eventCount   = (s.events || []).length;

  function secHdr(key, title, badge, onclickFn) {
    const open = _openSections[key];
    const handler = onclickFn || `toggleSection('${key}')`;
    return `<div class="sec-hdr" onclick="${handler}">
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

      <!-- Start Age + State -->
      <div class="field-row" style="margin-bottom:14px;">
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Starting Age</label>
          <input type="number" min="0" max="80" value="${s.start_age}" onchange="State.patchScenario({start_age:+this.value});renderActiveScenarioEditor();renderProjChart()"/>
        </div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Retire Age</label>
          <input type="number" min="40" max="90" value="${s.retire_age ?? 65}" onchange="State.patchScenario({retire_age:+this.value});renderProjChart()"/>
        </div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">State</label>
          <select onchange="State.patchScenario({state_code:this.value});renderActiveScenarioEditor();renderProjChart()">
            ${[
              ['none','No state tax'],
              ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],
              ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
              ['DC','D.C.'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],
              ['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
              ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],
              ['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
              ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],
              ['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],
              ['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
              ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
              ['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],
              ['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],
              ['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
            ].map(([code, name]) => `<option value="${code}"${(s.state_code||'none')===code?' selected':''}>${name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- ── School ── -->
      ${secHdr('school', 'School', (s.schools||[]).length || '')}
      <div class="sec-body" style="display:${_openSections.school ? '' : 'none'};">
        ${(() => {
          const schools = (s.schools || []).slice().sort((a, b) => a.start_age - b.start_age);
          return `
        ${schools.length === 0 ? `<p class="micro" style="color:var(--muted2);margin-bottom:10px;text-transform:none;letter-spacing:0;font-size:11px;">Add schools below. Each entry tracks tuition and auto-creates a student loan.</p>` : ''}
        ${schools.map((sc, i) => {
          const RATE = sc.type === 'undergrad' ? 6.54 : 7.05;
          const r2   = RATE / 100 / 12;
          let rawLoan = 0;
          for (let y = 0; y < sc.years; y++) {
            rawLoan += Math.max(0, (sc.tuition_annual||0) - (y < (sc.scholarship_years||0) ? (sc.scholarship_annual||0) : 0));
          }
          const capBalance = r2 > 0 ? Math.round(rawLoan * Math.pow(1 + r2, sc.years * 12 + 6)) : rawLoan;
          const repayAge   = sc.start_age + sc.years + 1;
          const hasLoan    = !sc.parent_pays && rawLoan > 0;

          return `<div style="background:var(--bg2);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span class="micro" style="text-transform:none;letter-spacing:0;font-weight:600;">${sc.name || 'School ' + (i+1)}</span>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteSchool(${sc.id})">✕</button>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Type</label>
                <select onchange="updateSchool(${sc.id},{type:this.value})">
                  <option value="undergrad"${sc.type==='undergrad'?' selected':''}>Undergrad</option>
                  <option value="grad"${sc.type==='grad'?' selected':''}>Graduate</option>
                  <option value="professional"${sc.type==='professional'?' selected':''}>Professional (MBA/JD/MD)</option>
                </select>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">School Name</label>
                <input type="text" value="${sc.name||''}" placeholder="e.g. State University"
                  onchange="updateSchool(${sc.id},{name:this.value})"/>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Annual Tuition ($)</label>
                <input type="number" min="0" value="${sc.tuition_annual||0}"
                  onchange="updateSchool(${sc.id},{tuition_annual:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Years</label>
                <input type="number" min="1" max="12" value="${sc.years||4}"
                  onchange="updateSchool(${sc.id},{years:+this.value})"/>
              </div>
            </div>
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Start Age</label>
              <input type="number" min="14" max="70" value="${sc.start_age||18}"
                onchange="updateSchool(${sc.id},{start_age:+this.value})"/>
            </div>
            <label class="micro" style="display:block;margin-bottom:6px;margin-top:8px;">Does Mommy or Daddy pay for tuition?</label>
            <div style="display:flex;gap:8px;margin-bottom:10px;">
              <button class="btn btn-sm${sc.parent_pays?' btn-primary':' btn-ghost'}"
                onclick="updateSchool(${sc.id},{parent_pays:1})">Yes 🎓 Covered!</button>
              <button class="btn btn-sm${!sc.parent_pays?' btn-primary':' btn-ghost'}"
                onclick="updateSchool(${sc.id},{parent_pays:0})">No 💸 Need a loan</button>
            </div>
            <label class="micro" style="display:block;margin-bottom:6px;">Scholarships / Aid</label>
            <div class="field-row">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Annual Award ($)</label>
                <input type="number" min="0" value="${sc.scholarship_annual||0}"
                  onchange="updateSchool(${sc.id},{scholarship_annual:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">For # of Years</label>
                <input type="number" min="0" max="12" value="${sc.scholarship_years||0}"
                  onchange="updateSchool(${sc.id},{scholarship_years:+this.value})"/>
              </div>
            </div>
            ${hasLoan ? `
            <div style="background:var(--bg3,var(--bg));border-radius:6px;padding:8px 10px;margin-top:6px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                <span class="micro" style="text-transform:none;letter-spacing:0;">Auto Student Loan</span>
                <span style="font-size:12px;font-weight:600;color:var(--coral);">${fmtM(capBalance)}</span>
              </div>
              <span class="micro" style="color:var(--muted2);text-transform:none;letter-spacing:0;">Repayment age ${repayAge} · 10yr @ ${RATE}% · interest accrues during school</span>
            </div>` : sc.parent_pays ? `
            <div style="background:var(--bg3,var(--bg));border-radius:6px;padding:8px 10px;margin-top:6px;">
              <span class="micro" style="color:var(--accent);text-transform:none;letter-spacing:0;">Tuition covered — no loan needed</span>
            </div>` : rawLoan <= 0 && (sc.tuition_annual||0) > 0 ? `
            <div style="background:var(--bg3,var(--bg));border-radius:6px;padding:8px 10px;margin-top:6px;">
              <span class="micro" style="color:var(--accent);text-transform:none;letter-spacing:0;">Aid covers full tuition — no loan needed</span>
            </div>` : ''}
          </div>`;
        }).join('')}
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:16px;" onclick="addSchool()">+ Add School</button>`;
        })()}
      </div>

      <!-- ── Career ── -->
      ${secHdr('career', 'Career', (s.careers||[]).length || '')}
      <div class="sec-body" style="display:${_openSections.career ? '' : 'none'};">
        ${(s.careers || []).length === 0 ? `
        <p class="micro" style="color:var(--muted2);margin-bottom:10px;text-transform:none;letter-spacing:0;font-size:11px;">
          Add careers below. Each career has its own salary curve and active age range.
        </p>` : ''}
        ${(s.careers || []).sort((a,b) => a.start_age - b.start_age).map((c, i) => {
          const cJob = JOBS.find(j => j.id === c.job_id) || JOBS[0];
          const cs0  = c.custom_s0  != null ? c.custom_s0  : cJob.s0;
          const cs50 = c.custom_s50 != null ? c.custom_s50 : cJob.s50;
          return `<div style="background:var(--bg2);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span class="micro" style="text-transform:none;letter-spacing:0;font-weight:600;">Career ${i+1}</span>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteCareer(${c.id})">✕</button>
            </div>
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Career Path</label>
              <select onchange="updateCareer(${c.id},{job_id:this.value})">
                ${JOBS.map(j => `<option value="${j.id}"${j.id===c.job_id?' selected':''}>${j.name}</option>`).join('')}
              </select>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Start Salary ($)</label>
                <input type="number" value="${cs0}" onchange="updateCareer(${c.id},{custom_s0:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Peak Salary ($)</label>
                <input type="number" value="${cs50}" onchange="updateCareer(${c.id},{custom_s50:+this.value})"/>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Start Age</label>
                <input type="number" min="14" max="80" value="${c.start_age}" onchange="updateCareer(${c.id},{start_age:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">End Age (blank = until retirement)</label>
                <input type="number" min="14" max="80" value="${c.end_age != null ? c.end_age : ''}" placeholder="—"
                  onchange="updateCareer(${c.id},{end_age:this.value?+this.value:null})"/>
              </div>
            </div>
          </div>`;
        }).join('')}
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:16px;" onclick="addCareer()">+ Add Career</button>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <label class="micro" style="text-transform:none;letter-spacing:0;margin:0;">Employer health insurance</label>
          <label style="position:relative;display:inline-flex;align-items:center;cursor:pointer;margin-left:auto;">
            <input type="checkbox" ${(s.health_insurance_enabled ?? 1) ? 'checked' : ''}
              onchange="State.patchScenario({health_insurance_enabled:this.checked?1:0});renderActiveScenarioEditor();renderProjChart()"
              style="opacity:0;width:0;height:0;position:absolute;"/>
            <span style="display:inline-block;width:36px;height:20px;background:${(s.health_insurance_enabled ?? 1) ? 'var(--accent)' : 'var(--muted2)'};border-radius:10px;transition:background 0.2s;position:relative;">
              <span style="position:absolute;top:2px;left:${(s.health_insurance_enabled ?? 1) ? '18px' : '2px'};width:16px;height:16px;background:#fff;border-radius:50%;transition:left 0.2s;"></span>
            </span>
          </label>
        </div>
        ${(s.health_insurance_enabled ?? 1) ? `
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Health Insurance Plan</label>
            <select onchange="State.patchScenario({health_insurance_plan:this.value});renderActiveScenarioEditor();renderProjChart()">
              <option value="basic"    ${(s.health_insurance_plan||'standard')==='basic'    ? 'selected':''}>Basic HMO</option>
              <option value="standard" ${(s.health_insurance_plan||'standard')==='standard' ? 'selected':''}>Standard PPO</option>
              <option value="premium"  ${(s.health_insurance_plan||'standard')==='premium'  ? 'selected':''}>Premium PPO</option>
            </select>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Coverage</label>
            <select onchange="State.patchScenario({health_insurance_coverage:this.value});renderActiveScenarioEditor();renderProjChart()">
              <option value="single"  ${(s.health_insurance_coverage||'single')==='single'  ? 'selected':''}>Just me</option>
              <option value="partner" ${(s.health_insurance_coverage||'single')==='partner' ? 'selected':''}>Me + partner</option>
              <option value="kids"    ${(s.health_insurance_coverage||'single')==='kids'    ? 'selected':''}>Me + kids</option>
              <option value="family"  ${(s.health_insurance_coverage||'single')==='family'  ? 'selected':''}>Family</option>
            </select>
          </div>
        </div>
        <p class="micro" style="color:var(--muted2);margin-top:-4px;margin-bottom:14px;text-transform:none;letter-spacing:0;font-size:11px;">Est. employee share based on 2024 employer benefit averages</p>
        ` : `<p class="micro" style="color:var(--muted2);margin-bottom:14px;text-transform:none;letter-spacing:0;font-size:11px;">Health insurance not included in take-home calculation</p>`}

        ${(() => {
          const sortedCareers = (s.careers || []).slice().sort((a,b) => a.start_age - b.start_age);
          const breakdownItems = sortedCareers.length > 0
            ? sortedCareers.map((c, i) => {
                const cJob = JOBS.find(j => j.id === c.job_id) || JOBS[0];
                const cs0  = c.custom_s0 != null ? c.custom_s0 : cJob.s0;
                const bd   = calcTakeHomeBreakdown(cs0, s.state_code, healthInsuranceAnnual);
                const ageRange = c.end_age != null ? `Age ${c.start_age}–${c.end_age}` : `Age ${c.start_age}+`;
                return { label: `Career ${i+1} — ${cJob.name} (${ageRange})`, bd };
              })
            : [{ label: null, bd: calcTakeHomeBreakdown(effS0, s.state_code, healthInsuranceAnnual) }];
          return breakdownItems.map(({ label, bd }) => `
          <div style="background:var(--bg2);border-radius:8px;padding:10px 12px;margin-bottom:4px;">
            ${label ? `<div style="margin-bottom:6px;"><span class="micro" style="text-transform:none;letter-spacing:0;font-weight:600;">${label}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span class="micro" style="text-transform:none;letter-spacing:0;">Gross Salary</span>
              <span style="font-size:13px;font-weight:600;">${fmtM(bd.gross)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span class="micro" style="color:var(--coral);text-transform:none;letter-spacing:0;">− Federal Tax</span>
              <span style="font-size:12px;color:var(--coral);">−${fmtM(bd.federal)}</span>
            </div>
            ${bd.state > 0 ? `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span class="micro" style="color:var(--coral);text-transform:none;letter-spacing:0;">− State Tax</span>
              <span style="font-size:12px;color:var(--coral);">−${fmtM(bd.state)}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span class="micro" style="color:var(--coral);text-transform:none;letter-spacing:0;">− FICA (SS + Medicare)</span>
              <span style="font-size:12px;color:var(--coral);">−${fmtM(bd.fica)}</span>
            </div>
            ${bd.health > 0 ? `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span class="micro" style="color:var(--coral);text-transform:none;letter-spacing:0;">− Health Insurance</span>
              <span style="font-size:12px;color:var(--coral);">−${fmtM(bd.health)}</span>
            </div>` : ''}
            <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;">
              <span class="micro" style="text-transform:none;letter-spacing:0;">Est. Take-Home</span>
              <span style="font-size:14px;font-weight:700;color:var(--accent);">${fmtM(bd.takeHome)}/yr</span>
            </div>
          </div>`).join('');
        })()}
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
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Acquired at age</label>
            <input type="number" id="asset-start-age" placeholder="${s.start_age} (now)"/>
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
            <label class="micro" style="display:block;margin-bottom:5px;">Monthly Payment ($) — <a onclick="autoCalcDebtPayment()" style="font-size:10px;cursor:pointer;color:var(--teal);">Auto (10yr)</a></label>
            <input type="number" id="debt-pmt" placeholder="0"/>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Started at age</label>
            <input type="number" id="debt-start-age" placeholder="${s.start_age} (now)"/>
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
        </div>
        <div class="field-row">
          <div class="field">
            <label class="micro" id="ev-cost-label" style="display:block;margin-bottom:5px;">One-time Cost ($)</label>
            <input type="number" id="ev-cost" placeholder="0"/>
          </div>
          <div id="ev-annual-field" class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Annual Impact ($)</label>
            <input type="number" id="ev-annual" placeholder="0"/>
          </div>
        </div>
        <div id="ev-years-field" class="field-row">
          <div class="field" style="max-width:50%">
            <label class="micro" style="display:block;margin-bottom:5px;">Duration (yrs)</label>
            <input type="number" id="ev-years" value="1" min="1" max="50"/>
          </div>
        </div>
        <div id="ev-house-fields" style="display:none;">
          <div class="field-row">
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Home Value ($)</label>
              <input type="number" id="ev-home-value" placeholder="400000" oninput="updateMortgagePreview()"/>
            </div>
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Appreciation Rate (%)</label>
              <input type="number" id="ev-home-appreciation" placeholder="3" step="0.5"/>
            </div>
          </div>
          <div class="field-row">
            <div class="field" style="max-width:50%">
              <label class="micro" style="display:block;margin-bottom:5px;">Annual Ownership Cost (%)</label>
              <input type="number" id="ev-annual-cost-pct" placeholder="3" step="0.5" min="0" max="20"
                oninput="updateMortgagePreview()"/>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Mortgage Rate (%)</label>
              <input type="number" id="ev-mortgage-rate" placeholder="7" step="0.25" oninput="updateMortgagePreview()"/>
            </div>
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Mortgage Term (yrs)</label>
              <input type="number" id="ev-mortgage-years" placeholder="30" oninput="updateMortgagePreview()"/>
            </div>
          </div>
          <p id="ev-mortgage-preview" style="font-size:11px;color:var(--accent);margin-bottom:10px;"></p>
        </div>
        <div id="ev-spouse-fields" style="display:none;">
          <p class="micro" style="color:var(--muted2);margin-bottom:8px;text-transform:none;letter-spacing:0;font-size:11px;">Spouse's career — income added to Cash In each year of the marriage</p>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Spouse Career</label>
            <select id="ev-spouse-job" onchange="updateSpouseSalaryDefaults()">
              ${JOBS.map(j => `<option value="${j.id}">${j.name}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Start Salary ($)</label>
              <input type="number" id="ev-spouse-s0" placeholder="60000"/>
            </div>
            <div class="field">
              <label class="micro" style="display:block;margin-bottom:5px;">Peak Salary ($)</label>
              <input type="number" id="ev-spouse-s50" placeholder="100000"/>
            </div>
          </div>
          <div class="field" style="max-width:50%;">
            <label class="micro" style="display:block;margin-bottom:5px;">Spouse Career Start Age</label>
            <input type="number" id="ev-spouse-career-start" placeholder="22"/>
          </div>
        </div>
        <p id="ev-cost-hint" style="font-size:11px;color:var(--muted2);margin-bottom:10px;">
          Positive = expense. For inheritance or income events, enter as positive — the app flips the sign.
        </p>
        <button class="btn btn-primary" style="margin-bottom:16px;" onclick="addEvent()">Add to Timeline</button>
        <div id="event-list"></div>
      </div>

      <!-- ── Lifestyle ── -->
      ${secHdr('living', 'Lifestyle', (s.lifestyles||[]).length || '', 'toggleLiving()')}
      <div class="sec-body" style="display:${_openSections.living ? '' : 'none'};">

        <!-- Rent timing — scenario-level -->
        <div class="field-row" style="margin-bottom:10px;">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Rent Start Age</label>
            <input type="number" min="16" max="80" value="${s.rent_start_age != null ? s.rent_start_age : (s.start_age || 25)}"
              onchange="State.patchScenario({rent_start_age:+this.value});renderProjChart()"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Rent End Age</label>
            <input type="number" min="16" max="80" value="${s.rent_end_age != null ? s.rent_end_age : ''}"
              placeholder="— (house purchase)"
              onchange="State.patchScenario({rent_end_age:this.value?+this.value:null});renderProjChart()"/>
          </div>
        </div>
        <p class="micro" style="color:var(--muted2);margin-bottom:12px;text-transform:none;letter-spacing:0;font-size:11px;">
          Rent stops automatically when you add a House Purchase life event. Set End Age to override.
        </p>

        <!-- Lifestyle period cards -->
        ${(() => {
          const lifestyles = (s.lifestyles || []).slice().sort((a, b) => a.start_age - b.start_age);
          return `
        ${lifestyles.length === 0 ? `<p class="micro" style="color:var(--muted2);margin-bottom:10px;text-transform:none;letter-spacing:0;font-size:11px;">Add lifestyle periods below. Each period sets your living expenses from that age onward.</p>` : ''}
        ${lifestyles.map((l, i) => `<div style="background:var(--bg2);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span class="micro" style="text-transform:none;letter-spacing:0;font-weight:600;">Period ${i+1} — Age ${l.start_age}+</span>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteLifestyle(${l.id})">✕</button>
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label class="micro" style="display:block;margin-bottom:5px;">Start Age</label>
              <input type="number" min="14" max="80" value="${l.start_age}"
                onchange="updateLifestyle(${l.id},{start_age:+this.value})"/>
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label class="micro" style="display:block;margin-bottom:5px;">Housing Tier</label>
              <select onchange="updateLifestyle(${l.id},{le_housing_tier:this.value})">
                <option value="shared"      ${(l.le_housing_tier||'modest')==='shared'      ? 'selected':''}>Shared / roommates (~$700/mo)</option>
                <option value="basic"       ${(l.le_housing_tier||'modest')==='basic'       ? 'selected':''}>Basic studio (~$1,000/mo)</option>
                <option value="modest"      ${(l.le_housing_tier||'modest')==='modest'      ? 'selected':''}>Modest 1BR (~$1,400/mo)</option>
                <option value="comfortable" ${(l.le_housing_tier||'modest')==='comfortable' ? 'selected':''}>Comfortable (~$2,000/mo)</option>
                <option value="upscale"     ${(l.le_housing_tier||'modest')==='upscale'     ? 'selected':''}>Upscale (~$3,000/mo)</option>
                <option value="luxury"      ${(l.le_housing_tier||'modest')==='luxury'      ? 'selected':''}>Luxury (~$5,000/mo)</option>
              </select>
            </div>
            <div class="field-row" style="margin-bottom:10px;">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Monthly Utilities ($)</label>
                <input type="number" placeholder="150" value="${l.le_utilities_monthly||''}"
                  onchange="updateLifestyle(${l.id},{le_utilities_monthly:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Phone ($)</label>
                <input type="number" placeholder="80" value="${l.le_phone_monthly||''}"
                  onchange="updateLifestyle(${l.id},{le_phone_monthly:+this.value})"/>
              </div>
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label class="micro" style="display:block;margin-bottom:5px;">Groceries</label>
              <select onchange="updateLifestyle(${l.id},{le_groceries:this.value})">
                <option value="basic"    ${(l.le_groceries||'average')==='basic'    ? 'selected':''}>Basic (~$2,400/yr)</option>
                <option value="average"  ${(l.le_groceries||'average')==='average'  ? 'selected':''}>Average (~$3,600/yr)</option>
                <option value="generous" ${(l.le_groceries||'average')==='generous' ? 'selected':''}>Well-stocked (~$5,400/yr)</option>
              </select>
            </div>
            <div class="field" style="margin-bottom:10px;">
              <label class="micro" style="display:block;margin-bottom:5px;">Dining Out</label>
              <select onchange="updateLifestyle(${l.id},{le_dining:this.value})">
                <option value="never"      ${(l.le_dining||'never')==='never'      ? 'selected':''}>Never (~$0/yr)</option>
                <option value="sometimes"  ${(l.le_dining||'never')==='sometimes'  ? 'selected':''}>Sometimes (~$1,200/yr)</option>
                <option value="often"      ${(l.le_dining||'never')==='often'      ? 'selected':''}>Often (~$3,600/yr)</option>
                <option value="frequently" ${(l.le_dining||'never')==='frequently' ? 'selected':''}>Frequently (~$7,200/yr)</option>
              </select>
            </div>
            <div class="field-row" style="margin-bottom:10px;align-items:center;">
              <label class="micro" style="flex:1;text-transform:none;letter-spacing:0;">Car (~$3,600/yr)</label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" ${l.le_has_car ? 'checked':''}
                  onchange="updateLifestyle(${l.id},{le_has_car:this.checked?1:0})"/>
                <span class="micro" style="text-transform:none;">Yes</span>
              </label>
            </div>
            <div class="field-row" style="margin-bottom:10px;">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Pets (~$1,500/pet)</label>
                <input type="number" min="0" max="20" placeholder="0" value="${l.le_pet_count||0}"
                  onchange="updateLifestyle(${l.id},{le_pet_count:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Healthcare OOP ($)</label>
                <input type="number" placeholder="150" value="${l.le_healthcare_monthly||''}"
                  onchange="updateLifestyle(${l.id},{le_healthcare_monthly:+this.value})"/>
              </div>
            </div>
            <div class="field-row" style="margin-bottom:10px;">
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Clothing ($)</label>
                <input type="number" placeholder="100" value="${l.le_clothing_monthly||''}"
                  onchange="updateLifestyle(${l.id},{le_clothing_monthly:+this.value})"/>
              </div>
              <div class="field">
                <label class="micro" style="display:block;margin-bottom:5px;">Other Annual ($)</label>
                <input type="number" placeholder="0" value="${l.annual_expenses||''}"
                  onchange="updateLifestyle(${l.id},{annual_expenses:+this.value})"/>
              </div>
            </div>
            <div style="background:var(--bg3,var(--bg));border-radius:6px;padding:8px 10px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;">
              <span class="micro" style="text-transform:none;letter-spacing:0;">Est. Annual Living</span>
              <span style="font-size:12px;font-weight:600;color:var(--accent);">${fmtM((l.annual_expenses||0) + calcLivingExpensesUI(l))}</span>
            </div>
          </div>`).join('')}
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:16px;" onclick="addLifestyle()">+ Add Lifestyle Period</button>`;
        })()}

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
  const pill = document.querySelector('#scenario-editors .path-pill');
  if (pill) pill.textContent = '● ' + name;
}

function onJobChange(val) {
  // Clear salary overrides so new job's defaults populate the fields
  State.patchScenario({ job_id: val, custom_s0: null, custom_s35: null, custom_s50: null });
  renderActiveScenarioEditor();
  renderProjChart();
}

// ── School management ─────────────────────────────────────────────────────────
async function addSchool() {
  const s = State.getScenario();
  if (!s) return;
  const existing = (s.schools || []).slice().sort((a, b) => a.start_age - b.start_age);
  const last = existing[existing.length - 1];
  const defaultStart = last ? last.start_age + last.years + 1 : (s.start_age || 18);
  const defaultType  = last ? 'grad' : 'undergrad';
  try {
    const sc = await api.createSchool(s.id, { type: defaultType, name: '', tuition_annual: 0, years: defaultType === 'undergrad' ? 4 : 2, start_age: defaultStart, parent_pays: 0, scholarship_annual: 0, scholarship_years: 0 });
    State.addSchool(sc);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function updateSchool(schoolId, fields) {
  const s = State.getScenario();
  if (!s) return;
  try {
    const updated = await api.updateSchool(s.id, schoolId, fields);
    State.updateSchool(updated);
    await syncSchoolLoanForEntry(updated);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteSchool(schoolId) {
  const s = State.getScenario();
  if (!s) return;
  const sc = (s.schools || []).find(x => x.id === schoolId);
  try {
    if (sc?.loan_id) {
      await api.deleteDebt(s.id, sc.loan_id);
      State.removeDebt(sc.loan_id);
    }
    await api.deleteSchool(s.id, schoolId);
    State.removeSchool(schoolId);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

// ── Lifestyle management ───────────────────────────────────────────────────────
async function addLifestyle() {
  const s = State.getScenario();
  if (!s) return;
  const existing = (s.lifestyles || []).slice().sort((a, b) => a.start_age - b.start_age);
  const last = existing[existing.length - 1];
  const defaultStart = last ? last.start_age + 10 : (s.start_age || 22);
  try {
    const l = await api.createLifestyle(s.id, { start_age: defaultStart });
    State.addLifestyle(l);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function updateLifestyle(lifestyleId, fields) {
  const s = State.getScenario();
  if (!s) return;
  try {
    const updated = await api.updateLifestyle(s.id, lifestyleId, fields);
    State.updateLifestyle(updated);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteLifestyle(lifestyleId) {
  const s = State.getScenario();
  if (!s) return;
  try {
    await api.deleteLifestyle(s.id, lifestyleId);
    State.removeLifestyle(lifestyleId);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

// ── Multi-career management ────────────────────────────────────────────────────
async function addCareer() {
  const s = State.getScenario();
  if (!s) return;
  const existingCareers = s.careers || [];
  // Default start age: after the last career ends, or career_start_age, or 22
  const lastCareer = existingCareers.sort((a,b) => a.start_age - b.start_age).slice(-1)[0];
  const defaultStart = lastCareer ? (lastCareer.end_age || (lastCareer.start_age + 10)) : (s.career_start_age || 22);
  const job = JOBS[0];
  try {
    const career = await api.createCareer(s.id, {
      job_id: job.id, start_age: defaultStart, custom_s0: job.s0, custom_s50: job.s50,
    });
    State.addCareer(career);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function updateCareer(careerId, fields) {
  const s = State.getScenario();
  if (!s) return;
  // If salary field changed, also auto-compute s35
  if (fields.custom_s0 != null || fields.custom_s50 != null) {
    const career = (s.careers || []).find(c => c.id === careerId);
    if (career) {
      const job = JOBS.find(j => j.id === career.job_id) || JOBS[0];
      const s0  = fields.custom_s0  != null ? fields.custom_s0  : (career.custom_s0  ?? job.s0);
      const s50 = fields.custom_s50 != null ? fields.custom_s50 : (career.custom_s50 ?? job.s50);
      fields.custom_s35 = Math.round(s0 + (s50 - s0) * 0.65);
    }
  }
  // If job changed, clear custom salary so defaults kick in
  if (fields.job_id != null) {
    fields.custom_s0 = null; fields.custom_s35 = null; fields.custom_s50 = null;
  }
  try {
    const updated = await api.updateCareer(s.id, careerId, fields);
    State.updateCareer(updated);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteCareer(careerId) {
  const s = State.getScenario();
  if (!s) return;
  try {
    await api.deleteCareer(s.id, careerId);
    State.removeCareer(careerId);
    renderActiveScenarioEditor();
    renderProjChart();
  } catch (err) { showToast(err.message, true); }
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

