/**
 * generate-levels.js
 * Gemini يولّد مستويات جديدة للألعاب الموجودة
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) { console.error('❌ Missing GEMINI_API_KEY'); process.exit(1); }

async function askGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 512 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateEmojisForGame(game) {
  const prompt = `
اقترح 12 إيموجي مناسبة للعبة "${game.name?.en || game.id}" من نوع "${game.type}".
يجب أن تكون الإيموجي متنوعة ومثيرة ومناسبة لموضوع اللعبة.
أجب بـ JSON فقط: ["emoji1","emoji2",...]
`;
  const raw = await askGemini(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  const emojis = JSON.parse(match[0]);
  return emojis.slice(0, 12);
}

async function main() {
  const path     = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(path, 'utf8'));

  // اختر لعبة عشوائية من نوع memory أو puzzle
  const games = products.filter(p => ['memory','puzzle'].includes(p.type) && p.status === 'available');
  if (!games.length) { console.log('⚠️ No games to update'); return; }

  const game = games[Math.floor(Math.random() * games.length)];
  console.log(`🎮 Generating levels for: ${game.id}`);

  try {
    const emojis = await generateEmojisForGame(game);
    if (!emojis) throw new Error('No emojis generated');

    // أضف الإيموجي للمنتج
    const idx = products.findIndex(p => p.id === game.id);
    products[idx].emojis = emojis;
    products[idx].updatedAt = new Date().toISOString();

    writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
    console.log(`✅ Updated emojis for ${game.id}:`, emojis.join(' '));
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
