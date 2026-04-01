/* ══════════════════════════════════════════════
   projections.js — Projection chart + scenario editors
══════════════════════════════════════════════ */

const milestonePlugin = {
    id: 'milestones',
    afterDraw(chart) {
      if (!ST.events.length) return;
      const { ctx, chartArea, scales } = chart;
      ST.events.forEach(ev => {
        const x = scales.x.getPixelForValue(ev.age);
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
  
  function renderProjChart() {
    const ages    = getAges();
    const visible = ST.showC ? ST.scenarios : ST.scenarios.slice(0, 2);
    const results = visible.map((s, i) => calculatePath(s, i));
  
    const datasets = visible.map((s, i) => ({
      label: s.label, data: applyInflation(results[i].path),
      borderColor: s.color, backgroundColor: s.color + '10',
      fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2.5,
    }));
  
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
    document.getElementById('proj-legend').innerHTML = visible.map(s =>
      `<div class="legend-item">
        <div class="legend-line" style="background:${s.color}"></div>
        <span>${s.label}</span>
      </div>`).join('');
  
    // Stat boxes
    document.getElementById('proj-stats').innerHTML = `<div class="stats-row">` +
      visible.map((s, i) => {
        const path  = applyInflation(results[i].path);
        const final = path[path.length - 1];
        const inc   = Math.round(results[i].annualDrawn);
        return `<div class="stat-box">
          <div class="stat-val" style="color:${s.color}">${fmtM(final)}</div>
          <div class="stat-sub">${s.label} @ ${ST.startAge + 45}</div>
          <div class="stat-sub" style="margin-top:3px;color:var(--muted)">~${fmtM(inc)}/yr</div>
        </div>`;
      }).join('') + `</div>`;
  
    // Breakeven
    const pA = applyInflation(results[0].path);
    const pB = applyInflation(results[1].path);
    let be = null;
    for (let i = 1; i < pA.length; i++) {
      if ((pA[i] > pB[i]) !== (pA[i-1] > pB[i-1])) { be = ages[i]; break; }
    }
    const beEl = document.getElementById('proj-breakeven');
    if (be) {
      const leader  = pA[be - ST.startAge] > pB[be - ST.startAge] ? 'Path A' : 'Path B';
      const laggard = leader === 'Path A' ? 'Path B' : 'Path A';
      const lc      = leader === 'Path A' ? visible[0].color : visible[1].color;
      beEl.innerHTML = `<div class="breakeven">
        <div style="width:8px;height:8px;border-radius:50%;background:${lc};flex-shrink:0;"></div>
        <span style="color:var(--muted2);font-size:12px;">
          <strong style="color:${lc}">${leader}</strong> overtakes ${laggard} at age
          <strong style="color:var(--text)">${be}</strong>
        </span>
      </div>`;
    } else { beEl.innerHTML = ''; }
  }
  
  function renderScenarioEditors() {
    const container = document.getElementById('scenario-editors');
    container.innerHTML = '';
    const visible = ST.showC ? ST.scenarios : ST.scenarios.slice(0, 2);
  
    visible.forEach((s, i) => {
      const isCustom = s.jobId === 'custom';
      const card = document.createElement('div');
      card.className = 'card card-alt fade-up';
      card.innerHTML = `
        <div class="path-pill" style="background:${s.color}15;color:${s.color};margin-bottom:14px;">● ${s.label}</div>
        <div class="field">
          <label class="micro" style="display:block;margin-bottom:5px;">Career Path</label>
          <select onchange="onJobChange(${i},this.value)">
            ${JOBS.map(j=>`<option value="${j.id}"${j.id===s.jobId?' selected':''}>${j.name}</option>`).join('')}
          </select>
        </div>
        ${isCustom ? `
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Start Salary ($)</label>
            <input type="number" value="${s._cs0||60000}" onchange="setCustomSal(${i},'s0',this.value)"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Peak Salary ($)</label>
            <input type="number" value="${s._cs50||115000}" onchange="setCustomSal(${i},'s50',this.value)"/>
          </div>
        </div>` : ''}
        <div class="field-row">
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Assets ($)</label>
            <input type="number" value="${s.currentAssets}" onchange="upd(${i},'currentAssets',this.value)"/>
          </div>
          <div class="field">
            <label class="micro" style="display:block;margin-bottom:5px;">Debt ($)</label>
            <input type="number" value="${s.currentDebt}" onchange="upd(${i},'currentDebt',this.value)"/>
          </div>
        </div>
        <div class="field">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <label class="micro">Savings Rate</label>
            <span class="micro num" id="sl-sp-${i}" style="color:var(--text)">${s.savePct}%</span>
          </div>
          <input type="range" min="0" max="70" value="${s.savePct}" oninput="updSlider(${i},'savePct',this.value,'sp','%')"/>
        </div>
        <div class="field">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <label class="micro">Avg. Return Rate</label>
            <span class="micro num" id="sl-rr-${i}" style="color:var(--text)">${s.returnRate}%</span>
          </div>
          <input type="range" min="1" max="14" step="0.5" value="${s.returnRate}" oninput="updSlider(${i},'returnRate',this.value,'rr','%')"/>
        </div>
        <div class="field">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <label class="micro">Target Retirement Age</label>
            <span class="micro num" id="sl-ra-${i}" style="color:var(--text)">${s.retireAge}</span>
          </div>
          <input type="range" min="45" max="75" value="${s.retireAge}" oninput="updSlider(${i},'retireAge',this.value,'ra','')"/>
        </div>`;
      container.appendChild(card);
    });
  
    document.getElementById('path-c-toggle-btn').textContent =
      ST.showC ? '－ Remove Path C' : '＋ Add a third scenario';
  }
  
  function onJobChange(i, val) {
    ST.scenarios[i].jobId = val;
    if (val === 'custom') {
      ST.scenarios[i]._cs0  = ST.scenarios[i]._cs0  || 60000;
      ST.scenarios[i]._cs50 = ST.scenarios[i]._cs50 || 115000;
    }
    save(); renderScenarioEditors(); renderProjChart();
  }
  
  function setCustomSal(i, field, value) {
    const v = parseFloat(value) || 0;
    const cj = JOBS.find(j => j.id === 'custom');
    if (field === 's0')  { ST.scenarios[i]._cs0  = v; cj.s0  = v; }
    if (field === 's50') { ST.scenarios[i]._cs50 = v; cj.s50 = v; cj.s35 = Math.round(v * 0.85); }
    save(); renderProjChart();
  }
  
  function upd(i, key, value) {
    ST.scenarios[i][key] = parseFloat(value) || 0;
    save(); renderProjChart();
  }
  
  function updSlider(i, key, value, abbr, suffix) {
    ST.scenarios[i][key] = parseFloat(value);
    const lbl = document.getElementById(`sl-${abbr}-${i}`);
    if (lbl) lbl.textContent = value + suffix;
    save(); renderProjChart();
  }
  
  function togglePathC() {
    ST.showC = !ST.showC;
    if (ST.showC && ST.scenarios.length < 3) {
      ST.scenarios.push({
        label: 'Path C', color: '#f0a040', jobId: 'electrician',
        currentAssets: 8000, currentDebt: 10000,
        savePct: 18, returnRate: 7, retireAge: 67,
      });
    }
    save();
    const mcBtn = document.getElementById('mc-btn-c');
    if (mcBtn) mcBtn.style.display = ST.showC ? '' : 'none';
    renderScenarioEditors(); renderProjChart();
  }
  
  function toggleInflation() {
    ST.inflation = !ST.inflation;
    document.getElementById('infl-toggle').classList.toggle('on', ST.inflation);
    renderProjChart();
  }