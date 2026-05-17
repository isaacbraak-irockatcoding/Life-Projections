/* ══════════════════════════════════════════════
   game.js — NumSlide: daily path-merging puzzle
   Stand-alone module, no dependencies on state/api.
══════════════════════════════════════════════ */

// ── Seeded RNG (mulberry32) ───────────────────────────────────────────────────
function _mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _dateSeed() {
  const d = new Date();
  const s = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ── Tile helpers ──────────────────────────────────────────────────────────────
const OPS = ['+', '-', '*', '÷'];

function _applyOp(a, op, b) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '÷') return b === 0 ? 0 : Math.trunc(a / b);
  return a + b;
}

function _lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function _tileColor(value) {
  const RED  = [248, 113, 113]; // #f87171
  const BLUE = [125, 211, 252]; // #7dd3fc
  const GRN  = [ 74, 222, 128]; // #4ade80
  const clamped = Math.max(-20, Math.min(20, value));
  const t = (clamped + 20) / 40; // 0 → -20, 0.5 → 0, 1 → +20
  const from = t <= 0.5 ? RED : BLUE;
  const to   = t <= 0.5 ? BLUE : GRN;
  const u    = t <= 0.5 ? t * 2 : (t - 0.5) * 2;
  const rgb  = from.map((c, i) => _lerp(c, to[i], u));
  return { bg: `rgb(${rgb.join(',')})`, fg: '#07080f' };
}

function _tileEmoji(value) {
  if (value >= 10)  return '🟩';
  if (value >= 1)   return '🟦';
  if (value === 0)  return '⬜';
  return '🟥';
}

// ── Board generation ──────────────────────────────────────────────────────────
function _generateBoard(rng) {
  const grid = [];
  for (let r = 0; r < 4; r++) {
    grid[r] = [];
    for (let c = 0; c < 4; c++) {
      const value = Math.round(rng() * 18) - 9; // -9 to 9
      const op = OPS[Math.floor(rng() * OPS.length)];
      grid[r][c] = { value, op };
    }
  }
  return grid;
}

// ── Movement helpers ──────────────────────────────────────────────────────────
const _DELTAS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

function _hasNeighbor(r, c, dir) {
  const [dr, dc] = _DELTAS[dir];
  const nr = r + dr, nc = c + dc;
  return nr >= 0 && nr < 4 && nc >= 0 && nc < 4 && _gs.grid[nr][nc] !== null;
}

function _anyNeighbor(r, c) {
  return ['up', 'down', 'left', 'right'].some(d => _hasNeighbor(r, c, d));
}

// ── Persistence ───────────────────────────────────────────────────────────────
const SAVE_KEY = 'numslide_daily';

function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.date !== _todayStr()) return null;
    return data;
  } catch { return null; }
}

function _writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      date: _todayStr(),
      grid: state.grid,
      activePos: state.activePos,
      phase: state.phase,
      moves: state.moves,
      score: state.score,
    }));
  } catch {}
}

// ── Game state ────────────────────────────────────────────────────────────────
let _gs = null;
// { grid, activePos: {r,c}|null, phase: 'select'|'play'|'over', moves, score }

function _initState() {
  const saved = _loadSave();
  if (saved) {
    _gs = saved;
    return;
  }
  const rng = _mulberry32(_dateSeed());
  const grid = _generateBoard(rng);
  _gs = { grid, activePos: null, phase: 'select', moves: 0, score: 0 };
  _writeSave(_gs);
}

// ── Select phase ──────────────────────────────────────────────────────────────
function _selectTile(r, c) {
  if (!_gs || _gs.phase !== 'select') return;
  if (!_gs.grid[r][c]) return;
  _gs.activePos = { r, c };
  _gs.score = _gs.grid[r][c].value;
  _renderBoard();
}

