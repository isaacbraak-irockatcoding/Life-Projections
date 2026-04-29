/* ══════════════════════════════════════════════
   share.js — Scenario sharing, comments, public view
══════════════════════════════════════════════ */

function renderShareTab() {
  const scenario = State.getScenario();
  const user     = State.getUser();
  const el       = document.getElementById('share-content');
  if (!el) return;

  if (!scenario) {
    el.innerHTML = `<div class="empty"><p>No scenario loaded.</p></div>`;
    return;
  }

  const result  = calculatePath(scenario);
  const finalWl = result.path[result.path.length - 1];

  el.innerHTML = `
    <div class="card fade-up" style="margin-bottom:14px;">
      <div style="font-size:11px;color:var(--muted2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">📖 Your Life Story</div>
      ${generateRecap(scenario)}
    </div>

    <div class="share-card fade-up">
      <div class="share-badge">🔗 Share your scenario</div>
      <h2>${scenario.name}</h2>
      <p style="color:var(--muted2);font-size:12px;margin:6px 0 20px;">
        ${(() => { const c = (scenario.careers||[]).slice().sort((a,b)=>a.start_age-b.start_age)[0]; const eid = c ? c.job_id : scenario.job_id; return eid !== 'custom' ? (JOBS.find(j=>j.id===eid)||{}).name||'' : 'Custom salary'; })()} ·
        Retiring at ${scenario.retire_age} ·
        Projected ${fmtM(finalWl)}
      </p>
      <button class="btn btn-primary" onclick="generateShareLink()">📋 Get Share Link</button>
      <div id="share-url-box" style="margin-top:14px;"></div>
    </div>

    <div class="card fade-up" style="margin-top:14px;">
      <h3>Export</h3>
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" id="tiktok-btn" onclick="exportTikTok()">🎬 Record Clip</button>
      </div>
      <p class="micro" style="text-transform:none;letter-spacing:0;font-size:11px;color:var(--muted2);margin-top:8px;">Records the animated chart in 9:16 vertical format — ready to post.</p>
      <div id="clip-preview"></div>
    </div>

    <div id="share-comments-section" style="display:none;" class="fade-up">
      <div class="card" style="margin-top:14px;">
        <h3>Comments</h3>
        <div id="share-comments-list"></div>
        <div class="field" style="margin-top:10px;">
          <input type="text" id="share-comment-input" placeholder="Leave a comment…" maxlength="500"
            onkeydown="if(event.key==='Enter')postShareComment()"/>
          <button class="btn btn-ghost btn-sm" onclick="postShareComment()" style="margin-top:6px;">Post</button>
        </div>
      </div>
    </div>

    <div class="disclaimer" style="margin-top:14px;">
      ⚠️ <span>Educational use only. Not financial advice.</span>
    </div>

    <div style="text-align:center;margin-top:20px;">
      <button class="btn btn-ghost btn-sm" onclick="handleLogout()">Sign Out</button>
    </div>`;
}

let _currentShareToken = null;

async function generateShareLink() {
  const scenario = State.getScenario();
  if (!scenario) return;
  try {
    const { token, url } = await api.getShareLink(scenario.id);
    _currentShareToken = token;
    const fullUrl = `${location.origin}/?share=${token}`;
    document.getElementById('share-url-box').innerHTML = `
      <div class="share-url-box">
        <code style="font-size:11px;word-break:break-all;color:var(--teal);">${fullUrl}</code>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="copyShareUrl('${fullUrl}')" style="margin-top:8px;width:100%;">Copy Link</button>
      </div>`;
    // Show comments section
    document.getElementById('share-comments-section').style.display = '';
    loadShareComments(token);
  } catch (err) { showToast(err.message, true); }
}

function copyShareUrl(url) {
  navigator.clipboard.writeText(url).then(
    () => showToast('Link copied!'),
    () => showToast('Copy failed — select the URL manually', true)
  );
}

async function loadShareComments(token) {
  try {
    const comments = await api.getComments(token);
    renderComments(comments);
  } catch {}
}

function renderComments(comments) {
  const el = document.getElementById('share-comments-list');
  if (!el) return;
  if (!comments.length) {
    el.innerHTML = `<p style="color:var(--muted2);font-size:12px;">No comments yet.</p>`;
    return;
  }
  el.innerHTML = comments.map(c =>
    `<div class="comment-item">
      <span class="comment-avatar">${c.avatar}</span>
      <div class="comment-body">
        <div class="comment-author">${c.username}</div>
        <div class="comment-text">${escapeHtml(c.body)}</div>
      </div>
    </div>`
  ).join('');
}

