const express  = require('express');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router    = express.Router();
const CLIPS_DIR = path.join(__dirname, '..', 'clips');
const MAX_AGE   = 24 * 60 * 60 * 1000;

router.post(
  '/clips',
  requireAuth,
  express.raw({ type: ['video/mp4', 'video/webm'], limit: '100mb' }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
      return res.status(400).json({ error: 'Empty or invalid clip' });
    }
    const ext      = (req.headers['content-type'] || '').includes('webm') ? '.webm' : '.mp4';
    const id       = crypto.randomUUID();
    const filename = id + ext;
    fs.writeFileSync(path.join(CLIPS_DIR, filename), req.body);
    const url = `${req.protocol}://${req.get('host')}/api/clips/${filename}`;
    res.json({ id: filename, url, expiresAt: new Date(Date.now() + MAX_AGE).toISOString() });
    _cleanup();
  }
);

router.get('/clips/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^[0-9a-f-]{36}\.(mp4|webm)$/.test(filename)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const filepath = path.join(CLIPS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Clip not found or expired' });
  }
  const stat = fs.statSync(filepath);
  if (Date.now() - stat.mtimeMs > MAX_AGE) {
    fs.unlinkSync(filepath);
    return res.status(404).json({ error: 'Clip not found or expired' });
  }
  const ext = path.extname(filename);
  res.setHeader('Content-Type', ext === '.webm' ? 'video/webm' : 'video/mp4');
  res.setHeader('Content-Disposition', `inline; filename="lifesim-clip${ext}"`);
  res.sendFile(filepath);
});

function _cleanup() {
  try {
    for (const f of fs.readdirSync(CLIPS_DIR)) {
      try {
        const fp   = path.join(CLIPS_DIR, f);
        const stat = fs.statSync(fp);
        if (Date.now() - stat.mtimeMs > MAX_AGE) fs.unlinkSync(fp);
      } catch {}
    }
  } catch {}
}

setInterval(_cleanup, 60 * 60 * 1000);

module.exports = router;
