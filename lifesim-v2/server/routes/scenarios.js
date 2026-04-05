const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
}

function fullScenario(id) {
  const s = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(id);
  if (!s) return null;
  s.assets = db.prepare('SELECT * FROM assets WHERE scenario_id = ? ORDER BY id').all(id);
  s.debts  = db.prepare('SELECT * FROM debts  WHERE scenario_id = ? ORDER BY id').all(id);
  s.events = db.prepare('SELECT * FROM events WHERE scenario_id = ? ORDER BY at_age').all(id);
  return s;
}

// GET /api/scenarios
router.get('/', (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT s.id, s.name, s.color, s.job_id, s.start_age, s.retire_age,
             s.save_pct, s.return_rate, s.created_at, s.updated_at,
             (SELECT COUNT(*) FROM assets WHERE scenario_id = s.id) AS asset_count,
             (SELECT COUNT(*) FROM debts  WHERE scenario_id = s.id) AS debt_count
      FROM scenarios s
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC
    `).all(req.userId);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios
router.post('/', (req, res, next) => {
  try {
    const {
      name = 'My Scenario', color = '#00d4aa', job_id = 'sw_eng',
      custom_s0, custom_s35, custom_s50,
      start_age = 25, retire_age = 65, save_pct = 20, return_rate = 7, annual_expenses = 0
    } = req.body;
    const result = db.prepare(`
      INSERT INTO scenarios (user_id, name, color, job_id, custom_s0, custom_s35, custom_s50,
                             start_age, retire_age, save_pct, return_rate, annual_expenses)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, name, color, job_id, custom_s0 ?? null, custom_s35 ?? null, custom_s50 ?? null,
           start_age, retire_age, save_pct, return_rate, annual_expenses);
    res.status(201).json(fullScenario(result.lastInsertRowid));
  } catch (err) { next(err); }
});

// GET /api/scenarios/:id
router.get('/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });
    res.json(fullScenario(req.params.id));
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:id
router.patch('/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });

    const allowed = ['name','color','job_id','custom_s0','custom_s35','custom_s50',
                     'start_age','retire_age','save_pct','return_rate','annual_expenses'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });

    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE scenarios SET ${sets}, updated_at = unixepoch() WHERE id = ?`)
      .run(...vals, req.params.id);

    res.json(fullScenario(req.params.id));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:id
router.delete('/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/scenarios/:id/clone
router.post('/:id/clone', (req, res, next) => {
  try {
    const src = ownScenario(req.params.id, req.userId);
    if (!src) return res.status(404).json({ error: 'Not found' });

    const orig = fullScenario(req.params.id);
    const cloneName = (req.body.name) || `${orig.name} (copy)`;

    const cloneInsert = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO scenarios (user_id, name, color, job_id, custom_s0, custom_s35, custom_s50,
                               start_age, retire_age, save_pct, return_rate, annual_expenses)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.userId, cloneName, orig.color, orig.job_id,
             orig.custom_s0, orig.custom_s35, orig.custom_s50,
             orig.start_age, orig.retire_age, orig.save_pct, orig.return_rate, orig.annual_expenses || 0);
      const newId = r.lastInsertRowid;

      for (const a of orig.assets) {
        db.prepare(`INSERT INTO assets (scenario_id, type, label, value, annual_contribution, expected_return_rate)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(newId, a.type, a.label, a.value, a.annual_contribution, a.expected_return_rate);
      }
      for (const d of orig.debts) {
        db.prepare(`INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(newId, d.type, d.label, d.balance, d.interest_rate, d.monthly_payment);
      }
      for (const e of orig.events) {
        db.prepare(`INSERT INTO events (scenario_id, event_type, name, emoji, at_age, one_time_cost,
                                        annual_impact, duration_years, color)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(newId, e.event_type, e.name, e.emoji, e.at_age, e.one_time_cost,
               e.annual_impact, e.duration_years, e.color);
      }
      return newId;
    });

    const newId = cloneInsert();
    res.status(201).json(fullScenario(newId));
  } catch (err) { next(err); }
});

module.exports = router;
