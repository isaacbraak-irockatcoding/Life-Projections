const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/friends — accepted friends
router.get('/', async (req, res, next) => {
  try {
    const friends = await db.all(`
      SELECT u.id, u.username, u.avatar, MIN(f.created_at) AS friends_since,
             (SELECT sl.token
              FROM share_links sl
              JOIN scenarios s ON s.id = sl.scenario_id
              WHERE s.user_id = u.id
              ORDER BY s.updated_at DESC LIMIT 1) AS share_token
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
      GROUP BY u.id, u.username, u.avatar
    `, [req.userId, req.userId, req.userId]);
    res.json(friends);
  } catch (err) { next(err); }
});

// GET /api/friends/pending — incoming pending requests
router.get('/pending', async (req, res, next) => {
  try {
    const pending = await db.all(`
      SELECT u.id, u.username, u.avatar, f.created_at AS requested_at
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = 'pending'
    `, [req.userId]);
    res.json(pending);
  } catch (err) { next(err); }
});

// POST /api/friends/request — send request by username
router.post('/request', async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const target = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });

    // Check if already friends or request exists
    const existing = await db.get(`
      SELECT status, requester_id FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `, [req.userId, target.id, target.id, req.userId]);

    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      // If the other user already sent us a pending request, accept it automatically
      if (existing.status === 'pending' && existing.requester_id === target.id) {
        await db.run("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?",
          [target.id, req.userId]);
        return res.json({ message: 'Friend request accepted' });
      }
      return res.status(409).json({ error: 'Friend request already exists' });
    }

    await db.run("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')",
      [req.userId, target.id]);
    res.status(201).json({ message: 'Friend request sent' });
  } catch (err) { next(err); }
});

// POST /api/friends/accept/:requesterId — accept incoming request
router.post('/accept/:requesterId', async (req, res, next) => {
  try {
    const requesterId = parseInt(req.params.requesterId, 10);
    const pending = await db.get(`
      SELECT id FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
    `, [requesterId, req.userId]);
    if (!pending) return res.status(404).json({ error: 'Pending request not found' });

    await db.run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [pending.id]);
    // Clean up any reverse pending request that may have been created simultaneously
    await db.run(
      "DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
      [req.userId, requesterId]
    );
    res.json({ message: 'Friend request accepted' });
  } catch (err) { next(err); }
});

// DELETE /api/friends/:userId — un-friend or reject
router.delete('/:userId', async (req, res, next) => {
  try {
    const otherId = parseInt(req.params.userId, 10);
    await db.run(`
      DELETE FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `, [req.userId, otherId, otherId, req.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
