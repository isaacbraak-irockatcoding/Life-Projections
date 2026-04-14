const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

// GET /api/scenarios/:scenarioId/schools
router.get('/:scenarioId/schools', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const rows = await db.all('SELECT * FROM schools WHERE scenario_id = ? ORDER BY start_age', [req.params.scenarioId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios/:scenarioId/schools
router.post('/:scenarioId/schools', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const {
      type = 'undergrad', name = '', tuition_annual = 0, years = 4,
      start_age = 18, parent_pays = 0, scholarship_annual = 0, scholarship_years = 0,
    } = req.body;
    const row = await db.get(`
      INSERT INTO schools (scenario_id, type, name, tuition_annual, years, start_age, parent_pays, scholarship_annual, scholarship_years)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [req.params.scenarioId, type, name, tuition_annual, years, start_age, parent_pays, scholarship_annual, scholarship_years]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/schools/:id
router.patch('/:scenarioId/schools/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['type', 'name', 'tuition_annual', 'years', 'start_age', 'parent_pays', 'scholarship_annual', 'scholarship_years', 'loan_id'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE schools SET ${sets} WHERE id = ? AND scenario_id = ?`,
      [...vals, req.params.id, req.params.scenarioId]);
    res.json(await db.get('SELECT * FROM schools WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/schools/:id
router.delete('/:scenarioId/schools/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM schools WHERE id = ? AND scenario_id = ?', [req.params.id, req.params.scenarioId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