async function postShareComment() {
  if (!_currentShareToken) return;
  const input = document.getElementById('share-comment-input');
  const body  = input.value.trim();
  if (!body) return;
  try {
    await api.postComment(_currentShareToken, body);
    input.value = '';
    loadShareComments(_currentShareToken);
  } catch (err) { showToast(err.message, true); }
}

// Public view — rendered when ?share=<token> is in URL
async function renderPublicView(token) {
  document.body.innerHTML = `
    <div class="container" style="padding-top:40px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">📈</div>
      <p style="color:var(--muted2);">Loading scenario…</p>
    </div>`;

  try {
    const scenario = await api.getPublicScenario(token);
    const comments = await api.getComments(token);
    const result   = calculatePath(scenario);
    const ages     = getAges(scenario.start_age || 25);
    const finalWl  = result.path[result.path.length - 1];
    const color    = scenario.color || '#00d4aa';

    document.body.innerHTML = `
      <div class="container" style="padding-top:30px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <span style="font-size:22px;">${scenario.owner?.avatar || '🦊'}</span>
          <div>
            <div style="font-weight:600;">${scenario.owner?.username || 'Anonymous'}</div>
            <div class="micro">shared a scenario</div>
          </div>
        </div>

        <div class="card fade-up">
          <div class="path-pill" style="background:${color}15;color:${color};margin-bottom:10px;">● ${scenario.name}</div>
          <div class="stats-row" style="grid-template-columns:1fr 1fr;">
            <div class="stat-box">
              <div class="stat-val" style="color:${color}">${fmtM(finalWl)}</div>
              <div class="stat-sub">Projected at ${(scenario.start_age || 25) + 45}</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${scenario.retire_age}</div>
              <div class="stat-sub">Retirement age</div>
            </div>
          </div>
          <canvas id="projChart" height="220" style="margin-top:14px;"></canvas>
        </div>

        <div class="card fade-up">
          <h3>Comments</h3>
          <div id="share-comments-list"></div>
          ${api.getToken() ? `
          <div class="field" style="margin-top:10px;">
            <input type="text" id="share-comment-input" placeholder="Leave a comment…" maxlength="500"/>
            <button class="btn btn-ghost btn-sm" onclick="postPublicComment('${token}')" style="margin-top:6px;">Post</button>
          </div>` : `<p style="font-size:12px;color:var(--muted2);margin-top:10px;"><a href="/" style="color:var(--teal);">Sign in</a> to comment.</p>`}
        </div>

        <div class="disclaimer">
          ⚠️ Educational use only. Not financial advice.
        </div>
      </div>`;

    // Draw chart
    const chart = new Chart(document.getElementById('projChart').getContext('2d'), {
      type: 'line',
      data: { labels: ages, datasets: [{
        data: result.path, borderColor: color, backgroundColor: color + '10',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.5,
      }]},
      options: {
        responsive: true,
        scales: {
          y: { grid:{ color:'#1a1e32' }, ticks:{ color:'#4a5370', callback: v => v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+v }},
          x: { grid:{ display:false }, ticks:{ color:'#4a5370', maxTicksLimit:8 }},
        },
        plugins: { legend:{ display:false } },
      },
    });

    renderComments(comments);
  } catch (err) {
    document.body.innerHTML = `<div class="container" style="text-align:center;padding-top:60px;">
      <div style="font-size:40px;margin-bottom:12px;">🔗</div>
      <h2>Share link not found</h2>
      <p style="color:var(--muted2);margin-top:8px;">This link may have been revoked or expired.</p>
      <a href="/" class="btn btn-ghost" style="display:inline-block;margin-top:20px;">Go Home</a>
    </div>`;
  }
}

async function postPublicComment(token) {
  const input = document.getElementById('share-comment-input');
  const body  = input.value.trim();
  if (!body) return;
  try {
    await api.postComment(token, body);
    input.value = '';
    const comments = await api.getComments(token);
    renderComments(comments);
  } catch (err) { showToast(err.message, true); }
}

