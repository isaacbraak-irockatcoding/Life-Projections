const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

// GET /api/scenarios/:scenarioId/careers
router.get('/:scenarioId/careers', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const rows = await db.all('SELECT * FROM careers WHERE scenario_id = ? ORDER BY start_age', [req.params.scenarioId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios/:scenarioId/careers
router.post('/:scenarioId/careers', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const { job_id = 'sw_eng', custom_s0, custom_s35, custom_s50, start_age = 22, end_age, label } = req.body;
    const row = await db.get(`
      INSERT INTO careers (scenario_id, job_id, custom_s0, custom_s35, custom_s50, start_age, end_age, label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [req.params.scenarioId, job_id, custom_s0 ?? null, custom_s35 ?? null, custom_s50 ?? null,
        start_age, end_age ?? null, label ?? null]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/careers/:id
router.patch('/:scenarioId/careers/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['job_id', 'custom_s0', 'custom_s35', 'custom_s50', 'start_age', 'end_age', 'label'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE careers SET ${sets} WHERE id = ? AND scenario_id = ?`,
      [...vals, req.params.id, req.params.scenarioId]);
    res.json(await db.get('SELECT * FROM careers WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/careers/:id
router.delete('/:scenarioId/careers/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM careers WHERE id = ? AND scenario_id = ?', [req.params.id, req.params.scenarioId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
