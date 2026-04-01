const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function ownScenario(scenarioId, userId) {
  return db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenarioId, userId);
}

function fullSnapshot(scenarioId) {
  const s = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(scenarioId);
  if (!s) return null;
  s.assets = db.prepare('SELECT * FROM assets WHERE scenario_id = ? ORDER BY id').all(scenarioId);
  s.debts  = db.prepare('SELECT * FROM debts  WHERE scenario_id = ? ORDER BY id').all(scenarioId);
  s.events = db.prepare('SELECT * FROM events WHERE scenario_id = ? ORDER BY at_age').all(scenarioId);
  // Include owner info but not user_id
  const owner = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(s.user_id);
  s.owner = owner;
  delete s.user_id;
  return s;
}

// POST /api/scenarios/:id/share — idempotent, returns or creates share link
router.post('/scenarios/:id/share', requireAuth, (req, res, next) => {
  try {
    if (!ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });

    let link = db.prepare('SELECT * FROM share_links WHERE scenario_id = ?').get(req.params.id);
    if (!link) {
      const token = crypto.randomBytes(16).toString('hex');
      const r = db.prepare('INSERT INTO share_links (scenario_id, token) VALUES (?, ?)').run(req.params.id, token);
      link = db.prepare('SELECT * FROM share_links WHERE id = ?').get(r.lastInsertRowid);
    }
    res.json({ token: link.token, url: `/share/${link.token}` });
  } catch (err) { next(err); }
});

// DELETE /api/scenarios/:id/share — revoke
router.delete('/scenarios/:id/share', requireAuth, (req, res, next) => {
  try {
    if (!ownScenario(req.params.id, req.userId)) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM share_links WHERE scenario_id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/share/:token — public, read-only scenario snapshot
router.get('/share/:token', (req, res, next) => {
  try {
    const link = db.prepare('SELECT * FROM share_links WHERE token = ?').get(req.params.token);
    if (!link) return res.status(404).json({ error: 'Share link not found or expired' });
    if (link.expires_at && link.expires_at < Math.floor(Date.now() / 1000)) {
      return res.status(410).json({ error: 'Share link has expired' });
    }
    const snapshot = fullSnapshot(link.scenario_id);
    res.json(snapshot);
  } catch (err) { next(err); }
});

// GET /api/share/:token/comments — public
router.get('/share/:token/comments', (req, res, next) => {
  try {
    const link = db.prepare('SELECT id FROM share_links WHERE token = ?').get(req.params.token);
    if (!link) return res.status(404).json({ error: 'Share link not found' });
    const comments = db.prepare(`
      SELECT c.id, c.body, c.created_at, u.username, u.avatar
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.share_link_id = ?
      ORDER BY c.created_at ASC
    `).all(link.id);
    res.json(comments);
  } catch (err) { next(err); }
});

// POST /api/share/:token/comments — auth required to comment
router.post('/share/:token/comments', requireAuth, (req, res, next) => {
  try {
    const link = db.prepare('SELECT id FROM share_links WHERE token = ?').get(req.params.token);
    if (!link) return res.status(404).json({ error: 'Share link not found' });
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
    const r = db.prepare('INSERT INTO comments (share_link_id, user_id, body) VALUES (?, ?, ?)').run(link.id, req.userId, body.trim());
    const comment = db.prepare(`
      SELECT c.id, c.body, c.created_at, u.username, u.avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(r.lastInsertRowid);
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

module.exports = router;
