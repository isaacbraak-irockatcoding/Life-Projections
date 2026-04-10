/* ══════════════════════════════════════════════
   explore.js — Affiliate partner cards
   Replace AFFILIATE_URL placeholders with real
   affiliate links before going live.
══════════════════════════════════════════════ */

const PARTNERS = [
  {
    emoji: '🏦',
    name: 'SoFi',
    category: 'Banking & Investing',
    description: 'Use my referral link to sign up for SoFi — deposit $50 and get $25 in free money. No account fees, high-yield savings, and investing all in one app.',
    cta: 'Get $25 Free',
    url: '#', // TODO: add referral link when available
  },
  {
    emoji: '⛽',
    name: 'Upside',
    category: 'Gas Savings',
    description: 'If you use invite code <strong>ISAAC63883</strong>, get 15¢/gal extra cashback on your first gas fill-up, 10% back at restaurants &amp; groceries, and earn 10¢ every time a friend uses the app.',
    cta: 'Get the App',
    url: 'https://upside.app.link/referral/ISAAC63883',
  },
  {
    emoji: '⚡',
    name: 'Strike',
    category: 'Bitcoin',
    description: 'Founded by Jack Mallers, Strike makes buying bitcoin simple and affordable. Use my referral link and get $500 of fee-free trading when you join and buy bitcoin.',
    cta: 'Get $500 Fee Free Trading',
    url: 'https://invite.strike.me/O9D7SA',
  },
];

function renderExploreTab() {
  const el = document.getElementById('explore-content');
  if (!el) return;

  el.innerHTML = `
    <div style="padding-top:8px;">
      <h3 style="margin-bottom:4px;">Explore</h3>
      <p class="micro" style="color:var(--muted2);text-transform:none;letter-spacing:0;font-size:12px;margin-bottom:20px;">
        Tools and platforms used by people working toward the same goals.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${PARTNERS.map(p => `
          <div class="card" style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:32px;line-height:1;">${p.emoji}</span>
              <div>
                <div style="font-weight:700;font-size:15px;">${p.name}</div>
                <div class="micro" style="color:var(--accent);text-transform:uppercase;font-size:10px;letter-spacing:.06em;">${p.category}</div>
              </div>
            </div>
            <p class="micro" style="text-transform:none;letter-spacing:0;color:var(--muted2);font-size:12px;line-height:1.5;margin:0;">
              ${p.description}
            </p>
            <a href="${p.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
              <button class="save-btn" style="width:100%;justify-content:center;">
                ${p.cta} →
              </button>
            </a>
          </div>
        `).join('')}
      </div>

      <p class="micro" style="text-transform:none;letter-spacing:0;color:var(--muted);font-size:11px;text-align:center;margin-top:20px;line-height:1.5;">
        Links above may be affiliate links. We may earn a commission if you sign up.
      </p>
    </div>
  `;
}
