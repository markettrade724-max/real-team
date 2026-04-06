/**
 * post-reddit.js
 * ينشر في subreddits مختارة عن الألعاب المستقلة
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USERNAME,
  REDDIT_PASSWORD,
  SITE_URL = 'https://real-team-production.up.railway.app'
} = process.env;

const missing = ['REDDIT_CLIENT_ID','REDDIT_CLIENT_SECRET','REDDIT_USERNAME','REDDIT_PASSWORD']
  .filter(k => !process.env[k]);
if (missing.length) { console.error('❌ Missing:', missing.join(', ')); process.exit(1); }

// ── الـ subreddits المستهدفة ───────────────────────────────────
const SUBREDDITS = [
  'indiegaming',
  'WebGames',
  'FreeGamesOnSteam',
  'playmygame',
  'indiegames',
];

// ── الحصول على Access Token ───────────────────────────────────
async function getToken() {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'realteam-bot/1.0'
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Reddit auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// ── نشر منشور ────────────────────────────────────────────────
async function postToReddit(token, subreddit, title, text) {
  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'realteam-bot/1.0'
    },
    body: new URLSearchParams({
      sr: subreddit,
      kind: 'self',
      title,
      text,
      nsfw: 'false',
      spoiler: 'false',
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Reddit post error: ${data.error}`);
  return data;
}

// ── بناء المنشور ──────────────────────────────────────────────
function buildPost(game) {
  const name = game.name?.en || game.id;
  const desc = game.desc?.en || '';
  const url  = `${SITE_URL}/games/${game.slug}.html`;
  const iapCount = game.iap?.length || 0;

  const title = `${game.emoji} ${name} — Free indie ${game.type} game`;

  const text = `
Hey r/indiegaming! 👋

I just released **${name}**, a free ${game.type} game you can play right in your browser.

**About the game:**
${desc}

**Why free?**
We believe games should be accessible to everyone. The game is 100% free — we offer ${iapCount} optional extras (themes, hints, ad removal) for those who want to support us.

**Play now:** ${url}

Would love to hear your feedback! What do you think?

---
*Built with HTML5 — works on mobile and desktop*
`.trim();

  return { title, text };
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const products = JSON.parse(
    readFileSync(join(__dirname, '..', 'products.json'), 'utf8')
  );

  const available = products.filter(p => p.status === 'available');
  if (!available.length) { console.log('⚠️ No products'); return; }

  const game      = available[Math.floor(Math.random() * available.length)];
  const { title, text } = buildPost(game);
  const subreddit = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];

  console.log(`📤 Posting to r/${subreddit}:`);
  console.log('Title:', title);

  try {
    const token = await getToken();
    await postToReddit(token, subreddit, title, text);
    console.log(`✅ Posted to r/${subreddit}`);
  } catch (err) {
    console.error('❌ Reddit post failed:', err.message);
    process.exit(1);
  }
}

main();
