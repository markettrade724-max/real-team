/**
 * generate-ideas.js — يولّد فكرة لعبة جديدة ويضيفها لـ products.json
 * يستخدم fetch مباشرة — لا يحتاج أي packages
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY');
  process.exit(1);
}

const PALETTES = [
  { accent:'#f59e0b', accentRgb:'245,158,11',  gradient:'135deg,#1c1007,#78350f' },
  { accent:'#06b6d4', accentRgb:'6,182,212',   gradient:'135deg,#042830,#164e63' },
  { accent:'#a855f7', accentRgb:'168,85,247',  gradient:'135deg,#1a0533,#581c87' },
  { accent:'#10b981', accentRgb:'16,185,129',  gradient:'135deg,#022c22,#064e3b' },
  { accent:'#ef4444', accentRgb:'239,68,68',   gradient:'135deg,#1f0707,#7f1d1d' },
  { accent:'#3b82f6', accentRgb:'59,130,246',  gradient:'135deg,#030712,#1e3a5f' },
  { accent:'#f97316', accentRgb:'249,115,22',  gradient:'135deg,#1c0a03,#7c2d12' },
  { accent:'#ec4899', accentRgb:'236,72,153',  gradient:'135deg,#1f0318,#831843' },
];

// أنواع تشمل الألعاب الجديدة!
const TYPES = [
  'action','shooter','adventure','rpg','runner','platformer',
  'battle','survival','dungeon','quest',
  'memory','puzzle','word','quiz','trivia','arcade',
  'tool','wellness','productivity',
];

// ── خريطة القوالب (بدون imports) ──────────────────────────────
const TEMPLATE_MAP = {
  memory:'memory-game.html',   puzzle:'memory-game.html',
  word:'memory-game.html',     quiz:'memory-game.html',
  trivia:'memory-game.html',   arcade:'memory-game.html',
  tool:'tool-app.html',        wellness:'tool-app.html',
  productivity:'tool-app.html',
  action:'action-shooter.html',  shooter:'action-shooter.html',
  battle:'action-shooter.html',  survival:'action-shooter.html',
  adventure:'adventure-rpg.html', rpg:'adventure-rpg.html',
  dungeon:'adventure-rpg.html',  quest:'adventure-rpg.html',
  runner:'endless-runner.html',  platformer:'endless-runner.html',
};

const DEFAULT_IAPS = [
  { id:'no-ads',      type:'remove_ads', price:1.99, emoji:'🚫',
    name:{ar:'إزالة الإعلانات',en:'Remove Ads',fr:'Sans pub',es:'Sin anuncios',de:'Werbefrei',zh:'去广告'} },
  { id:'hint-pack',   type:'consumable', price:0.99, emoji:'💡',
    name:{ar:'10 تلميحات',en:'10 Hints',fr:'10 indices',es:'10 pistas',de:'10 Hinweise',zh:'10个提示'} },
  { id:'full-unlock', type:'unlock',     price:2.99, emoji:'⭐',
    name:{ar:'فتح كل المحتوى',en:'Unlock All',fr:'Tout débloquer',es:'Desbloquear todo',de:'Alles freischalten',zh:'解锁全部'} },
];

async function askGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

async function generateIdea(existingIds) {
  const type    = TYPES[Math.floor(Math.random() * TYPES.length)];
  const category = ['tool','wellness','productivity'].includes(type) ? 'app' : 'game';
  const palette  = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const templateFile = TEMPLATE_MAP[type] || 'memory-game.html';

  const prompt = `You are a creative game designer. Create a ${category} idea of type "${type}".
Do NOT use these existing slugs: ${existingIds.slice(-15).join(', ')}.

Return ONLY valid JSON:
{
  "slug": "unique-english-slug-kebab-case",
  "emoji": "one perfect emoji",
  "name": { "ar": "اسم عربي", "en": "English Name", "fr": "Nom français", "es": "Nombre español", "de": "Deutscher Name", "zh": "中文名称" },
  "desc": { "ar": "وصف قصير", "en": "Short description", "fr": "Description courte", "es": "Descripción corta", "de": "Kurze Beschreibung", "zh": "简短描述" },
  "emojis": ["emoji1","emoji2","emoji3","emoji4","emoji5","emoji6","emoji7","emoji8"]
}

For type "${type}", choose fitting emojis as game elements or collectibles.`;

  const raw = await askGemini(prompt);
  const clean = raw.replace(/```json|```/g, '').trim();
  const idea = JSON.parse(clean);

  if (!idea.slug || !idea.name?.en) throw new Error('Missing required fields');
  if (existingIds.includes(idea.slug)) idea.slug = `${idea.slug}-${Date.now().toString(36)}`;

  return {
    id:           idea.slug,
    slug:         idea.slug,
    type,
    category,
    status:       'available',
    emoji:        idea.emoji || '🎮',
    accent:       palette.accent,
    accentRgb:    palette.accentRgb,
    gradient:     palette.gradient,
    templateFile,
    emojis:       idea.emojis || [],
    levels:       null,
    name:         idea.name,
    desc:         idea.desc,
    iap:          DEFAULT_IAPS,
    generated:    true,
    generatedAt:  new Date().toISOString(),
  };
}

async function main() {
  try {
    const path     = join(__dirname, '..', 'products.json');
    const products = JSON.parse(readFileSync(path, 'utf8'));
    const ids      = products.map(p => p.id);

    console.log(`📦 Existing: ${ids.length} products`);
    console.log('🤖 Generating new idea...');

    const idea = await generateIdea(ids);
    products.push(idea);
    writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');

    console.log(`✅ Added: ${idea.slug} [${idea.type}] → ${idea.templateFile}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
