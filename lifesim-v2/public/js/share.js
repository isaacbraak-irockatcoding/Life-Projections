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
        <button class="btn btn-ghost btn-sm" id="tiktok-btn" onclick="exportTikTok()">🎬 Export TikTok Video</button>
      </div>
      <p class="micro" style="text-transform:none;letter-spacing:0;font-size:11px;color:var(--muted2);margin-top:8px;">Records the animated chart in 9:16 vertical format — ready to post.</p>
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

async function exportTikTok() {
  const scenario = State.getScenario();
  if (!scenario) return;

  const btn = document.getElementById('tiktok-btn');

  // Switch to projections tab so chart is live and animatable
  switchTab('proj');
  await new Promise(r => setTimeout(r, 400));

  const srcCanvas = document.getElementById('projChart');
  if (!srcCanvas) { showToast('Chart not found', true); return; }

  // Gather all active scenarios and pre-compute net worth at retirement for each
  const scenarios = getToRender();
  if (!scenarios.length) return;

  const scenarioStats = scenarios.map(s => {
    const result    = calculatePath(s);
    const rows      = result.rows || [];
    const retireAge = s.retire_age || 65;
    const retireRow = rows.find(r => r.age >= retireAge) || rows[rows.length - 1] || {};
    return {
      name:      s.name,
      color:     s.color || '#00d4aa',
      retireAge,
      netWorth:  retireRow.balance || 0,
    };
  });

  // 9:16 recording canvas — MUST be in the DOM for captureStream to work
  const RW = 720, RH = 1280;
  const recCanvas = document.createElement('canvas');
  recCanvas.width  = RW;
  recCanvas.height = RH;
  recCanvas.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
  document.body.appendChild(recCanvas);
  const rc = recCanvas.getContext('2d');

  // WebM is the only reliably supported format for MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const stream   = recCanvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks   = [];

  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    recCanvas.remove();
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size < 1000) { showToast('Recording was empty — try again', true); return; }
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `lifesim-${(scenario.name || 'projection').replace(/\s+/g, '-').toLowerCase()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    if (btn) { btn.textContent = '🎬 Export TikTok Video'; btn.disabled = false; }
    showToast('Saved! Upload the .webm file directly to TikTok.');
  };

  // Reset + trigger animation
  if (_animateMode) toggleAnimateMode();
  await new Promise(r => setTimeout(r, 100));
  toggleAnimateMode();

  if (btn) { btn.textContent = '⏺ Recording… 13s'; btn.disabled = true; }

  const DURATION      = 13_000;
  const CHART_ANIM_MS = 9_000; // synced to Chart.js totalDuration
  const startTime     = Date.now();

  recorder.start(200);

  function drawFrame() {
    const elapsed = Date.now() - startTime;
    if (elapsed > DURATION) {
      recorder.stop();
      return;
    }

    if (btn) btn.textContent = `⏺ Recording… ${Math.min(100, Math.round((elapsed / DURATION) * 100))}%`;

    rc.fillStyle = '#07080f';
    rc.fillRect(0, 0, RW, RH);

    // Title
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

    // Chart — scaled to full width, centered vertically
    const pad    = 20;
    const chartW = RW - pad * 2;
    const chartH = Math.round(chartW * (srcCanvas.height / srcCanvas.width));
    const chartY = Math.round((RH - chartH) / 2);
    rc.drawImage(srcCanvas, pad, chartY, chartW, chartH);

    // Animated scenario rows below chart
    const progress = Math.min(1, elapsed / CHART_ANIM_MS);
    const statsY   = chartY + chartH + 44;
    const rowH     = scenarios.length > 1 ? 80 : 90;

    scenarioStats.forEach((st, i) => {
      const rowY   = statsY + i * rowH;
      const live   = Math.round(st.netWorth * progress);
      const dotClr = st.netWorth < 0 ? '#ff6b6b' : st.color;
      const numClr = st.netWorth < 0 ? '#ff6b6b' : st.color;

      // Color dot
      rc.fillStyle = dotClr;
      rc.beginPath();
      rc.arc(52, rowY, 14, 0, Math.PI * 2);
      rc.fill();

      // Scenario name
      rc.textAlign = 'left';
      rc.fillStyle = '#dde3f5';
      rc.font = `bold ${scenarios.length > 1 ? 24 : 28}px sans-serif`;
      rc.fillText(st.name, 80, rowY + 2);

      // Retire age label
      rc.fillStyle = '#7a83a8';
      rc.font = '19px sans-serif';
      rc.fillText(`@ age ${st.retireAge}`, 80, rowY + 28);

      // Animated net worth — right-aligned
      rc.textAlign = 'right';
      rc.fillStyle = numClr;
      rc.font = `bold ${scenarios.length > 1 ? 42 : 52}px monospace`;
      rc.fillText(fmtM(live), RW - 36, rowY + 8);
    });

    // Watermark
    rc.textAlign = 'center';
    rc.fillStyle = scenarioStats[0].color;
    rc.font = 'bold 20px sans-serif';
    rc.fillText('lifesimfinance.com', RW / 2, RH - 56);

    requestAnimationFrame(drawFrame);
  }

  requestAnimationFrame(drawFrame);
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