function _drawRecordingChart(rc, stats, x, y, w, h, progress) {
  // path starts with startAge null values — strip them so we only plot real data
  const startIdx = stats.reduce((best, st) => {
    const idx = st.path.findIndex(v => v !== null);
    return idx >= 0 ? Math.min(best, idx) : best;
  }, Infinity);
  if (!isFinite(startIdx)) return;

  const validPaths = stats.map(st => st.path.slice(startIdx).map(v => v ?? 0));
  const nPts = validPaths[0]?.length ?? 0;
  if (nPts < 2) return;

  let maxVal = 1;
  for (const path of validPaths)
    for (const v of path) if (v > maxVal) maxVal = v;

  // Subtle grid lines
  rc.save();
  rc.strokeStyle = 'rgba(255,255,255,0.07)';
  rc.lineWidth = 1;
  for (let g = 1; g <= 4; g++) {
    const gy = y + h - (g / 4) * h;
    rc.beginPath(); rc.moveTo(x, gy); rc.lineTo(x + w, gy); rc.stroke();
  }
  rc.restore();

  validPaths.forEach((path, si) => {
    const color = stats[si].color;
    const shown = Math.max(2, Math.ceil(nPts * progress));

    const px = (i) => x + (i / (nPts - 1)) * w;
    const py = (i) => y + h - Math.max(0, path[i] / maxVal) * h;

    // Fill under line
    rc.beginPath();
    rc.moveTo(px(0), y + h);
    for (let i = 0; i < shown; i++) rc.lineTo(px(i), py(i));
    rc.lineTo(px(shown - 1), y + h);
    rc.closePath();
    rc.fillStyle = color + '20';
    rc.fill();

    // Line
    rc.beginPath();
    for (let i = 0; i < shown; i++) {
      if (i === 0) rc.moveTo(px(i), py(i));
      else rc.lineTo(px(i), py(i));
    }
    rc.strokeStyle = color;
    rc.lineWidth   = 3.5;
    rc.lineJoin    = 'round';
    rc.lineCap     = 'round';
    rc.shadowColor = color;
    rc.shadowBlur  = 10;
    rc.stroke();
    rc.shadowBlur  = 0;
  });
}

