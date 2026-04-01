const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
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
      one_time_cost = 0, annual_impact = 0, duration_years = 1, color = '#38bdf8'
    } = req.body;
    if (!name || at_age == null) return res.status(400).json({ error: 'name and at_age are required' });
    const r = db.prepare(`
      INSERT INTO events (scenario_id, event_type, name, emoji, at_age, one_time_cost,
                          annual_impact, duration_years, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.scenarioId, event_type, name, emoji, at_age,
           one_time_cost, annual_impact, duration_years, color);
    res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/events/:id
router.patch('/:scenarioId/events/:id', (req, res, next) => {
  try {
    if (!ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['event_type','name','emoji','at_age','one_time_cost','annual_impact','duration_years','color'];
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
    db.prepare('DELETE FROM events WHERE id = ? AND scenario_id = ?').run(req.params.id, req.params.scenarioId);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
