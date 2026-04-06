const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateJoinCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function isMember(groupId, userId) {
  return db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

function isOwner(groupId, userId) {
  return db.prepare('SELECT 1 FROM groups WHERE id = ? AND owner_id = ?').get(groupId, userId);
}

function ensureShareLink(scenarioId) {
  let link = db.prepare('SELECT * FROM share_links WHERE scenario_id = ?').get(scenarioId);
  if (!link) {
    const token = crypto.randomBytes(16).toString('hex');
    const r = db.prepare('INSERT INTO share_links (scenario_id, token) VALUES (?, ?)').run(scenarioId, token);
    link = db.prepare('SELECT * FROM share_links WHERE id = ?').get(r.lastInsertRowid);
  }
  return link;
}

// POST /api/groups — create a group
router.post('/', requireAuth, (req, res, next) => {
  try {
    const name = (req.body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'name is required' });

    let join_code, attempts = 0;
    do {
      join_code = generateJoinCode();
      attempts++;
    } while (db.prepare('SELECT 1 FROM groups WHERE join_code = ?').get(join_code) && attempts < 10);

    const r = db.prepare('INSERT INTO groups (name, owner_id, join_code) VALUES (?, ?, ?)').run(name, req.userId, join_code);
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(r.lastInsertRowid);

    // Owner is automatically a member
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, req.userId);

    res.status(201).json(group);
  } catch (err) { next(err); }
});

// GET /api/groups — list groups I belong to
router.get('/', requireAuth, (req, res, next) => {
  try {
    const groups = db.prepare(`
      SELECT g.id, g.name, g.join_code, g.owner_id, g.created_at,
             (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `).all(req.userId);
    res.json(groups);
  } catch (err) { next(err); }
});

// POST /api/groups/join — join by code (must come before /:id)
router.post('/join', requireAuth, (req, res, next) => {
  try {
    const code = (req.body.join_code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'join_code is required' });

    const group = db.prepare('SELECT * FROM groups WHERE UPPER(join_code) = ?').get(code);
    if (!group) return res.status(404).json({ error: 'Invalid join code' });

    if (!isMember(group.id, req.userId)) {
      const count = db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').get(group.id).n;
      if (count >= 50) return res.status(400).json({ error: 'Group is full (max 50 members)' });
      db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, req.userId);
    }

    res.json({ group_id: group.id, name: group.name, owner_id: group.owner_id });
  } catch (err) { next(err); }
});

// GET /api/groups/:id — group detail with member list
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!isMember(group.id, req.userId)) return res.status(403).json({ error: 'Not a member' });

    const members = db.prepare(`
      SELECT gm.user_id, gm.share_token, gm.joined_at, u.username, u.avatar
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `).all(group.id);

    res.json({ ...group, members });
  } catch (err) { next(err); }
});

// PATCH /api/groups/:id/publish — publish scenario to group
router.patch('/:id/publish', requireAuth, (req, res, next) => {
  try {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!isMember(group.id, req.userId)) return res.status(403).json({ error: 'Not a member' });

    const { scenario_id } = req.body;
    if (!scenario_id) return res.status(400).json({ error: 'scenario_id is required' });

    const scenario = db.prepare('SELECT id FROM scenarios WHERE id = ? AND user_id = ?').get(scenario_id, req.userId);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const link = ensureShareLink(scenario_id);
    db.prepare('UPDATE group_members SET share_token = ? WHERE group_id = ? AND user_id = ?').run(link.token, group.id, req.userId);

    res.json({ share_token: link.token });
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id/members/:userId — remove a member (owner only)
router.delete('/:id/members/:userId', requireAuth, (req, res, next) => {
  try {
    if (!isOwner(req.params.id, req.userId)) return res.status(403).json({ error: 'Not the group owner' });
    if (parseInt(req.params.userId) === req.userId) return res.status(400).json({ error: 'Cannot remove yourself; delete the group instead' });
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id — delete group (owner only)
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    if (!isOwner(req.params.id, req.userId)) return res.status(403).json({ error: 'Not the group owner' });
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