async function exportTikTok() {
  const scenario = State.getScenario();
  if (!scenario) return;

  const btn = document.getElementById('tiktok-btn');

  const scenarios = getToRender();
  if (!scenarios.length) return;

  const scenarioStats = scenarios.map(s => {
    const result = calculatePath(s);
    const rows   = result.rows || [];
    const last   = rows[rows.length - 1] || {};
    return {
      name:     s.name,
      color:    s.color || '#00d4aa',
      netWorth: last.balance || 0,
      path:     result.path || rows.map(r => r.balance),
    };
  });

  const RW = 720, RH = 1280;
  const recCanvas = document.createElement('canvas');
  recCanvas.width  = RW;
  recCanvas.height = RH;
  recCanvas.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
  document.body.appendChild(recCanvas);
  const rc = recCanvas.getContext('2d');

  const CHART_ANIM_MS = typeof _animDuration !== 'undefined' ? _animDuration : 9_000;
  const DURATION      = CHART_ANIM_MS + 4_000;
  const filename      = `lifesim-${(scenario.name || 'projection').replace(/\s+/g, '-').toLowerCase()}`;

  if (btn) { btn.textContent = '⏺ Recording… 0%'; btn.disabled = true; }

  function _drawContents(elapsed) {
    rc.fillStyle = '#07080f';
    rc.fillRect(0, 0, RW, RH);

    rc.textAlign = 'center';
    rc.fillStyle = scenarioStats[0].color;
    rc.font = 'bold 38px sans-serif';
    rc.fillText('My Wealth Projection', RW / 2, 100);
    rc.fillStyle = '#7a83a8';
    rc.font = '24px sans-serif';
    rc.fillText(
      scenarios.length > 1 ? `${scenarios.length} Scenarios Compared` : scenario.name,
      RW / 2, 144
    );

    const pad    = 24;
    const titleH = 170;
    const rowH   = scenarios.length > 1 ? 118 : 140;
    const statsH = scenarios.length * rowH + 72;
    const availH = RH - titleH - statsH;
    const progress = Math.min(1, elapsed / CHART_ANIM_MS);

    const chartW = RW - pad * 2;
    const chartH = Math.min(availH - 16, Math.round(chartW * 0.6));
    const chartY = titleH + Math.round((availH - chartH) / 2);
    _drawRecordingChart(rc, scenarioStats, pad, chartY, chartW, chartH, progress);

    const panelTop = RH - statsH;
    rc.fillStyle = 'rgba(255,255,255,0.04)';
    rc.fillRect(0, panelTop, RW, statsH - 72);

    const nwFontSz   = scenarios.length > 1 ? 58 : 72;
    const nameFontSz = scenarios.length > 1 ? 22 : 26;

    scenarioStats.forEach((st, i) => {
      const rowTop = panelTop + i * rowH + 18;
      const live   = Math.round(st.netWorth * progress);
      const clr    = st.netWorth < 0 ? '#ff6b6b' : st.color;

      rc.strokeStyle = clr;
      rc.lineWidth   = 6;
      rc.lineCap     = 'round';
      rc.beginPath();
      rc.moveTo(pad, rowTop + 22);
      rc.lineTo(pad + 52, rowTop + 22);
      rc.stroke();

      rc.textAlign = 'left';
      rc.fillStyle = clr;
      rc.font      = `bold ${nwFontSz}px monospace`;
      rc.fillText(fmtM(live), pad + 68, rowTop + nwFontSz * 0.72);

      rc.fillStyle = '#9aa3c2';
      rc.font      = `${nameFontSz}px sans-serif`;
      rc.fillText(st.name, pad + 68, rowTop + nwFontSz * 0.72 + nameFontSz + 6);
    });

    rc.textAlign = 'center';
    rc.fillStyle = scenarioStats[0].color;
    rc.font = 'bold 20px sans-serif';
    rc.fillText('lifesimfinance.com', RW / 2, RH - 22);
  }

  async function _finishExport(blob, ext) {
    recCanvas.remove();
    if (blob.size < 1000) {
      if (btn) { btn.textContent = '🎬 Record Clip'; btn.disabled = false; }
      showToast('Recording was empty — try again', true);
      return;
    }

    const token = api.getToken();
    if (token) {
      if (btn) btn.textContent = '⬆ Uploading clip…';
      try {
        const res = await fetch('/api/clips', {
          method: 'POST',
          headers: { 'Content-Type': blob.type, 'Authorization': `Bearer ${token}` },
          body: blob,
        });
        if (res.ok) {
          const { url } = await res.json();
          if (btn) { btn.textContent = '🎬 Record Clip'; btn.disabled = false; }
          _showClipModal(url);
          return;
        }
      } catch {}
    }

    if (btn) { btn.textContent = '🎬 Record Clip'; btn.disabled = false; }
    _showVideoPlayer(blob, filename + ext);
  }

  // Pick best available recording method.
  // MediaRecorder is tried first — it's reliable on all desktop browsers and iOS 14.3+.
  // WebCodecs (MP4) is used only when MediaRecorder has no supported codec.
  const _mrMime =
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')            ? 'video/mp4'           :
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm')            ? 'video/webm'          :
    null;

  if (_mrMime) {
    _runMediaRecorder();
  } else if (typeof VideoEncoder !== 'undefined' && typeof Mp4Muxer !== 'undefined') {
    _runWebCodecs();
  } else {
    recCanvas.remove();
    if (btn) { btn.textContent = '🎬 Record Clip'; btn.disabled = false; }
    showToast("Video export isn't supported on this browser.", true);
  }

  function _runMediaRecorder() {
    const mimeType = _mrMime;
    const ext      = mimeType.startsWith('video/mp4') ? '.mp4' : '.webm';
    const stream   = recCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks   = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => _finishExport(new Blob(chunks, { type: mimeType }), ext);
    recorder.start(200);

    const recStart = Date.now();
    function drawFrameWebM() {
      const elapsed = Date.now() - recStart;
      if (elapsed > DURATION) { recorder.stop(); return; }
      if (btn) btn.textContent = `⏺ Recording… ${Math.min(100, Math.round((elapsed / DURATION) * 100))}%`;
      _drawContents(elapsed);
      requestAnimationFrame(drawFrameWebM);
    }
    requestAnimationFrame(drawFrameWebM);
  }

  function _runWebCodecs() {
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer  = new Mp4Muxer.Muxer({ target, video: { codec: 'avc', width: RW, height: RH }, fastStart: 'in-memory' });
    let failed = false;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error:  e => { console.error('VideoEncoder:', e); failed = true; },
    });
    encoder.configure({ codec: 'avc1.4d001f', width: RW, height: RH, bitrate: 6_000_000, framerate: 30 });

    const recStart = Date.now();
    function drawFrame() {
      const elapsed = Date.now() - recStart;
      if (failed) {
        recCanvas.remove();
        if (btn) { btn.textContent = '🎬 Record Clip'; btn.disabled = false; }
        showToast('Recording failed — try again', true);
        return;
      }
      if (elapsed > DURATION) {
        encoder.flush()
          .then(() => { muxer.finalize(); _finishExport(new Blob([target.buffer], { type: 'video/mp4' }), '.mp4'); })
          .catch(() => {
            recCanvas.remove();
            if (btn) { btn.textContent = '🎬 Record Clip'; btn.disabled = false; }
            showToast('Recording failed — try again', true);
          });
        return;
      }
      if (btn) btn.textContent = `⏺ Recording… ${Math.min(100, Math.round((elapsed / DURATION) * 100))}%`;
      _drawContents(elapsed);
      try {
        const vf = new VideoFrame(recCanvas, { timestamp: Math.round(elapsed * 1000) });
        encoder.encode(vf, { keyFrame: elapsed % 2000 < 34 });
        vf.close();
      } catch { failed = true; }
      requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
  }
}

