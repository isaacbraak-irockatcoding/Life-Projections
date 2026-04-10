const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
}

// GET /api/scenarios/:scenarioId/careers
router.get('/:scenarioId/careers', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const rows = db.prepare('SELECT * FROM careers WHERE scenario_id = ? ORDER BY start_age').all(req.params.scenarioId);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios/:scenarioId/careers
router.post('/:scenarioId/careers', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const { job_id = 'sw_eng', custom_s0, custom_s35, custom_s50, start_age = 22, end_age, label } = req.body;
    const r = db.prepare(`
      INSERT INTO careers (scenario_id, job_id, custom_s0, custom_s35, custom_s50, start_age, end_age, label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.scenarioId, job_id, custom_s0 ?? null, custom_s35 ?? null, custom_s50 ?? null,
           start_age, end_age ?? null, label ?? null);
    const row = db.prepare('SELECT * FROM careers WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/careers/:id
router.patch('/:scenarioId/careers/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['job_id', 'custom_s0', 'custom_s35', 'custom_s50', 'start_age', 'end_age', 'label'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE careers SET ${sets} WHERE id = ? AND scenario_id = ?`)
      .run(...vals, req.params.id, req.params.scenarioId);
    const row = db.prepare('SELECT * FROM careers WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/careers/:id
router.delete('/:scenarioId/careers/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM careers WHERE id = ? AND scenario_id = ?').run(req.params.id, req.params.scenarioId);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
