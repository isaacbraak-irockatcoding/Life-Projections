const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

// GET /api/scenarios/:scenarioId/lifestyles
router.get('/:scenarioId/lifestyles', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const rows = await db.all('SELECT * FROM lifestyles WHERE scenario_id = ? ORDER BY start_age', [req.params.scenarioId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios/:scenarioId/lifestyles
router.post('/:scenarioId/lifestyles', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const {
      start_age = 22,
      le_housing_tier = 'modest', le_utilities_monthly = 0,
      le_groceries = 'average', le_dining = 'never',
      le_has_car = 0, le_pet_count = 0,
      le_phone_monthly = 0, le_healthcare_monthly = 0, le_clothing_monthly = 0,
      annual_expenses = 0,
    } = req.body;
    const row = await db.get(`
      INSERT INTO lifestyles (scenario_id, start_age, le_housing_tier, le_utilities_monthly,
        le_groceries, le_dining, le_has_car, le_pet_count,
        le_phone_monthly, le_healthcare_monthly, le_clothing_monthly, annual_expenses)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [req.params.scenarioId, start_age, le_housing_tier, le_utilities_monthly,
        le_groceries, le_dining, le_has_car, le_pet_count,
        le_phone_monthly, le_healthcare_monthly, le_clothing_monthly, annual_expenses]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:scenarioId/lifestyles/:id
router.patch('/:scenarioId/lifestyles/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['start_age', 'le_housing_tier', 'le_utilities_monthly',
                     'le_groceries', 'le_dining', 'le_has_car', 'le_pet_count',
                     'le_phone_monthly', 'le_healthcare_monthly', 'le_clothing_monthly', 'annual_expenses'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE lifestyles SET ${sets} WHERE id = ? AND scenario_id = ?`,
      [...vals, req.params.id, req.params.scenarioId]);
    res.json(await db.get('SELECT * FROM lifestyles WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:scenarioId/lifestyles/:id
router.delete('/:scenarioId/lifestyles/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.scenarioId, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM lifestyles WHERE id = ? AND scenario_id = ?', [req.params.id, req.params.scenarioId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
