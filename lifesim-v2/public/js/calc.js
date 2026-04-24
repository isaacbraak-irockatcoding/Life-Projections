/* ══════════════════════════════════════════════
   calc.js — Compound Interest Calculator Tab
══════════════════════════════════════════════ */

let _calcChart = null;

const CALC_DEFAULTS = {
  principal:   1000,
  monthly:     100,
  rate:        7,
  freq:        12,   // monthly compounding
  years:       10,
};

let _calcState = Object.assign({}, CALC_DEFAULTS);

function _calcCompound(principal, monthly, annualRate, n, years) {
  const r = annualRate / 100;
  const rows = [];

  if (r === 0) {
    for (let y = 1; y <= years; y++) {
      const contribTotal = monthly * 12 * y;
      rows.push({
        year:    y,
        balance: principal + contribTotal,
        contrib: contribTotal,
        interest: 0,
      });
    }
    return rows;
  }

  let balance = principal;
  let totalContrib = 0;

  for (let y = 1; y <= years; y++) {
    // Compound for one year with monthly contributions added each period
    const periodsPerYear = n;
    const rPerPeriod = r / n;
    const monthlyEquiv = monthly; // always monthly input
    // Convert monthly contribution to per-compounding-period contribution
    const contribPerPeriod = monthly * 12 / n;

    for (let p = 0; p < periodsPerYear; p++) {
      balance = balance * (1 + rPerPeriod) + contribPerPeriod;
      totalContrib += contribPerPeriod;
    }

    rows.push({
      year:     y,
      balance:  balance,
      contrib:  totalContrib,
      interest: balance - principal - totalContrib,
    });
  }

  return rows;
}

function _fmt(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + Math.round(n).toLocaleString();
}

function _renderCalcChart(rows) {
  const canvas = document.getElementById('calc-chart');
  if (!canvas) return;
  if (_calcChart) { _calcChart.destroy(); _calcChart = null; }

  const labels   = rows.map(r => 'Yr ' + r.year);
  const principal = _calcState.principal;
  const contribs  = rows.map(r => Math.max(0, r.contrib));
  const interest  = rows.map(r => Math.max(0, r.interest));
  const principals = rows.map(() => principal);

  _calcChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Initial',
          data: principals,
          backgroundColor: 'rgba(55,65,110,0.85)',
          borderRadius: 2,
        },
        {
          label: 'Contributions',
          data: contribs,
          backgroundColor: 'rgba(240,160,64,0.85)',
          borderRadius: 2,
        },
        {
          label: 'Interest',
          data: interest,
          backgroundColor: 'rgba(0,212,170,0.85)',
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index' },
      plugins: {
        legend: {
          labels: { color: '#7a83a8', font: { size: 11 }, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + _fmt(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#7a83a8', font: { size: 10 } },
          grid:  { color: 'rgba(28,32,56,.6)' },
        },
        y: {
          stacked: true,
          ticks: {
            color: '#7a83a8',
            font:  { size: 10 },
            callback: v => _fmt(v),
          },
          grid: { color: 'rgba(28,32,56,.6)' },
        },
      },
    },
  });
}

