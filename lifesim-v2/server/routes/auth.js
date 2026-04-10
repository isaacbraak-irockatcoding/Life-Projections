const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, avatar = '🦊' } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ error: 'username must be 2–30 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Generate a one-time recovery code — shown to user once, stored hashed
    const rawCode = 'LIFESIM-' +
      crypto.randomBytes(2).toString('hex').toUpperCase() + '-' +
      crypto.randomBytes(2).toString('hex').toUpperCase();
    const recoveryHash = await bcrypt.hash(rawCode, SALT_ROUNDS);

    const result = db.prepare(
      'INSERT INTO users (username, password_hash, avatar, recovery_code_hash) VALUES (?, ?, ?, ?)'
    ).run(username, hash, avatar, recoveryHash);

    const user = { id: result.lastInsertRowid, username, avatar };
    res.status(201).json({ token: makeToken(user.id), user, recovery_code: rawCode });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const row = db.prepare('SELECT id, username, avatar, password_hash FROM users WHERE username = ?').get(username);
    if (!row) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = { id: row.id, username: row.username, avatar: row.avatar };
    res.json({ token: makeToken(user.id), user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/guest
router.post('/guest', async (req, res, next) => {
  try {
    const suffix   = crypto.randomBytes(4).toString('hex');
    const username = `guest_${suffix}`;
    const password = crypto.randomBytes(16).toString('hex');
    const hash     = await bcrypt.hash(password, SALT_ROUNDS);
    const result   = db.prepare(
      'INSERT INTO users (username, password_hash, avatar) VALUES (?, ?, ?)'
    ).run(username, hash, '🦊');
    const user = { id: result.lastInsertRowid, username, avatar: '🦊' };
    res.status(201).json({ token: makeToken(user.id), user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/recover
router.post('/recover', async (req, res, next) => {
  try {
    const { username, recovery_code, new_password } = req.body;
    if (!username || !recovery_code || !new_password) {
      return res.status(400).json({ error: 'username, recovery_code, and new_password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const row = db.prepare('SELECT id, recovery_code_hash FROM users WHERE username = ?').get(username);
    if (!row || !row.recovery_code_hash) {
      return res.status(400).json({ error: 'Invalid username or recovery code' });
    }

    const match = await bcrypt.compare(recovery_code, row.recovery_code_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid username or recovery code' });
    }

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    // Invalidate the recovery code after use so it can't be reused
    db.prepare('UPDATE users SET password_hash = ?, recovery_code_hash = NULL WHERE id = ?')
      .run(newHash, row.id);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res, next) => {
  try {
    const row = db.prepare('SELECT id, username, avatar, created_at FROM users WHERE id = ?').get(req.userId);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
