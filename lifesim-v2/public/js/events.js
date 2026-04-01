/* ══════════════════════════════════════════════
   events.js — Life events timeline editor
   Events are synced to the server immediately
   (not batched with the Save button).
══════════════════════════════════════════════ */

let _selectedEventType = 'custom';
let _evColorIdx = 0;

function renderEventsTab() {
  const scenario = State.getScenario();
  const screen   = document.getElementById('screen-events');
  if (!scenario || !screen) return;

  // Re-render just the event list (form is static HTML in index.html)
  renderEventTypeSelector();
  renderEventList();
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

  if (!name)            { showToast('Please enter an event name', true); return; }
  if (!age || age < 18) { showToast('Please enter a valid age (18+)', true); return; }

  const t = EVENT_TYPES.find(x => x.id === _selectedEventType);
  // Inheritance is income (+), others are costs (−)
  const oneCost  = _selectedEventType === 'inheritance' ? -Math.abs(cost) : cost;
  const annCost  = _selectedEventType === 'inheritance' ? -Math.abs(annual) : annual;

  const color = EVENT_COLORS[_evColorIdx++ % EVENT_COLORS.length];

  try {
    const ev = await api.createEvent(scenario.id, {
      event_type: _selectedEventType,
      name, emoji, at_age: age,
      one_time_cost: oneCost, annual_impact: annCost,
      duration_years: years, color,
    });
    State.addEvent(ev);

    // Clear form
    ['ev-name','ev-emoji','ev-age','ev-cost','ev-annual'].forEach(
      id => { const el = document.getElementById(id); if (el) el.value = ''; }
    );
    const yearsEl = document.getElementById('ev-years');
    if (yearsEl) yearsEl.value = '1';

    renderEventList();
    if (charts.proj) renderProjChart();
  } catch (err) { showToast(err.message, true); }
}

async function deleteEvent(id) {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    await api.deleteEvent(scenario.id, id);
    State.removeEvent(id);
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
    if (ev.one_time_cost)  parts.push(`${fmtM(Math.abs(ev.one_time_cost))} ${ev.one_time_cost < 0 ? 'income' : 'cost'}`);
    if (ev.annual_impact)  parts.push(`${fmtM(Math.abs(ev.annual_impact))}/yr × ${ev.duration_years}yr`);
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
