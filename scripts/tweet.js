/**
 * tweet.js
 * ينشر تغريدات يومية عن الألعاب والمشروع
 * يستخدم Twitter API v2
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  SITE_URL = 'https://real-team-production.up.railway.app'
} = process.env;

const missing = ['TWITTER_API_KEY','TWITTER_API_SECRET','TWITTER_ACCESS_TOKEN','TWITTER_ACCESS_SECRET']
  .filter(k => !process.env[k]);
if (missing.length) { console.error('❌ Missing:', missing.join(', ')); process.exit(1); }

// ── OAuth 1.0a ────────────────────────────────────────────────
function sign(method, url, params) {
  const sorted = Object.keys(params).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const base   = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sorted)}`;
  const key    = `${encodeURIComponent(TWITTER_API_SECRET)}&${encodeURIComponent(TWITTER_ACCESS_SECRET)}`;
  return crypto.createHmac('sha1', key).update(base).digest('base64');
}

function oauthHeader(method, url, extra = {}) {
  const params = {
    oauth_consumer_key:     TWITTER_API_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now()/1000).toString(),
    oauth_token:            TWITTER_ACCESS_TOKEN,
    oauth_version:          '1.0',
    ...extra
  };
  params.oauth_signature = sign(method, url, { ...params, ...extra });
  const header = Object.keys(params)
    .filter(k => k.startsWith('oauth_'))
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(', ');
  return `OAuth ${header}`;
}

async function tweet(text) {
  const url = 'https://api.twitter.com/2/tweets';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': oauthHeader('POST', url),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ── قوالب التغريدات ───────────────────────────────────────────
function buildTweet(products, lang = 'en') {
  const available = products.filter(p => p.status === 'available');
  if (!available.length) return null;

  const game = available[Math.floor(Math.random() * available.length)];
  const name = game.name?.[lang] || game.name?.en || game.id;
  const desc = game.desc?.[lang] || game.desc?.en || '';
  const url  = `${SITE_URL}/games/${game.slug}.html`;

  const templates = [
    `🎮 ${name}\n\n${desc}\n\n▶️ Play free: ${url}\n\n#indiegame #free #gaming`,
    `New game alert! 🚀\n\n${game.emoji} ${name}\n${desc}\n\nFree to play 👉 ${url}\n\n#gamedev #indiegame`,
    `${game.emoji} ${name} is waiting for you!\n\n${desc}\n\n🆓 100% Free\n🛒 Optional extras\n\n${url}\n\n#gaming #indiegame`,
    `Why pay for games? 🤔\n\n${game.emoji} ${name} — FREE forever\n\n${desc}\n\n${url}\n\n#freegame #indiedev`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const products = JSON.parse(
    readFileSync(join(__dirname, '..', 'products.json'), 'utf8')
  );

  const text = buildTweet(products, 'en');
  if (!text) { console.log('⚠️ No products to tweet about'); return; }

  console.log('📤 Tweeting:\n', text);

  try {
    const result = await tweet(text);
    console.log('✅ Tweet posted:', result.data?.id);
  } catch (err) {
    console.error('❌ Tweet failed:', err.message);
    process.exit(1);
  }
}

main();
