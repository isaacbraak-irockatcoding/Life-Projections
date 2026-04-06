const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
}

// POST /api/scenarios/:scenarioId/assets
router.post('/:scenarioId/assets', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const { type = 'other', label, value = 0, annual_contribution = 0, expected_return_rate = 7, start_age = null } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });
    const r = db.prepare(`
      INSERT INTO assets (scenario_id, type, label, value, annual_contribution, expected_return_rate, start_age)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.scenarioId, type, label, value, annual_contribution, expected_return_rate, start_age);
    res.status(201).json(db.prepare('SELECT * FROM assets WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/assets/:id
router.patch('/:scenarioId/assets/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['type','label','value','annual_contribution','expected_return_rate','start_age'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    db.prepare(`UPDATE assets SET ${sets} WHERE id = ? AND scenario_id = ?`)
      .run(...vals, req.params.id, req.params.scenarioId);
    res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/assets/:id
router.delete('/:scenarioId/assets/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM assets WHERE id = ? AND scenario_id = ?').run(req.params.id, req.params.scenarioId);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
