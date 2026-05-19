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
  if (op === '÷') return b === 0 ? 0 : a / b;
  return a + b;
}

function _fmtVal(v) {
  if (!Number.isFinite(v)) return '0';
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return parseFloat(v.toFixed(1)).toLocaleString('en-US');
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
  const grid = Array.from({length: 4}, () =>
    Array.from({length: 4}, () => ({ value: Math.round(rng() * 18) - 9 }))
  );
  const hops = Array.from({length: 4}, () =>
    Array.from({length: 3}, () => OPS[Math.floor(rng() * OPS.length)])
  );
  const vops = Array.from({length: 3}, () =>
    Array.from({length: 4}, () => OPS[Math.floor(rng() * OPS.length)])
  );
  _capDivisions(hops, vops, rng);
  return { grid, hops, vops };
}

function _capDivisions(hops, vops, rng) {
  const nonDiv = ['+', '-', '*'];
  let divCount = 0;
  for (let r = 0; r < hops.length; r++)
    for (let c = 0; c < hops[r].length; c++)
      if (hops[r][c] === '÷' && ++divCount > 2)
        hops[r][c] = nonDiv[Math.floor(rng() * 3)];
  for (let r = 0; r < vops.length; r++)
    for (let c = 0; c < vops[r].length; c++)
      if (vops[r][c] === '÷' && ++divCount > 2)
        vops[r][c] = nonDiv[Math.floor(rng() * 3)];
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
    if (!data.hops || !data.vops) return null;
    return data;
  } catch { return null; }
}

function _writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      date: _todayStr(),
      grid: state.grid,
      hops: state.hops,
      vops: state.vops,
      origGrid: state.origGrid,
      activePos: state.activePos,
      phase: state.phase,
      moves: state.moves,
      score: state.score,
    }));
  } catch {}
}

// ── Game state ────────────────────────────────────────────────────────────────
let _gs = null;
// { grid, hops, vops, activePos: {r,c}|null, phase: 'select'|'play'|'over', moves, score }
let _bestPath = null; // [{r,c}] gold path overlay, or null

function _initState() {
  const saved = _loadSave();
  if (saved) {
    _gs = saved;
    return;
  }
  const rng = _mulberry32(_dateSeed());
  const { grid, hops, vops } = _generateBoard(rng);
  _gs = { grid, hops, vops,
          origGrid: grid.map(row => row.map(t => t ? { ...t } : null)),
          activePos: null, phase: 'select', moves: 0, score: 0 };
  _writeSave(_gs);
}

function _resetGame() {
  localStorage.removeItem(SAVE_KEY);
  _gs = null;
  _bestPath = null;
  renderGameTab();
}

// ── Best-path finder (DFS with backtracking) ──────────────────────────────────
function _findBestPath() {
  if (!_gs) return null;
  const { hops, vops } = _gs;
  let bestScore = -Infinity;
  let bestFound = null;

  function edgeOp(r, c, dir) {
    if (dir === 'right') return hops[r][c];
    if (dir === 'left')  return hops[r][c - 1];
    if (dir === 'down')  return vops[r][c];
    return vops[r - 1][c];
  }

  function dfs(grid, r, c, value, path) {
    let moved = false;
    for (const dir of ['up', 'down', 'left', 'right']) {
      const [dr, dc] = _DELTAS[dir];
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= 4 || nc < 0 || nc >= 4 || !grid[nr][nc]) continue;
      moved = true;
      const newVal = _applyOp(value, edgeOp(r, c, dir), grid[nr][nc].value);
      const savedA = grid[r][c], savedT = grid[nr][nc];
      grid[r][c] = null;
      grid[nr][nc] = { value: newVal };
      path.push({ r: nr, c: nc });
      dfs(grid, nr, nc, newVal, path);
      path.pop();
      grid[r][c] = savedA;
      grid[nr][nc] = savedT;
    }
    if (!moved && value > bestScore) {
      bestScore = value;
      bestFound = path.slice();
    }
  }

  const baseGrid = _gs.origGrid || _gs.grid;
  const grid = baseGrid.map(row => row.map(t => t ? { ...t } : null));
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c]) dfs(grid, r, c, grid[r][c].value, [{ r, c }]);

  return bestFound ? { path: bestFound, score: bestScore } : null;
}

