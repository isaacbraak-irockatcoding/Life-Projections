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
      health_insurance_enabled = 1,
      invest_pct = 0, invest_return_rate = 7
    } = req.body;
    const row = await db.get(`
      INSERT INTO scenarios (user_id, name, color, job_id, custom_s0, custom_s35, custom_s50,
                             start_age, career_start_age, retire_age, save_pct, return_rate, annual_expenses, state_code,
                             le_has_rent, le_rent_monthly, le_pet_count, le_dining, le_has_car, le_utilities_monthly,
                             le_housing_tier, le_groceries, le_phone_monthly, le_healthcare_monthly, le_clothing_monthly,
                             health_insurance_monthly, health_insurance_coverage, health_insurance_plan, health_insurance_enabled,
                             invest_pct, invest_return_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [req.userId, name, color, job_id, custom_s0 ?? null, custom_s35 ?? null, custom_s50 ?? null,
        start_age, career_start_age, retire_age, save_pct, return_rate, annual_expenses, state_code,
        le_has_rent, le_rent_monthly, le_pet_count, le_dining, le_has_car, le_utilities_monthly,
        le_housing_tier, le_groceries, le_phone_monthly, le_healthcare_monthly, le_clothing_monthly,
        health_insurance_monthly, health_insurance_coverage, health_insurance_plan, health_insurance_enabled,
        invest_pct, invest_return_rate]);
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
                     'rent_start_age','rent_end_age','invest_pct','invest_return_rate'];
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
                               health_insurance_monthly, health_insurance_coverage, health_insurance_plan, health_insurance_enabled,
                               rent_start_age, rent_end_age, invest_pct, invest_return_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          orig.health_insurance_enabled ?? 1,
          orig.rent_start_age ?? null, orig.rent_end_age ?? null,
          orig.invest_pct || 0, orig.invest_return_rate || 7]);
      const id = r.id;

      // Insert events first so we can remap event_id references on assets/debts
      const eventIdMap = {};
      for (const e of orig.events) {
        const newEvt = await tdb.get(
          `INSERT INTO events (scenario_id, event_type, name, emoji, at_age, one_time_cost, annual_impact, duration_years, color,
                               annual_cost_pct, home_value, home_appreciation_rate, mortgage_rate, mortgage_years,
                               spouse_job_id, spouse_s0, spouse_s35, spouse_s50, spouse_career_start_age)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [id, e.event_type, e.name, e.emoji, e.at_age, e.one_time_cost, e.annual_impact, e.duration_years, e.color,
           e.annual_cost_pct ?? 3, e.home_value ?? 0, e.home_appreciation_rate ?? 3,
           e.mortgage_rate ?? 7, e.mortgage_years ?? 30,
           e.spouse_job_id ?? null, e.spouse_s0 ?? null, e.spouse_s35 ?? null, e.spouse_s50 ?? null,
           e.spouse_career_start_age ?? null]
        );
        eventIdMap[e.id] = newEvt.id;
      }

      // Insert debts with RETURNING id so we can remap loan_id on schools
      const debtIdMap = {};
      for (const d of orig.debts) {
        const newDebt = await tdb.get(
          'INSERT INTO debts (scenario_id, type, label, balance, interest_rate, monthly_payment, start_age, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
          [id, d.type, d.label, d.balance, d.interest_rate, d.monthly_payment,
           d.start_age ?? null,
           d.event_id ? (eventIdMap[d.event_id] ?? null) : null]
        );
        debtIdMap[d.id] = newDebt.id;
      }

      for (const a of orig.assets) {
        await tdb.run(
          'INSERT INTO assets (scenario_id, type, label, value, annual_contribution, expected_return_rate, start_age, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, a.type, a.label, a.value, a.annual_contribution, a.expected_return_rate,
           a.start_age ?? null,
           a.event_id ? (eventIdMap[a.event_id] ?? null) : null]
        );
      }

      for (const c of (orig.careers || [])) {
        await tdb.run(
          'INSERT INTO careers (scenario_id, job_id, custom_s0, custom_s35, custom_s50, start_age, end_age, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, c.job_id, c.custom_s0, c.custom_s35, c.custom_s50, c.start_age, c.end_age, c.label]
        );
      }

      for (const sc of (orig.schools || [])) {
        await tdb.run(
          `INSERT INTO schools (scenario_id, type, name, tuition_annual, years, start_age, parent_pays, scholarship_annual, scholarship_years, loan_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, sc.type, sc.name, sc.tuition_annual, sc.years, sc.start_age, sc.parent_pays, sc.scholarship_annual, sc.scholarship_years,
           sc.loan_id ? (debtIdMap[sc.loan_id] ?? null) : null]
        );
      }
      for (const ls of (orig.lifestyles || [])) {
        await tdb.run(
          `INSERT INTO lifestyles (scenario_id, start_age, le_housing_tier, le_utilities_monthly, le_groceries, le_dining,
                                   le_has_car, le_pet_count, le_phone_monthly, le_healthcare_monthly, le_clothing_monthly,
                                   annual_expenses, lifestyle_pct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, ls.start_age, ls.le_housing_tier, ls.le_utilities_monthly, ls.le_groceries, ls.le_dining,
           ls.le_has_car, ls.le_pet_count, ls.le_phone_monthly, ls.le_healthcare_monthly, ls.le_clothing_monthly,
           ls.annual_expenses, ls.lifestyle_pct || 0]
        );
      }
      return id;
    });

    res.status(201).json(await fullScenario(newId));
  } catch (err) { next(err); }
});

module.exports = router;
