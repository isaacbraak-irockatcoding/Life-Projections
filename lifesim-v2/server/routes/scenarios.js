const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

async function fullScenario(id) {
  const s = await db.get('SELECT * FROM scenarios WHERE id = ?', [id]);
  if (!s) return null;
  s.assets     = await db.all('SELECT * FROM assets      WHERE scenario_id = ? ORDER BY id',        [id]);
  s.debts      = await db.all('SELECT * FROM debts       WHERE scenario_id = ? ORDER BY id',        [id]);
  s.events     = await db.all('SELECT * FROM events      WHERE scenario_id = ? ORDER BY at_age',    [id]);
  s.careers    = await db.all('SELECT * FROM careers     WHERE scenario_id = ? ORDER BY start_age', [id]);
  s.schools    = await db.all('SELECT * FROM schools     WHERE scenario_id = ? ORDER BY start_age', [id]);
  s.lifestyles = await db.all('SELECT * FROM lifestyles  WHERE scenario_id = ? ORDER BY start_age', [id]);
  return s;
}

// GET /api/scenarios
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.all(`
      SELECT s.id, s.name, s.color, s.job_id, s.start_age, s.retire_age,
             s.save_pct, s.return_rate, s.created_at, s.updated_at,
             (SELECT COUNT(*) FROM assets WHERE scenario_id = s.id) AS asset_count,
             (SELECT COUNT(*) FROM debts  WHERE scenario_id = s.id) AS debt_count
      FROM scenarios s
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC
    `, [req.userId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/scenarios
router.post('/', async (req, res, next) => {
  try {
    const {
      name = 'My Scenario', color = '#00d4aa', job_id = 'sw_eng',
      custom_s0, custom_s35, custom_s50,
      start_age = 25, career_start_age = 22, retire_age = 65, save_pct = 20, return_rate = 7, annual_expenses = 0, state_code = 'none',
      le_has_rent = 0, le_rent_monthly = 0, le_pet_count = 0, le_dining = 'never', le_has_car = 0, le_utilities_monthly = 0,
      le_housing_tier = 'modest', le_groceries = 'average', le_phone_monthly = 0, le_healthcare_monthly = 0, le_clothing_monthly = 0,
      health_insurance_monthly = 0, health_insurance_coverage = 'single', health_insurance_plan = 'standard',
      health_insurance_enabled = 1
    } = req.body;
    const row = await db.get(`
      INSERT INTO scenarios (user_id, name, color, job_id, custom_s0, custom_s35, custom_s50,
                             start_age, career_start_age, retire_age, save_pct, return_rate, annual_expenses, state_code,
                             le_has_rent, le_rent_monthly, le_pet_count, le_dining, le_has_car, le_utilities_monthly,
                             le_housing_tier, le_groceries, le_phone_monthly, le_healthcare_monthly, le_clothing_monthly,
                             health_insurance_monthly, health_insurance_coverage, health_insurance_plan, health_insurance_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [req.userId, name, color, job_id, custom_s0 ?? null, custom_s35 ?? null, custom_s50 ?? null,
        start_age, career_start_age, retire_age, save_pct, return_rate, annual_expenses, state_code,
        le_has_rent, le_rent_monthly, le_pet_count, le_dining, le_has_car, le_utilities_monthly,
        le_housing_tier, le_groceries, le_phone_monthly, le_healthcare_monthly, le_clothing_monthly,
        health_insurance_monthly, health_insurance_coverage, health_insurance_plan, health_insurance_enabled]);
    res.status(201).json(await fullScenario(row.id));
  } catch (err) { next(err); }
});

// GET /api/scenarios/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });
    res.json(await fullScenario(req.params.id));
  } catch (err) { next(err); }
});

// PATCH /api/scenarios/:id
router.patch('/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });

    const allowed = ['name','color','job_id','custom_s0','custom_s35','custom_s50',
                     'start_age','career_start_age','retire_age','save_pct','return_rate','annual_expenses','state_code',
                     'le_has_rent','le_rent_monthly','le_pet_count','le_dining','le_has_car','le_utilities_monthly',
                     'le_housing_tier','le_groceries','le_phone_monthly','le_healthcare_monthly','le_clothing_monthly',
                     'health_insurance_monthly','health_insurance_coverage','health_insurance_plan','health_insurance_enabled',
                     'rent_start_age','rent_end_age',
                     'school_name','school_tuition_annual','school_years','school_start_age','school_parent_pays',
                     'school_scholarship_annual','school_scholarship_years','school_loan_id',
                     'grad_name','grad_tuition_annual','grad_years','grad_start_age','grad_parent_pays',
                     'grad_scholarship_annual','grad_scholarship_years','grad_loan_id'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });

    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await db.run(`UPDATE scenarios SET ${sets}, updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER WHERE id = ?`,
      [...vals, req.params.id]);

    res.json(await fullScenario(req.params.id));
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM scenarios WHERE id = ?', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/scenarios/:id/clone
router.post('/:id/clone', async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });

    const orig = await fullScenario(req.params.id);
    const cloneName = (req.body.name) || `${orig.name} (copy)`;

    const newId = await db.transaction(async (tdb) => {
      const r = await tdb.get(`
        INSERT INTO scenarios (user_id, name, color, job_id, custom_s0, custom_s35, custom_s50,
                               start_age, career_start_age, retire_age, save_pct, return_rate, annual_expenses, state_code,
                               le_has_rent, le_rent_monthly, le_pet_count, le_dining, le_has_car, le_utilities_monthly,
                               le_housing_tier, le_groceries, le_phone_monthly, le_healthcare_monthly, le_clothing_monthly,
                               health_insurance_monthly, health_insurance_coverage, health_insurance_plan, health_insurance_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [req.userId, cloneName, orig.color, orig.job_id,
          orig.custom_s0, orig.custom_s35, orig.custom_s50,
          orig.start_age, orig.career_start_age || 22, orig.retire_age, orig.save_pct, orig.return_rate,
          orig.annual_expenses || 0, orig.state_code || 'none',
          orig.le_has_rent || 0, orig.le_rent_monthly || 0, orig.le_pet_count || 0,
          orig.le_dining || 'never', orig.le_has_car || 0, orig.le_utilities_monthly || 0,
          orig.le_housing_tier || 'modest', orig.le_groceries || 'average',
          orig.le_phone_monthly || 0, orig.le_healthcare_monthly || 0, orig.le_clothing_monthly || 0,
          orig.health_insurance_monthly || 0,
          orig.health_insurance_coverage || 'single', orig.health_insurance_plan || 'standard',
          orig.health_insurance_enabled ?? 1]);
      const id = r.id;

      for (const a of orig.assets) {
        await tdb.run(
          'INSERT INTO assets (scenario_id, type, label, value, annual_contribution, expected_return_rate) VALUES (?, ?, ?, ?, ?, ?)',
          [id, a.type, a.label, a.value, a.annual_contribution, a.expected_return_rate]
        );
      }
      for (const d of orig.debts) {
        await tdb.run(
          'INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment) VALUES (?, ?, ?, ?, ?, ?)',
          [id, d.type, d.label, d.balance, d.interest_rate, d.monthly_payment]
        );
      }
      for (const e of orig.events) {
        await tdb.run(
          'INSERT INTO events (scenario_id, event_type, name, emoji, at_age, one_time_cost, annual_impact, duration_years, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, e.event_type, e.name, e.emoji, e.at_age, e.one_time_cost, e.annual_impact, e.duration_years, e.color]
        );
      }
      for (const c of (orig.careers || [])) {
        await tdb.run(
          'INSERT INTO careers (scenario_id, job_id, custom_s0, custom_s35, custom_s50, start_age, end_age, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, c.job_id, c.custom_s0, c.custom_s35, c.custom_s50, c.start_age, c.end_age, c.label]
        );
      }
      return id;
    });

    res.status(201).json(await fullScenario(newId));
  } catch (err) { next(err); }
});

module.exports = router;