function _toggleHint() {
  if (_bestPath) {
    _bestPath = null;
  } else {
    const result = _findBestPath();
    _bestPath = result ? result.path : null;
  }
  _renderBoard();
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
  const edgeOp = dir === 'right' ? _gs.hops[r][c]
               : dir === 'left'  ? _gs.hops[r][c - 1]
               : dir === 'down'  ? _gs.vops[r][c]
               :                   _gs.vops[r - 1][c];
  const merged = { value: _applyOp(active.value, edgeOp, target.value) };

  _bestPath = null;
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

  const showOrig = _bestPath && _gs.phase === 'over' && _gs.origGrid;
  const displayGrid = showOrig ? _gs.origGrid : _gs.grid;
  const activeR = showOrig ? undefined : _gs.activePos?.r;
  const activeC = showOrig ? undefined : _gs.activePos?.c;

  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = document.createElement('div');
      const rowEven = row % 2 === 0;
      const colEven = col % 2 === 0;

      if (rowEven && colEven) {
        // Tile cell
        const r = row / 2, c = col / 2;
        const tile = displayGrid[r][c];
        cell.className = 'game-tile';
        if (tile) {
          const pathStep = _bestPath ? _bestPath.findIndex(p => p.r === r && p.c === c) : -1;
          const onPath   = pathStep >= 0;
          const isStart  = pathStep === 0;
          const isEnd    = onPath && pathStep === _bestPath.length - 1;
          cell.style.background = onPath
            ? (isStart ? '#22c55e' : isEnd ? '#f97316' : '#ffd700')
            : '#7dd3fc';
          cell.style.color = '#07080f';
          const isActive = r === activeR && c === activeC;
          cell.innerHTML = `<span class="tile-val">${_fmtVal(tile.value)}</span>` +
            (onPath ? `<span class="tile-path-step">${isStart ? '▶' : isEnd ? '■' : pathStep}</span>` : '');
          if (isActive) {
            cell.classList.add('game-tile--active');
          } else if (_gs.phase === 'select') {
            cell.classList.add('game-tile--selectable');
            cell.addEventListener('click', () => _selectTile(r, c));
          }
        }
      } else if (rowEven && !colEven) {
        // Horizontal edge op cell between grid[r][hopC] and grid[r][hopC+1]
        const r = row / 2;
        const hopC = (col - 1) / 2;
        const leftTile  = displayGrid[r][hopC];
        const rightTile = displayGrid[r][hopC + 1];
        const op = _gs.hops[r][hopC];
        const bothExist = leftTile && rightTile;
        const isActive  = bothExist && activeR === r && (activeC === hopC || activeC === hopC + 1);
        let pathArrow = null;
        if (_bestPath) {
          for (let i = 1; i < _bestPath.length; i++) {
            const a = _bestPath[i-1], b = _bestPath[i];
            if (a.r === r && a.c === hopC   && b.r === r && b.c === hopC+1) { pathArrow = '→'; break; }
            if (a.r === r && a.c === hopC+1 && b.r === r && b.c === hopC)   { pathArrow = '←'; break; }
          }
        }
        cell.className = 'tile-edge-op' +
          (!bothExist  ? ' tile-edge-op--hidden' : '') +
          (isActive    ? ' tile-edge-op--active' : '') +
          (pathArrow   ? ' tile-edge-op--path'   : '');
        cell.textContent = pathArrow || op;
      } else if (!rowEven && colEven) {
        // Vertical edge op cell between grid[vopR][c] and grid[vopR+1][c]
        const vopR = (row - 1) / 2;
        const c    = col / 2;
        const topTile = displayGrid[vopR][c];
        const botTile = displayGrid[vopR + 1][c];
        const op = _gs.vops[vopR][c];
        const bothExist = topTile && botTile;
        const isActive  = bothExist && activeC === c && (activeR === vopR || activeR === vopR + 1);
        let pathArrow = null;
        if (_bestPath) {
          for (let i = 1; i < _bestPath.length; i++) {
            const a = _bestPath[i-1], b = _bestPath[i];
            if (a.r === vopR && a.c === c && b.r === vopR+1 && b.c === c) { pathArrow = '↓'; break; }
            if (a.r === vopR+1 && a.c === c && b.r === vopR && b.c === c) { pathArrow = '↑'; break; }
          }
        }
        cell.className = 'tile-edge-op' +
          (!bothExist  ? ' tile-edge-op--hidden' : '') +
          (isActive    ? ' tile-edge-op--active' : '') +
          (pathArrow   ? ' tile-edge-op--path'   : '');
        cell.textContent = pathArrow || op;
      } else {
        // Spacer cell (odd row, odd col)
        cell.className = 'tile-edge-spacer';
      }

      wrap.appendChild(cell);
    }
  }

  // Update score display
  const scoreEl = document.getElementById('game-score');
  if (scoreEl) scoreEl.textContent = _fmtVal(_gs.score);
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
  const hintBtn = document.getElementById('hint-btn');
  if (hintBtn) hintBtn.textContent = _bestPath ? '✕ Hide Path' : '★ Best Path';
}

