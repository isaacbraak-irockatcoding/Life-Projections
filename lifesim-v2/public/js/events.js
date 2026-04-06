/* ══════════════════════════════════════════════
   events.js — Life events timeline editor
   Events are synced to the server immediately
   (not batched with the Save button).
══════════════════════════════════════════════ */

let _selectedEventType = 'custom';
let _evColorIdx = 0;

function renderEventsTab() { /* replaced by inline section in scenario editor */ }

function calcMortgagePayment(principal, annualRate, years) {
  if (!principal || !years) return 0;
  if (annualRate === 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

function updateMortgagePreview() {
  const preview = document.getElementById('ev-mortgage-preview');
  if (!preview) return;
  const homeVal   = parseFloat(document.getElementById('ev-home-value')?.value) || 0;
  const downPmt   = parseFloat(document.getElementById('ev-cost')?.value) || 0;
  const rate      = parseFloat(document.getElementById('ev-mortgage-rate')?.value) || 7;
  const years     = parseInt(document.getElementById('ev-mortgage-years')?.value) || 30;
  const costPct   = parseFloat(document.getElementById('ev-annual-cost-pct')?.value) || 3;
  const principal = Math.max(0, homeVal - downPmt);
  const monthly   = calcMortgagePayment(principal, rate, years);
  const annualCosts = homeVal * costPct / 100;
  if (homeVal > 0) {
    preview.textContent = `Mortgage: ${fmtM(principal)} at ${rate}% → ${fmtM(Math.round(monthly))}/mo · Annual costs (${costPct}%): ${fmtM(Math.round(annualCosts))}/yr`;
  } else {
    preview.textContent = '';
  }
}

function renderEventTypeSelector() {
  const container = document.getElementById('ev-type-chips');
  if (!container) return;
  container.innerHTML = EVENT_TYPES.map(t =>
    `<button class="event-type-chip${t.id === _selectedEventType ? ' active' : ''}"
      onclick="selectEventType('${t.id}')">${t.emoji} ${t.label}</button>`
  ).join('');
  applyEventTypeDefaults(_selectedEventType);
}

function selectEventType(typeId) {
  _selectedEventType = typeId;
  renderEventTypeSelector();
  const isHouse = typeId === 'house_purchase';
  const houseFields  = document.getElementById('ev-house-fields');
  const annualField  = document.getElementById('ev-annual-field');
  const yearsField   = document.getElementById('ev-years-field');
  const costHint     = document.getElementById('ev-cost-hint');
  const costLabel    = document.getElementById('ev-cost-label');
  if (houseFields)  houseFields.style.display  = isHouse ? '' : 'none';
  if (annualField)  annualField.style.display   = isHouse ? 'none' : '';
  if (yearsField)   yearsField.style.display    = isHouse ? 'none' : '';
  if (costHint)     costHint.style.display      = isHouse ? 'none' : '';
  if (costLabel)    costLabel.textContent       = isHouse ? 'Down Payment ($)' : 'One-time Cost ($)';
}

function applyEventTypeDefaults(typeId) {
  const t = EVENT_TYPES.find(x => x.id === typeId);
  if (!t) return;
  const costEl   = document.getElementById('ev-cost');
  const annualEl = document.getElementById('ev-annual');
  const yearsEl  = document.getElementById('ev-years');
  const emojiEl  = document.getElementById('ev-emoji');
  if (costEl   && !costEl.value)   costEl.value   = t.defaultCost   !== 0 ? Math.abs(t.defaultCost)   : '';
  if (annualEl && !annualEl.value) annualEl.value = t.defaultAnnual !== 0 ? Math.abs(t.defaultAnnual) : '';
  if (yearsEl  && !yearsEl.value)  yearsEl.value  = t.defaultYears;
  if (emojiEl  && !emojiEl.value)  emojiEl.value  = t.emoji;

  const isHouse = typeId === 'house_purchase';
  const houseFields  = document.getElementById('ev-house-fields');
  const annualField  = document.getElementById('ev-annual-field');
  const yearsField   = document.getElementById('ev-years-field');
  const costHint     = document.getElementById('ev-cost-hint');
  const costLabel    = document.getElementById('ev-cost-label');
  if (houseFields)  houseFields.style.display  = isHouse ? '' : 'none';
  if (annualField)  annualField.style.display   = isHouse ? 'none' : '';
  if (yearsField)   yearsField.style.display    = isHouse ? 'none' : '';
  if (costHint)     costHint.style.display      = isHouse ? 'none' : '';
  if (costLabel)    costLabel.textContent       = isHouse ? 'Down Payment ($)' : 'One-time Cost ($)';

  if (isHouse) {
    const homeValEl  = document.getElementById('ev-home-value');
    const homeAppEl  = document.getElementById('ev-home-appreciation');
    const mortRateEl = document.getElementById('ev-mortgage-rate');
    const mortYrsEl  = document.getElementById('ev-mortgage-years');
    const costPctEl  = document.getElementById('ev-annual-cost-pct');
    if (homeValEl  && !homeValEl.value)  homeValEl.value  = t.defaultHomeValue || 400000;
    if (homeAppEl  && !homeAppEl.value)  homeAppEl.value  = t.defaultAppreciationRate || 3;
    if (mortRateEl && !mortRateEl.value) mortRateEl.value = 7;
    if (mortYrsEl  && !mortYrsEl.value)  mortYrsEl.value  = 30;
    if (costPctEl  && !costPctEl.value)  costPctEl.value  = 3;
    updateMortgagePreview();
  }
}

async function addEvent() {
  const scenario = State.getScenario();
  if (!scenario) return;

  const name   = document.getElementById('ev-name').value.trim();
  const emoji  = document.getElementById('ev-emoji').value.trim() || '📌';
  const age    = parseInt(document.getElementById('ev-age').value);
  const cost   = parseFloat(document.getElementById('ev-cost').value)   || 0;
  const annual = parseFloat(document.getElementById('ev-annual').value) || 0;
  const years  = parseInt(document.getElementById('ev-years').value)    || 1;
  const homeValue     = parseFloat(document.getElementById('ev-home-value')?.value)        || 0;
  const homeRate      = parseFloat(document.getElementById('ev-home-appreciation')?.value) || 3;
  const mortgageRate  = parseFloat(document.getElementById('ev-mortgage-rate')?.value)    || 7;
  const mortgageYears = parseInt(document.getElementById('ev-mortgage-years')?.value)     || 30;
  const annualCostPct = parseFloat(document.getElementById('ev-annual-cost-pct')?.value)  || 3;

  if (!name)            { showToast('Please enter an event name', true); return; }
  if (!age || age < 18) { showToast('Please enter a valid age (18+)', true); return; }

  const isHouse = _selectedEventType === 'house_purchase';
  // Inheritance is income (+), others are costs (−)
  const oneCost = _selectedEventType === 'inheritance' ? -Math.abs(cost) : cost;
  const annCost = isHouse ? 0 : (_selectedEventType === 'inheritance' ? -Math.abs(annual) : annual);
  // For house: duration = mortgage term; annual costs auto-calculated server-side
  const duration = isHouse ? mortgageYears : years;

  const color = EVENT_COLORS[_evColorIdx++ % EVENT_COLORS.length];

  try {
    const ev = await api.createEvent(scenario.id, {
      event_type:   _selectedEventType,
      name, emoji, at_age: age,
      one_time_cost: oneCost, annual_impact: annCost,
      duration_years: duration, color,
      home_value:             isHouse ? homeValue      : 0,
      home_appreciation_rate: isHouse ? homeRate       : 3,
      mortgage_rate:          isHouse ? mortgageRate   : 7,
      mortgage_years:         isHouse ? mortgageYears  : 30,
      annual_cost_pct:        isHouse ? annualCostPct  : 3,
    });

    State.addEvent(ev);

    // If server auto-created a mortgage debt, add it to state
    if (ev.mortgage_debt) {
      State.addDebt(ev.mortgage_debt);
      renderDebtsList();
    }
    // If server auto-created a real estate asset, add it to state
    if (ev.home_asset) {
      State.addAsset(ev.home_asset);
      renderAssetsList();
    }

    // Clear form
    ['ev-name','ev-emoji','ev-age','ev-cost','ev-annual',
     'ev-home-value','ev-home-appreciation','ev-mortgage-rate','ev-mortgage-years','ev-annual-cost-pct'].forEach(
      id => { const el = document.getElementById(id); if (el) el.value = ''; }
    );
    const yearsEl = document.getElementById('ev-years');
    if (yearsEl) yearsEl.value = '1';
    const preview = document.getElementById('ev-mortgage-preview');
    if (preview) preview.textContent = '';

    renderEventList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteEvent(id) {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    const result = await api.deleteEvent(scenario.id, id);
    State.removeEvent(id);
    // Remove any auto-created mortgage debts
    if (result && result.deleted_debt_ids) {
      result.deleted_debt_ids.forEach(did => State.removeDebt(did));
      if (result.deleted_debt_ids.length) renderDebtsList();
    }
    // Remove any auto-created real estate assets
    if (result && result.deleted_asset_ids) {
      result.deleted_asset_ids.forEach(aid => State.removeAsset(aid));
      if (result.deleted_asset_ids.length) renderAssetsList();
    }
    renderEventList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

function renderEventList() {
  const scenario = State.getScenario();
  const el = document.getElementById('event-list');
  if (!el || !scenario) return;

  if (!scenario.events.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🗓️</div>
      <p>No events yet.<br>Add life milestones above and they'll appear on your graph.</p></div>`;
    return;
  }

  el.innerHTML = [...scenario.events].sort((a, b) => a.at_age - b.at_age).map(ev => {
    const parts = [];
    if (ev.one_time_cost)  parts.push(`${fmtM(Math.abs(ev.one_time_cost))} ${ev.one_time_cost < 0 ? 'income' : 'down pmt'}`);
    if (ev.event_type === 'house_purchase') {
      if (ev.home_value > 0) {
        const principal = Math.max(0, ev.home_value - ev.one_time_cost);
        const monthly = calcMortgagePayment(principal, ev.mortgage_rate || 7, ev.mortgage_years || 30);
        parts.push(`${fmtM(ev.home_value)} home @ ${ev.home_appreciation_rate || 3}%/yr`);
        if (principal > 0) parts.push(`${fmtM(principal)} mortgage → ${fmtM(Math.round(monthly))}/mo`);
        const costPct = ev.annual_cost_pct ?? 3;
        parts.push(`${fmtM(Math.round(ev.home_value * costPct / 100))}/yr costs`);
      }
    } else {
      if (ev.one_time_cost)  parts.length = 0, parts.push(`${fmtM(Math.abs(ev.one_time_cost))} ${ev.one_time_cost < 0 ? 'income' : 'cost'}`);
      if (ev.annual_impact)  parts.push(`${fmtM(Math.abs(ev.annual_impact))}/yr × ${ev.duration_years}yr`);
    }
    return `<div class="event-item">
      <div class="event-stripe" style="background:${ev.color}"></div>
      <div style="font-size:22px">${ev.emoji}</div>
      <div class="event-info">
        <div class="event-name">${ev.name}</div>
        <div class="event-meta">Age ${ev.at_age}${parts.length ? ' · ' + parts.join(', ') : ''}</div>
      </div>
      <button class="event-del" onclick="deleteEvent(${ev.id})">✕</button>
    </div>`;
  }).join('');
}
