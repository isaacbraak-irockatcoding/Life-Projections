const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateJoinCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function isMember(groupId, userId) {
  return await db.get('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
}

async function isOwner(groupId, userId) {
  return await db.get('SELECT 1 FROM groups WHERE id = ? AND owner_id = ?', [groupId, userId]);
}

async function ensureShareLink(scenarioId) {
  let link = await db.get('SELECT * FROM share_links WHERE scenario_id = ?', [scenarioId]);
  if (!link) {
    const token = crypto.randomBytes(16).toString('hex');
    link = await db.get('INSERT INTO share_links (scenario_id, token) VALUES (?, ?) RETURNING *',
      [scenarioId, token]);
  }
  return link;
}

// POST /api/groups — create a group
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'name is required' });

    let join_code, attempts = 0;
    do {
      join_code = generateJoinCode();
      attempts++;
    } while (await db.get('SELECT 1 FROM groups WHERE join_code = ?', [join_code]) && attempts < 10);

    const group = await db.get('INSERT INTO groups (name, owner_id, join_code) VALUES (?, ?, ?) RETURNING *',
      [name, req.userId, join_code]);

    // Owner is automatically a member
    await db.run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [group.id, req.userId]);

    res.status(201).json(group);
  } catch (err) { next(err); }
});

// GET /api/groups — list groups I belong to
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const groups = await db.all(`
      SELECT g.id, g.name, g.join_code, g.owner_id, g.created_at,
             (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `, [req.userId]);
    res.json(groups);
  } catch (err) { next(err); }
});

// POST /api/groups/join — join by code (must come before /:id)
router.post('/join', requireAuth, async (req, res, next) => {
  try {
    const code = (req.body.join_code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'join_code is required' });

    const group = await db.get('SELECT * FROM groups WHERE UPPER(join_code) = ?', [code]);
    if (!group) return res.status(404).json({ error: 'Invalid join code' });

    if (!await isMember(group.id, req.userId)) {
      const countRow = await db.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', [group.id]);
      if (parseInt(countRow.n) >= 50) return res.status(400).json({ error: 'Group is full (max 50 members)' });
      await db.run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [group.id, req.userId]);
    }

    res.json({ group_id: group.id, name: group.name, owner_id: group.owner_id });
  } catch (err) { next(err); }
});

// GET /api/groups/:id — group detail with member list
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!await isMember(group.id, req.userId)) return res.status(403).json({ error: 'Not a member' });

    const members = await db.all(`
      SELECT gm.user_id, gm.share_token, gm.joined_at, u.username, u.avatar
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `, [group.id]);

    res.json({ ...group, members });
  } catch (err) { next(err); }
});

// PATCH /api/groups/:id/publish — publish scenario to group
router.patch('/:id/publish', requireAuth, async (req, res, next) => {
  try {
    const group = await db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!await isMember(group.id, req.userId)) return res.status(403).json({ error: 'Not a member' });

    const { scenario_id } = req.body;
    if (!scenario_id) return res.status(400).json({ error: 'scenario_id is required' });

    const scenario = await db.get('SELECT id FROM scenarios WHERE id = ? AND user_id = ?', [scenario_id, req.userId]);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const link = await ensureShareLink(scenario_id);
    await db.run('UPDATE group_members SET share_token = ? WHERE group_id = ? AND user_id = ?',
      [link.token, group.id, req.userId]);

    res.json({ share_token: link.token });
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id/members/:userId — remove a member (owner only)
router.delete('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    if (!await isOwner(req.params.id, req.userId)) return res.status(403).json({ error: 'Not the group owner' });
    if (parseInt(req.params.userId) === req.userId) return res.status(400).json({ error: 'Cannot remove yourself; delete the group instead' });
    await db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id — delete group (owner only)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await isOwner(req.params.id, req.userId)) return res.status(403).json({ error: 'Not the group owner' });
    await db.run('DELETE FROM groups WHERE id = ?', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