function _renderCalcResults() {
  const { principal, monthly, rate, freq, years } = _calcState;
  const rows    = _calcCompound(principal, monthly, rate, freq, years);
  const last    = rows[rows.length - 1];
  const balance = last ? last.balance : principal;
  const totalContrib = last ? last.contrib : 0;
  const totalInterest = last ? last.interest : 0;

  const summaryEl = document.getElementById('calc-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="calc-result-main">${_fmt(balance)}</div>
      <div class="calc-result-sub">Final Balance after ${years} year${years !== 1 ? 's' : ''}</div>
      <div class="calc-result-row">
        <span>Initial deposit</span><span>${_fmt(principal)}</span>
      </div>
      <div class="calc-result-row">
        <span>Total contributions</span><span>${_fmt(totalContrib)}</span>
      </div>
      <div class="calc-result-row calc-result-interest">
        <span>Total interest earned</span><span>${_fmt(totalInterest)}</span>
      </div>
    `;
  }

  _renderCalcChart(rows);

  const tableEl = document.getElementById('calc-table-body');
  if (tableEl) {
    tableEl.innerHTML = rows.map(r => `
      <tr>
        <td>Year ${r.year}</td>
        <td>${_fmt(r.balance)}</td>
        <td>${_fmt(r.contrib)}</td>
        <td>${_fmt(Math.max(0, r.interest))}</td>
      </tr>
    `).join('');
  }
}

function _attachCalcListeners() {
  const fields = ['calc-principal', 'calc-monthly', 'calc-rate', 'calc-freq', 'calc-years-num'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (id === 'calc-principal') _calcState.principal = isNaN(v) ? 0 : Math.max(0, v);
      if (id === 'calc-monthly')   _calcState.monthly   = isNaN(v) ? 0 : Math.max(0, v);
      if (id === 'calc-rate')      _calcState.rate      = isNaN(v) ? 0 : Math.min(Math.max(0, v), 100);
      if (id === 'calc-freq')      _calcState.freq      = parseInt(el.value) || 12;
      if (id === 'calc-years-num') {
        _calcState.years = isNaN(v) ? 1 : Math.min(Math.max(1, Math.round(v)), 50);
        const slider = document.getElementById('calc-years-slider');
        if (slider) slider.value = _calcState.years;
      }
      _renderCalcResults();
    });
  });

  const slider = document.getElementById('calc-years-slider');
  if (slider) {
    slider.addEventListener('input', () => {
      _calcState.years = parseInt(slider.value) || 10;
      const numEl = document.getElementById('calc-years-num');
      if (numEl) numEl.value = _calcState.years;
      _renderCalcResults();
    });
  }
}

function renderCalcTab() {
  const el = document.getElementById('calc-content');
  if (!el) return;

  const s = _calcState;

  el.innerHTML = `
    <h2 class="calc-title">Compound Interest Calculator</h2>

    <div class="card calc-inputs-card">
      <div class="calc-grid">
        <label class="calc-label">
          Initial Amount
          <div class="calc-input-wrap">
            <span class="calc-prefix">$</span>
            <input id="calc-principal" class="calc-input" type="number" min="0" step="100"
              value="${s.principal}" placeholder="1000"/>
          </div>
        </label>

        <label class="calc-label">
          Monthly Contribution
          <div class="calc-input-wrap">
            <span class="calc-prefix">$</span>
            <input id="calc-monthly" class="calc-input" type="number" min="0" step="50"
              value="${s.monthly}" placeholder="100"/>
          </div>
        </label>

        <label class="calc-label">
          Annual Interest Rate
          <div class="calc-input-wrap">
            <input id="calc-rate" class="calc-input" type="number" min="0" max="100" step="0.1"
              value="${s.rate}" placeholder="7" style="padding-right:28px;"/>
            <span class="calc-suffix">%</span>
          </div>
        </label>

        <label class="calc-label">
          Compound Frequency
          <select id="calc-freq" class="calc-select">
            <option value="1"   ${s.freq===1    ? 'selected':''}>Annually</option>
            <option value="2"   ${s.freq===2    ? 'selected':''}>Semi-Annually</option>
            <option value="4"   ${s.freq===4    ? 'selected':''}>Quarterly</option>
            <option value="12"  ${s.freq===12   ? 'selected':''}>Monthly</option>
            <option value="365" ${s.freq===365  ? 'selected':''}>Daily</option>
          </select>
        </label>
      </div>

      <label class="calc-label" style="margin-top:16px;display:block;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span>Time Period</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <input id="calc-years-num" class="calc-input" type="number" min="1" max="50"
              value="${s.years}" style="width:56px;text-align:center;padding:4px 8px;"/>
            <span style="font-size:12px;color:var(--muted2);">years</span>
          </div>
        </div>
        <input id="calc-years-slider" type="range" min="1" max="50" value="${s.years}"
          style="width:100%;accent-color:var(--teal);cursor:pointer;"/>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:2px;">
          <span>1 yr</span><span>50 yrs</span>
        </div>
      </label>
    </div>

    <div class="card" id="calc-summary" style="text-align:center;"></div>

    <div class="card" style="padding:16px;">
      <div class="calc-chart-wrap">
        <canvas id="calc-chart"></canvas>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <button class="calc-table-toggle" onclick="
        const b = document.getElementById('calc-table-wrap');
        const open = b.style.display !== 'none';
        b.style.display = open ? 'none' : '';
        this.textContent = open ? '▸ Year-by-Year Breakdown' : '▾ Year-by-Year Breakdown';
      ">▸ Year-by-Year Breakdown</button>
      <div id="calc-table-wrap" style="display:none;overflow-x:auto;">
        <table class="calc-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Balance</th>
              <th>Contributions</th>
              <th>Interest</th>
            </tr>
          </thead>
          <tbody id="calc-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  _attachCalcListeners();
  _renderCalcResults();
}
