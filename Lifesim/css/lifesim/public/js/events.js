/* ══════════════════════════════════════════════
   events.js — Life events add / delete / render
══════════════════════════════════════════════ */

function addEvent() {
    const name   = document.getElementById('ev-name').value.trim();
    const emoji  = document.getElementById('ev-emoji').value.trim() || '📌';
    const age    = parseInt(document.getElementById('ev-age').value);
    const cost   = parseFloat(document.getElementById('ev-cost').value)   || 0;
    const annual = parseFloat(document.getElementById('ev-annual').value) || 0;
    const years  = parseInt(document.getElementById('ev-years').value)    || 1;
    const applies = document.getElementById('ev-applies').value;
  
    if (!name)            { alert('Please enter an event name'); return; }
    if (!age || age < 18) { alert('Please enter a valid age (18+)'); return; }
  
    ST.events.push({
      id: Date.now(), name, emoji, age, cost, annual, years, applies,
      color: EVENT_COLORS[evColorIdx++ % EVENT_COLORS.length],
    });
    save();
  
    ['ev-name','ev-emoji','ev-age','ev-cost','ev-annual'].forEach(
      id => document.getElementById(id).value = ''
    );
    document.getElementById('ev-years').value = '1';
  
    renderEventList();
    if (charts.proj) renderProjChart();
  }
  
  function deleteEvent(id) {
    ST.events = ST.events.filter(e => e.id !== id);
    save(); renderEventList();
    if (charts.proj) renderProjChart();
  }
  
  function renderEventList() {
    const el = document.getElementById('event-list');
    if (!ST.events.length) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">🗓️</div>
        <p>No events yet.<br>Add life milestones above and they'll appear on your graph.</p></div>`;
      return;
    }
    el.innerHTML = [...ST.events].sort((a,b) => a.age - b.age).map(ev => {
      const parts = [];
      if (ev.cost)   parts.push(`${fmtM(ev.cost)} one-time`);
      if (ev.annual) parts.push(`${fmtM(ev.annual)}/yr × ${ev.years}yr`);
      const appliesLabel = ev.applies === 'all'
        ? 'All paths' : `Path ${['A','B','C'][parseInt(ev.applies)]}`;
      return `<div class="event-item">
        <div class="event-stripe" style="background:${ev.color}"></div>
        <div style="font-size:22px">${ev.emoji}</div>
        <div class="event-info">
          <div class="event-name">${ev.name}</div>
          <div class="event-meta">Age ${ev.age} · ${appliesLabel}${parts.length?' · '+parts.join(', '):''}</div>
        </div>
        <button class="event-del" onclick="deleteEvent(${ev.id})">✕</button>
      </div>`;
    }).join('');
  }