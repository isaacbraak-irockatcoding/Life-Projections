const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

// POST /api/scenarios/:scenarioId/debts
router.post('/:scenarioId/debts', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const { type = 'other', label, balance = 0, interest_rate = 5, monthly_payment = 0, start_age = null } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });
    const row = await db.get(`
      INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment, start_age)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [req.params.scenarioId, type, label, balance, interest_rate, monthly_payment, start_age]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/debts/:id
router.patch('/:scenarioId/debts/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['type','label','balance','interest_rate','monthly_payment','start_age'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE debts SET ${sets} WHERE id = ? AND scenario_id = ?`,
      [...vals, req.params.id, req.params.scenarioId]);
    res.json(await db.get('SELECT * FROM debts WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/debts/:id
router.delete('/:scenarioId/debts/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM debts WHERE id = ? AND scenario_id = ?', [req.params.id, req.params.scenarioId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
