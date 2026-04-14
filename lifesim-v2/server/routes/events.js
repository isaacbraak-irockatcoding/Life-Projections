const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

function calcMortgagePayment(principal, annualRate, years) {
  if (annualRate === 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// GET /api/scenarios/:scenarioId/events
router.get('/:scenarioId/events', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const rows = await db.all('SELECT * FROM events WHERE scenario_id = ? ORDER BY at_age', [req.params.scenarioId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios/:scenarioId/events
router.post('/:scenarioId/events', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const {
      event_type = 'custom', name, emoji = '📌', at_age,
      one_time_cost = 0, duration_years = 1, color = '#38bdf8',
      home_value = 0, home_appreciation_rate = 3,
      mortgage_rate = 7, mortgage_years = 30,
      annual_cost_pct = 3,
      spouse_job_id = null, spouse_s0 = null, spouse_s35 = null,
      spouse_s50 = null, spouse_career_start_age = null,
    } = req.body;
    if (!name || at_age == null) return res.status(400).json({ error: 'name and at_age are required' });

    // For house purchases, auto-calculate annual costs from percentage of home value
    const annual_impact = event_type === 'house_purchase' && home_value > 0
      ? Math.round(home_value * annual_cost_pct / 100)
      : (req.body.annual_impact || 0);

    const event = await db.get(`
      INSERT INTO events (scenario_id, event_type, name, emoji, at_age, one_time_cost,
                          annual_impact, duration_years, color, home_value, home_appreciation_rate,
                          mortgage_rate, mortgage_years, annual_cost_pct,
                          spouse_job_id, spouse_s0, spouse_s35, spouse_s50, spouse_career_start_age)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [req.params.scenarioId, event_type, name, emoji, at_age,
        one_time_cost, annual_impact, duration_years, color,
        home_value, home_appreciation_rate, mortgage_rate, mortgage_years, annual_cost_pct,
        spouse_job_id, spouse_s0, spouse_s35, spouse_s50, spouse_career_start_age]);

    let mortgage_debt = null;
    let home_asset = null;

    if (event_type === 'house_purchase' && home_value > 0) {
      // Auto-create mortgage debt
      const principal = Math.max(0, home_value - one_time_cost);
      if (principal > 0) {
        const monthly_payment = calcMortgagePayment(principal, mortgage_rate, mortgage_years);
        mortgage_debt = await db.get(`
          INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment, start_age, event_id)
          VALUES (?, 'mortgage', ?, ?, ?, ?, ?, ?)
          RETURNING *
        `, [req.params.scenarioId, `${name} Mortgage`, principal,
            mortgage_rate, Math.round(monthly_payment * 100) / 100, at_age, event.id]);
      }

      // Auto-create Real Estate asset (tagged with event_id so engine skips it — tracked via homes[])
      home_asset = await db.get(`
        INSERT INTO assets (scenario_id, type, label, value, expected_return_rate, start_age, event_id)
        VALUES (?, 'real_estate', ?, ?, ?, ?, ?)
        RETURNING *
      `, [req.params.scenarioId, name, home_value, home_appreciation_rate, at_age, event.id]);
    }

    res.status(201).json({ ...event, mortgage_debt, home_asset });
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/events/:id
router.patch('/:scenarioId/events/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['event_type','name','emoji','at_age','one_time_cost','annual_impact','duration_years','color',
                     'home_value','home_appreciation_rate','mortgage_rate','mortgage_years','annual_cost_pct',
                     'spouse_job_id','spouse_s0','spouse_s35','spouse_s50','spouse_career_start_age'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE events SET ${sets} WHERE id = ? AND scenario_id = ?`,
      [...vals, req.params.id, req.params.scenarioId]);
    res.json(await db.get('SELECT * FROM events WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/events/:id
router.delete('/:scenarioId/events/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });

    // Find and delete any auto-created mortgage debts
    const linkedDebts = await db.all('SELECT id FROM debts WHERE event_id = ? AND scenario_id = ?',
      [req.params.id, req.params.scenarioId]);
    const deleted_debt_ids = linkedDebts.map(d => d.id);
    if (deleted_debt_ids.length) {
      await db.run('DELETE FROM debts WHERE event_id = ? AND scenario_id = ?',
        [req.params.id, req.params.scenarioId]);
    }

    // Find and delete any auto-created assets
    const linkedAssets = await db.all('SELECT id FROM assets WHERE event_id = ? AND scenario_id = ?',
      [req.params.id, req.params.scenarioId]);
    const deleted_asset_ids = linkedAssets.map(a => a.id);
    if (deleted_asset_ids.length) {
      await db.run('DELETE FROM assets WHERE event_id = ? AND scenario_id = ?',
        [req.params.id, req.params.scenarioId]);
    }

    await db.run('DELETE FROM events WHERE id = ? AND scenario_id = ?', [req.params.id, req.params.scenarioId]);

    res.json({ deleted_debt_ids, deleted_asset_ids });
  } catch (err) { next(err); }
});

module.exports = router;