function _blobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _showVideoPlayer(blob, fname) {
  const blobUrl  = URL.createObjectURL(blob);
  const mobile   = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const container = document.getElementById('clip-preview');

  const video = document.createElement('video');
  video.src         = blobUrl;
  video.controls    = true;
  video.playsInline = true;
  video.autoplay    = true;
  video.style.cssText = 'width:100%;border-radius:10px;background:#000;margin-top:14px;display:block;';

  const hint = document.createElement('p');
  hint.style.cssText = 'color:var(--muted2,#7a83a8);font-size:11px;margin:8px 0 0;line-height:1.6;';
  hint.textContent = mobile
    ? 'Hold the video → "Save to Photos"'
    : 'Right-click → "Save video as…" or use the download button.';

  if (container) {
    container.innerHTML = '';
    if (!mobile) {
      const dlBtn = document.createElement('a');
      dlBtn.href          = blobUrl;
      dlBtn.download      = fname;
      dlBtn.className     = 'btn btn-primary btn-sm';
      dlBtn.style.cssText = 'text-decoration:none;margin-top:10px;display:inline-block;';
      dlBtn.textContent   = 'Download';
      container.append(video, hint, dlBtn);
    } else {
      container.append(video, hint);
    }
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    // fallback: floating overlay if share tab isn't visible
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:14px;';
    video.style.cssText = 'max-width:300px;max-height:55vh;border-radius:12px;background:#000;';
    const closeBtn = document.createElement('button');
    closeBtn.className   = 'btn btn-ghost';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => { overlay.remove(); URL.revokeObjectURL(blobUrl); };
    overlay.append(video, hint, closeBtn);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); URL.revokeObjectURL(blobUrl); }
    });
  }
}