// ── Move active tile one step ─────────────────────────────────────────────────
function _moveActive(dir) {
  if (!_gs || _gs.phase === 'over') return;
  if (!_gs.activePos) return;
  if (!_hasNeighbor(_gs.activePos.r, _gs.activePos.c, dir)) return;

  const { r, c } = _gs.activePos;
  const [dr, dc] = _DELTAS[dir];
  const nr = r + dr, nc = c + dc;

  const active = _gs.grid[r][c];
  const target = _gs.grid[nr][nc];
  const merged = {
    value: _applyOp(active.value, target.op, target.value),
    op: target.op,
  };

  _gs.grid[r][c] = null;
  _gs.grid[nr][nc] = merged;
  _gs.activePos = { r: nr, c: nc };
  _gs.phase = 'play';
  _gs.moves++;
  _gs.score = merged.value;

  if (!_anyNeighbor(nr, nc)) _gs.phase = 'over';
  _writeSave(_gs);
  _renderBoard();
  if (_gs.phase === 'over') _showGameOver();
}

// ── DOM rendering ─────────────────────────────────────────────────────────────
function _updateDirButtons() {
  ['up', 'down', 'left', 'right'].forEach(d => {
    const btn = document.getElementById(`dir-btn-${d}`);
    if (!btn) return;
    const pos = _gs?.activePos;
    const ok = pos && _gs.phase !== 'over' && _hasNeighbor(pos.r, pos.c, d);
    btn.disabled = !ok;
  });
}

function _renderBoard() {
  const wrap = document.getElementById('game-grid');
  if (!wrap || !_gs) return;
  wrap.innerHTML = '';

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const tile = _gs.grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'game-tile';

      if (tile) {
        const { bg, fg } = _tileColor(tile.value);
        cell.style.background = bg;
        cell.style.color = fg;

        const isActive = _gs.activePos && _gs.activePos.r === r && _gs.activePos.c === c;
        const hideOp   = isActive && _gs.phase !== 'select';

        cell.innerHTML = hideOp
          ? `<span class="tile-val">${tile.value}</span>`
          : `<span class="tile-op">${tile.op}</span><span class="tile-val">${tile.value}</span>`;

        if (isActive) {
          cell.classList.add('game-tile--active');
        } else if (_gs.phase === 'select') {
          cell.classList.add('game-tile--selectable');
          cell.addEventListener('click', () => _selectTile(r, c));
        }
      }

      wrap.appendChild(cell);
    }
  }

  // Update score display
  const scoreEl = document.getElementById('game-score');
  if (scoreEl) scoreEl.textContent = _gs.score;
  const movesEl = document.getElementById('game-moves');
  if (movesEl) movesEl.textContent = _gs.moves;

  // Update instruction text
  const instrEl = document.getElementById('game-instr');
  if (instrEl) {
    if (_gs.phase === 'select') {
      instrEl.textContent = _gs.activePos
        ? 'Tile selected — slide to begin, or tap another tile'
        : 'Tap any tile to begin your journey';
    } else if (_gs.phase === 'play') {
      instrEl.textContent = 'Merge tiles — reach the highest value!';
    }
  }

  _updateDirButtons();
}

function _showGameOver() {
  const banner = document.getElementById('game-over-banner');
  if (!banner) return;
  banner.style.display = '';
  const instrEl = document.getElementById('game-instr');
  if (instrEl) instrEl.style.display = 'none';

  const shareText = _buildShareText();
  banner.innerHTML = `
    <div style="font-size:32px;margin-bottom:8px;">🏁</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Dead End!</div>
    <div style="font-size:14px;color:var(--muted2);margin-bottom:16px;">
      Final score: <strong style="color:var(--teal);">${_gs.score}</strong> · ${_gs.moves} merge${_gs.moves === 1 ? '' : 's'}
    </div>
    <button class="btn btn-primary" id="share-btn" style="width:100%;margin-bottom:8px;">Copy Result</button>
    <div id="share-confirm" style="font-size:12px;color:var(--teal);display:none;margin-top:4px;">Copied!</div>
  `;
  document.getElementById('share-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(shareText).catch(() => {});
    const confirm = document.getElementById('share-confirm');
    if (confirm) { confirm.style.display = ''; setTimeout(() => confirm.style.display = 'none', 2000); }
  });
}

