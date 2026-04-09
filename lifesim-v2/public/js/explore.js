/* ══════════════════════════════════════════════
   explore.js — Affiliate partner cards
   Replace AFFILIATE_URL placeholders with real
   affiliate links before going live.
══════════════════════════════════════════════ */

const PARTNERS = [
  {
    emoji: '🏦',
    name: 'Fidelity',
    category: 'Brokerage',
    description: 'Zero-commission stock & ETF trading. No account minimums. One of the largest brokerages in the US.',
    cta: 'Open Account',
    url: '#', // TODO: replace with affiliate link
  },
  {
    emoji: '⛽',
    name: 'Upside',
    category: 'Gas Savings',
    description: 'Get cash back on every gas fill-up. Works at thousands of stations nationwide.',
    cta: 'Get the App',
    url: '#', // TODO: replace with affiliate link
  },
  {
    emoji: '🛍️',
    name: 'Rakuten',
    category: 'Shopping Savings',
    description: 'Earn cash back at 3,500+ stores including Amazon, Walmart, and more. Free to join.',
    cta: 'Start Saving',
    url: '#', // TODO: replace with affiliate link
  },
  {
    emoji: '₿',
    name: 'Coinbase',
    category: 'Crypto',
    description: 'Buy, sell, and hold cryptocurrency. One of the most trusted exchanges in the world.',
    cta: 'Sign Up',
    url: '#', // TODO: replace with affiliate link
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
