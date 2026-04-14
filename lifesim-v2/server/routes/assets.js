const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

// POST /api/scenarios/:scenarioId/assets
router.post('/:scenarioId/assets', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const { type = 'other', label, value = 0, annual_contribution = 0, expected_return_rate = 7, start_age = null } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });
    const row = await db.get(`
      INSERT INTO assets (scenario_id, type, label, value, annual_contribution, expected_return_rate, start_age)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [req.params.scenarioId, type, label, value, annual_contribution, expected_return_rate, start_age]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/assets/:id
router.patch('/:scenarioId/assets/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['type','label','value','annual_contribution','expected_return_rate','start_age'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE assets SET ${sets} WHERE id = ? AND scenario_id = ?`,
      [...vals, req.params.id, req.params.scenarioId]);
    res.json(await db.get('SELECT * FROM assets WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/assets/:id
router.delete('/:scenarioId/assets/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM assets WHERE id = ? AND scenario_id = ?', [req.params.id, req.params.scenarioId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