function _scoreRank(score, best) {
  if (best == null || score >= best) return { label: 'Galaxy Brain',    emoji: '🌌', color: '#a78bfa' };
  const ratio = best > 0 ? score / best : 0;
  if (ratio >= 0.75) return { label: 'Big Brain',       emoji: '🧠', color: '#60a5fa' };
  if (ratio >= 0.50) return { label: 'Math Wizard',     emoji: '🧙', color: '#34d399' };
  if (ratio >= 0.25) return { label: 'Number Cruncher', emoji: '⚙️',  color: '#fbbf24' };
  if (ratio >  0)    return { label: 'Rookie',          emoji: '🌱', color: '#94a3b8' };
  return               { label: 'Scrambled',            emoji: '🥚', color: '#f87171' };
}

function _showGameOver() {
  const banner = document.getElementById('game-over-banner');
  if (!banner) return;
  banner.style.display = '';
  const instrEl = document.getElementById('game-instr');
  if (instrEl) instrEl.style.display = 'none';

  const pathResult = _findBestPath();
  const rank = _scoreRank(_gs.score, pathResult?.score ?? null);
  const shareText = _buildShareText();
  banner.innerHTML = `
    <div style="font-size:32px;margin-bottom:8px;">🏁</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Dead End!</div>
    <div style="display:inline-block;padding:4px 16px;border-radius:20px;background:${rank.color}22;border:1px solid ${rank.color};color:${rank.color};font-size:15px;font-weight:700;margin-bottom:12px;">${rank.emoji} ${rank.label}</div>
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
  const pathResult = _findBestPath();
  const rankLabel  = _scoreRank(_gs.score, pathResult?.score ?? null).label;
  return `NumSlide ${_todayStr()}\nScore: ${_gs.score} in ${_gs.moves} moves · ${rankLabel}\n${rows}`;
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

      <div style="margin-top:10px;display:flex;gap:8px;justify-content:center;">
        <button class="game-reset-btn" onclick="_resetGame()">↻ Reset</button>
        <button class="game-reset-btn game-hint-btn" id="hint-btn" onclick="_toggleHint()">★ Best Path</button>
      </div>

      <div id="game-over-banner" class="game-over-banner" style="display:none;"></div>

      <div style="margin-top:18px;padding:12px 14px;background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--muted2);line-height:1.8;">
        <strong style="color:var(--text);">How to play</strong><br>
        <strong style="color:var(--teal);">Objective:</strong> reach the highest number possible.<br>
        Tap a tile to select it, then slide it into a neighbor to merge.<br>
        The operator <strong style="color:var(--text);">between</strong> the two tiles is applied: e.g.
        <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">3</code>
        <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">+</code>
        <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">5</code>
        → <code style="background:var(--surf);padding:1px 5px;border-radius:4px;">8</code>
        · At most 2 ÷ ops per puzzle.<br>
        Use <strong style="color:var(--text);">★ Best Path</strong> to highlight the optimal route in gold.<br>
        New puzzle every day at midnight.
      </div>
    </div>
  `;

  _renderBoard();
  _attachListeners();
  _updateDirButtons();

  if (_gs.phase === 'over') _showGameOver();
}