function _buildShareText() {
  const rows = _gs.grid.map(row =>
    row.map(t => t ? _tileEmoji(t.value) : '⬛').join('')
  ).join('\n');
  return `NumSlide ${_todayStr()}\nScore: ${_gs.score} in ${_gs.moves} moves\n${rows}`;
}

// ── Input handling ────────────────────────────────────────────────────────────
let _touchStart = null;

function _onKey(e) {
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const dir = map[e.key];
  if (!dir) return;
  const tab = document.getElementById('screen-game');
  if (!tab || tab.style.display === 'none') return;
  e.preventDefault();
  _moveActive(dir);
}

function _onTouchStart(e) {
  const t = e.touches[0];
  _touchStart = { x: t.clientX, y: t.clientY };
}

function _onTouchEnd(e) {
  if (!_touchStart) return;
  const tab = document.getElementById('screen-game');
  if (!tab || tab.style.display === 'none') return;
  const t = e.changedTouches[0];
  const dx = t.clientX - _touchStart.x;
  const dy = t.clientY - _touchStart.y;
  _touchStart = null;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    _moveActive(dx > 0 ? 'right' : 'left');
  } else {
    _moveActive(dy > 0 ? 'down' : 'up');
  }
}

let _listenersAttached = false;
function _attachListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener('keydown', _onKey);
  document.addEventListener('touchstart', _onTouchStart, { passive: true });
  document.addEventListener('touchend', _onTouchEnd, { passive: true });
}

// ── Public render entry ───────────────────────────────────────────────────────
function renderGameTab() {
  const el = document.getElementById('game-content');
  if (!el) return;

  _initState();

  el.innerHTML = `
    <div style="padding-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <h2 style="margin:0;font-family:var(--font-disp);font-size:22px;">NumSlide</h2>
        <span style="font-size:12px;color:var(--muted2);">${_todayStr()}</span>
      </div>
      <p id="game-instr" style="font-size:12px;color:var(--teal);margin:0 0 14px;line-height:1.55;min-height:18px;">
        Tap any tile to begin your journey
      </p>

      <div style="display:flex;gap:12px;margin-bottom:14px;">
        <div class="game-stat-card">
          <div class="game-stat-label">Score</div>
          <div class="game-stat-val" id="game-score">${_gs.score}</div>
        </div>
        <div class="game-stat-card">
          <div class="game-stat-label">Merges</div>
          <div class="game-stat-val" id="game-moves">${_gs.moves}</div>
        </div>
      </div>

      <div class="game-grid" id="game-grid"></div>

      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
        <button class="game-dir-btn" id="dir-btn-up"    onclick="_moveActive('up')"   >▲</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:4px;">
        <button class="game-dir-btn" id="dir-btn-left"  onclick="_moveActive('left')" >◀</button>
        <button class="game-dir-btn" id="dir-btn-down"  onclick="_moveActive('down')" >▼</button>
        <button class="game-dir-btn" id="dir-btn-right" onclick="_moveActive('right')">▶</button>
      </div>

      <div id="game-over-banner" class="game-over-banner" style="display:none;"></div>

      <div style="margin-top:18px;padding:12px 14px;background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--muted2);line-height:1.8;">
        <strong style="color:var(--text);">How to play</strong><br>
        Tap a tile to select it, then slide it into a neighbor to merge.<br>
        <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">3+</code> merges into
        <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">5−</code>
        → <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">8−</code>
        · The operator on your tile applies; the neighbor's carries forward.<br>
        New puzzle every day at midnight.
      </div>
    </div>
  `;

  _renderBoard();
  _attachListeners();
  _updateDirButtons();

  if (_gs.phase === 'over') _showGameOver();
}