function _showClipModal(url) {
  const mobile  = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--card,#12152a);border-radius:16px;padding:28px;max-width:360px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.6);';
  card.innerHTML = `
    <div style="font-size:36px;margin-bottom:12px;">🎬</div>
    <h3 style="margin:0 0 8px;font-size:18px;">Your clip is ready!</h3>
    <p style="font-size:12px;color:var(--muted2,#7a83a8);margin:0 0 16px;">Link expires in 24 hours</p>
    <div id="_clip-url-display" style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px 12px;word-break:break-all;font-size:11px;color:var(--teal,#00d4aa);text-align:left;margin-bottom:16px;"></div>
    <div id="_clip-btns" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"></div>
    ${mobile ? '<p style="font-size:11px;color:var(--muted2,#7a83a8);margin:14px 0 0;">Tap "Save Video" → hold the video → "Save to Photos"</p>' : ''}`;

  card.querySelector('#_clip-url-display').textContent = url;

  const btns = card.querySelector('#_clip-btns');

  if (mobile) {
    const saveBtn = document.createElement('a');
    saveBtn.href = url;
    saveBtn.target = '_blank';
    saveBtn.rel = 'noopener';
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.textDecoration = 'none';
    saveBtn.textContent = 'Save Video';
    btns.appendChild(saveBtn);
  } else {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary';
    copyBtn.textContent = 'Copy Link';
    copyBtn.onclick = () =>
      navigator.clipboard.writeText(url)
        .then(() => showToast('Link copied!'), () => showToast('Copy failed', true));
    btns.appendChild(copyBtn);

    const openBtn = document.createElement('a');
    openBtn.href = url;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.className = 'btn btn-ghost';
    openBtn.style.textDecoration = 'none';
    openBtn.textContent = 'Open';
    btns.appendChild(openBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-ghost';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => overlay.remove();
  btns.appendChild(closeBtn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Funny life recap generator ─────────────────────────────────────────────
function generateRecap(scenario) {
  const v = (arr) => arr[scenario.id % arr.length];

  const _careers = (scenario.careers || []).slice().sort((a, b) => a.start_age - b.start_age);
  const effectiveJobId = _careers.length > 0 ? _careers[0].job_id : scenario.job_id;
  const job     = JOBS.find(j => j.id === effectiveJobId) || JOBS[0];
  const jobName = effectiveJobId === 'custom' ? 'your mystery career' : job.name;
  const s0      = scenario.custom_s0 != null ? scenario.custom_s0 : job.s0;
  const result  = calculatePath(scenario);
  const finalWl = result.path[result.path.length - 1];
  const debts   = scenario.debts  || [];
  const events  = scenario.events || [];
  const totalDebt = debts.reduce((s, d) => s + (d.balance || 0), 0);
  const retireAge = scenario.retire_age;

  const lines = [];

  // ── 1. Career opener ──
  const careerLines = {
    sw_eng:      v(["You chose software engineering. Good call — your future is just debugging things until you die, but at least you'll be paid well.", "A software engineer. Rich, perpetually indoors, and your idea of 'touching grass' is a Slack status update."]),
    nurse:       v(["You picked nursing. The pay is solid, the hours are brutal, and you will hear things that cannot be unheard.", "A nurse. Genuinely one of the most important jobs on earth. Also one of the most exhausting. Respect."]),
    electrician: v(["You went into electrical work. Everyone needs you, nobody appreciates you until the lights go out.", "An electrician — a noble trade. You'll never be unemployed, and your jokes about ohms resistance will land with exactly zero people."]),
    acc:         v(["You chose accounting. Tax season will haunt your dreams, but at least you'll have a stable income to afford therapy.", "An accountant. The world runs on numbers, and so do you. You've probably already optimized this sentence for tax purposes."]),
    teacher:     v(["You went into teaching. Bold. Brave. Possibly delusional about the pay. But someone has to do it.", "A teacher. You'll shape young minds and spend your own money on classroom supplies. A true hero with a very modest investment portfolio."]),
    doctor:      v(["You became a physician. Years of training, mountains of debt, and now you're the person at parties everyone asks for free medical advice.", "A doctor. You'll earn serious money — eventually — after med school, residency, and roughly one million hours of lost sleep."]),
    plumber:     v(["A plumber. When things go wrong in people's homes, you're the one they call in a panic. Power move.", "You chose plumbing. Recession-proof, in-demand, and you'll see things in people's pipes that money cannot unsee."]),
    designer:    v(["You went into design. You'll spend your career making things beautiful while clients ask you to 'make the logo bigger.'", "A UX designer. You care deeply about user experience, and yet somehow you're still using a 47-step morning routine app."]),
    lawyer:      v(["You chose law. Long hours, billable by the minute, and a wardrobe that means business. Welcome to the grind.", "A lawyer. You'll argue for a living, which means you've basically been training your whole life."]),
    custom:      v(["You're charting your own path with a custom salary. Mysterious. Intriguing. We respect the hustle.", "A custom career? Nobody puts you in a box. Except maybe your accountant."]),
  };
  lines.push(careerLines[effectiveJobId] || `You chose ${jobName}. Interesting career choice. We support it.`);

  // ── 2. Debt / events line ──
  const mortgage = debts.find(d => d.type === 'mortgage');
  const studentLoan = debts.find(d => d.type === 'student_loan');
  const carLoan  = debts.find(d => d.type === 'auto');
  const houseEvent = events.find(e => e.event_type === 'house_purchase');
  const kidsEvent  = events.find(e => e.event_type === 'children');
  const marriageEvent = events.find(e => e.event_type === 'marriage');

  if (debts.length >= 3) {
    lines.push(`You're juggling ${debts.length} separate debts totalling ${fmtM(totalDebt)}. You absolute chaos agent. The banks love you.`);
  } else if (mortgage) {
    lines.push(v([
      `You've got a mortgage of ${fmtM(mortgage.balance)}. Congratulations on your 30-year relationship with a bank. It's basically a marriage.`,
      `That ${fmtM(mortgage.balance)} mortgage means you now own a home — or more accurately, a bank owns it and lets you sleep there.`,
    ]));
  } else if (studentLoan) {
    lines.push(v([
      `${fmtM(studentLoan.balance)} in student loans. Somewhere, a university admin is buying a boat with your tuition.`,
      `You've got ${fmtM(studentLoan.balance)} in student debt. The degree was worth it. Probably. We hope.`,
    ]));
  } else if (carLoan) {
    lines.push(`There's a ${fmtM(carLoan.balance)} auto loan in the mix. Nothing says adulting like paying interest on something that loses value while you sleep.`);
  } else if (houseEvent) {
    lines.push(`You're planning to buy a house at ${houseEvent.at_age}. Smart. Terrifying. The same thing, really.`);
  } else if (kidsEvent && marriageEvent) {
    lines.push(`Marriage AND kids in the timeline? Bold. Beautiful. Your bank account will never be the same.`);
  } else if (kidsEvent) {
    lines.push(`Kids are in the plan. Expensive, loud, and will one day argue with you at the dinner table about your investment choices.`);
  } else if (marriageEvent) {
    lines.push(`Marriage is on the horizon. Love is beautiful. The joint tax filing is… also fine.`);
  } else if (events.length > 0) {
    lines.push(`You've got ${events.length} life event${events.length > 1 ? 's' : ''} planned. Life is happening whether your spreadsheet is ready or not.`);
  }

  // ── 4. Retirement line ──
  if (retireAge <= 45) {
    lines.push(v([
      `You're planning to retire at ${retireAge}. Either you've cracked the code or you're wildly optimistic. Either way, we're rooting for you.`,
      `Retirement at ${retireAge}? That's the kind of confidence that comes from either a trust fund or a very aggressive savings rate. Respect.`,
    ]));
  } else if (retireAge <= 55) {
    lines.push(v([
      `Retiring at ${retireAge} — solidly in FIRE territory. You've done the math and the math said "get out early." Wise.`,
      `Age ${retireAge} for retirement. You're not waiting until you're too tired to enjoy it. Smart human.`,
    ]));
  } else if (retireAge <= 65) {
    lines.push(v([
      `You're targeting retirement at ${retireAge}. A classic, sensible, socially acceptable retirement age. Very adult of you.`,
      `Retiring at ${retireAge}. Right on schedule. Your financial advisor is nodding approvingly somewhere.`,
    ]));
  } else {
    lines.push(v([
      `Retirement at ${retireAge}. You plan to work well into your golden years. Either you love what you do, or the math didn't work out. Hopefully the former.`,
      `Age ${retireAge} to retire. Most people your projected age will be golfing. You'll still be in meetings. We admire the dedication.`,
    ]));
  }

  // ── 5. Wealth closer ──
  if (finalWl >= 5_000_000) {
    lines.push(v([
      `Projected final wealth: ${fmtM(finalWl)}. Generational. Your grandchildren will argue about the will before you're even gone.`,
      `${fmtM(finalWl)} at the end of this path. You're not just set — you're set, laminated, and framed on a wall.`,
    ]));
  } else if (finalWl >= 2_000_000) {
    lines.push(v([
      `Ending up with ${fmtM(finalWl)}. Solidly wealthy. You will never have to pretend to enjoy camping to save money.`,
      `${fmtM(finalWl)} projected. Comfortable, secure, and smug in the best possible way.`,
    ]));
  } else if (finalWl >= 500_000) {
    lines.push(v([
      `${fmtM(finalWl)} projected. Not quite "yacht money," but definitely "nice vacation without checking the price" money.`,
      `You're looking at ${fmtM(finalWl)} at the end of the road. Respectable. Solid. The dream, honestly.`,
    ]));
  } else if (finalWl >= 0) {
    lines.push(v([
      `Projected final wealth: ${fmtM(finalWl)}. Not the number that launches a dynasty, but it's something. Progress is progress.`,
      `You'll end with ${fmtM(finalWl)}. It's a journey, not just a destination. Although the destination could be bigger. Just saying.`,
    ]));
  } else {
    lines.push(`The projection shows negative wealth at the end. This is fine. Everything is fine. Have you considered adjusting the savings rate?`);
  }

  return lines.map(l => `<p style="font-size:13px;line-height:1.7;margin:0 0 10px;color:var(--text);">${l}</p>`).join('');
}
