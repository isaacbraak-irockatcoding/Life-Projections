const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function ownScenario(scenarioId, userId) {
  return await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenarioId, userId]);
}

async function fullSnapshot(scenarioId) {
  const s = await db.get('SELECT * FROM scenarios WHERE id = ?', [scenarioId]);
  if (!s) return null;
  s.assets = await db.all('SELECT * FROM assets WHERE scenario_id = ? ORDER BY id', [scenarioId]);
  s.debts  = await db.all('SELECT * FROM debts  WHERE scenario_id = ? ORDER BY id', [scenarioId]);
  s.events = await db.all('SELECT * FROM events WHERE scenario_id = ? ORDER BY at_age', [scenarioId]);
  // Include owner info but not user_id
  const owner = await db.get('SELECT username, avatar FROM users WHERE id = ?', [s.user_id]);
  s.owner = owner;
  delete s.user_id;
  return s;
}

// POST /api/scenarios/:id/share — idempotent, returns or creates share link
router.post('/scenarios/:id/share', requireAuth, async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });

    let link = await db.get('SELECT * FROM share_links WHERE scenario_id = ?', [req.params.id]);
    if (!link) {
      const token = crypto.randomBytes(16).toString('hex');
      link = await db.get('INSERT INTO share_links (scenario_id, token) VALUES (?, ?) RETURNING *',
        [req.params.id, token]);
    }
    res.json({ token: link.token, url: `/share/${link.token}` });
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:id/share — revoke
router.delete('/scenarios/:id/share', requireAuth, async (req, res, next) => {
  try {
    if (!await ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });
    await db.run('DELETE FROM share_links WHERE scenario_id = ?', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/share/:token — public, read-only scenario snapshot
router.get('/share/:token', async (req, res, next) => {
  try {
    const link = await db.get('SELECT * FROM share_links WHERE token = ?', [req.params.token]);
    if (!link) return res.status(404).json({ error: 'Share link not found or expired' });
    if (link.expires_at && link.expires_at < Math.floor(Date.now() / 1000)) {
      return res.status(410).json({ error: 'Share link has expired' });
    }
    const snapshot = await fullSnapshot(link.scenario_id);
    res.json(snapshot);
  } catch (err) { next(err); }
});

// GET /api/share/:token/comments — public
router.get('/share/:token/comments', async (req, res, next) => {
  try {
    const link = await db.get('SELECT id FROM share_links WHERE token = ?', [req.params.token]);
    if (!link) return res.status(404).json({ error: 'Share link not found' });
    const comments = await db.all(`
      SELECT c.id, c.body, c.created_at, u.username, u.avatar
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.share_link_id = ?
      ORDER BY c.created_at ASC
    `, [link.id]);
    res.json(comments);
  } catch (err) { next(err); }
});

// POST /api/share/:token/comments — auth required to comment
router.post('/share/:token/comments', requireAuth, async (req, res, next) => {
  try {
    const link = await db.get('SELECT id FROM share_links WHERE token = ?', [req.params.token]);
    if (!link) return res.status(404).json({ error: 'Share link not found' });
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
    const r = await db.get('INSERT INTO comments (share_link_id, user_id, body) VALUES (?, ?, ?) RETURNING id',
      [link.id, req.userId, body.trim()]);
    const comment = await db.get(`
      SELECT c.id, c.body, c.created_at, u.username, u.avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `, [r.id]);
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

module.exports = router;
