const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
}

function calcMortgagePayment(principal, annualRate, years) {
  if (annualRate === 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// GET /api/scenarios/:scenarioId/events
router.get('/:scenarioId/events', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const rows = db.prepare('SELECT * FROM events WHERE scenario_id = ? ORDER BY at_age').all(req.params.scenarioId);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios/:scenarioId/events
router.post('/:scenarioId/events', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const {
      event_type = 'custom', name, emoji = '📌', at_age,
      one_time_cost = 0, duration_years = 1, color = '#38bdf8',
      home_value = 0, home_appreciation_rate = 3,
      mortgage_rate = 7, mortgage_years = 30
    } = req.body;
    if (!name || at_age == null) return res.status(400).json({ error: 'name and at_age are required' });

    // For house purchases, auto-calculate annual costs as 3% of home value
    const annual_impact = event_type === 'house_purchase' && home_value > 0
      ? Math.round(home_value * 0.03)
      : (req.body.annual_impact || 0);

    const r = db.prepare(`
      INSERT INTO events (scenario_id, event_type, name, emoji, at_age, one_time_cost,
                          annual_impact, duration_years, color, home_value, home_appreciation_rate,
                          mortgage_rate, mortgage_years)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.scenarioId, event_type, name, emoji, at_age,
           one_time_cost, annual_impact, duration_years, color,
           home_value, home_appreciation_rate, mortgage_rate, mortgage_years);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(r.lastInsertRowid);

    // Auto-create mortgage debt for house purchases
    let mortgage_debt = null;
    if (event_type === 'house_purchase' && home_value > 0) {
      const principal = Math.max(0, home_value - one_time_cost);
      if (principal > 0) {
        const monthly_payment = calcMortgagePayment(principal, mortgage_rate, mortgage_years);
        const dr = db.prepare(`
          INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment, start_age, event_id)
          VALUES (?, 'mortgage', ?, ?, ?, ?, ?, ?)
        `).run(req.params.scenarioId, `${name} Mortgage`, principal,
               mortgage_rate, Math.round(monthly_payment * 100) / 100, at_age, event.id);
        mortgage_debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(dr.lastInsertRowid);
      }
    }

    res.status(201).json({ ...event, mortgage_debt });
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/events/:id
router.patch('/:scenarioId/events/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['event_type','name','emoji','at_age','one_time_cost','annual_impact','duration_years','color',
                     'home_value','home_appreciation_rate','mortgage_rate','mortgage_years'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE events SET ${sets} WHERE id = ? AND scenario_id = ?`)
      .run(...vals, req.params.id, req.params.scenarioId);
    res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/events/:id
router.delete('/:scenarioId/events/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });

    // Find any auto-created mortgage debts linked to this event
    const linkedDebts = db.prepare('SELECT id FROM debts WHERE event_id = ? AND scenario_id = ?')
      .all(req.params.id, req.params.scenarioId);
    const deleted_debt_ids = linkedDebts.map(d => d.id);

    // Delete linked debts then the event
    if (deleted_debt_ids.length) {
      db.prepare('DELETE FROM debts WHERE event_id = ? AND scenario_id = ?')
        .run(req.params.id, req.params.scenarioId);
    }
    db.prepare('DELETE FROM events WHERE id = ? AND scenario_id = ?').run(req.params.id, req.params.scenarioId);

    res.json({ deleted_debt_ids });
  } catch (err) { next(err); }
});

module.exports = router;
