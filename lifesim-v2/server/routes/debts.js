const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
}

// POST /api/scenarios/:scenarioId/debts
router.post('/:scenarioId/debts', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const { type = 'other', label, balance = 0, interest_rate = 5, monthly_payment = 0, start_age = null } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });
    const r = db.prepare(`
      INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment, start_age)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.scenarioId, type, label, balance, interest_rate, monthly_payment, start_age);
    res.status(201).json(db.prepare('SELECT * FROM debts WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/debts/:id
router.patch('/:scenarioId/debts/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['type','label','balance','interest_rate','monthly_payment','start_age'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE debts SET ${sets} WHERE id = ? AND scenario_id = ?`)
      .run(...vals, req.params.id, req.params.scenarioId);
    res.json(db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/debts/:id
router.delete('/:scenarioId/debts/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM debts WHERE id = ? AND scenario_id = ?').run(req.params.id, req.params.scenarioId);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
