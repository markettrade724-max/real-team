/**
 * update-products.js
 * يُشغَّل مرة واحدة على GitHub Actions أو يدوياً
 * يحدّث templateFile لكل منتج حسب نوعه
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE_MAP = {
  // ذاكرة وألغاز → memory-game
  memory:'memory-game.html', puzzle:'memory-game.html',
  word:'memory-game.html',   quiz:'memory-game.html',
  matching:'memory-game.html', trivia:'memory-game.html',
  // أكشن → phaser-game (الجديد القوي)
  arcade:'phaser-game.html',   shooter:'phaser-game.html',
  action:'phaser-game.html',   space:'phaser-game.html',
  battle:'phaser-game.html',   defense:'phaser-game.html',
  survival:'phaser-game.html',
  // مغامرات RPG → adventure-rpg
  rpg:'adventure-rpg.html',   adventure:'adventure-rpg.html',
  dungeon:'adventure-rpg.html', quest:'adventure-rpg.html',
  story:'adventure-rpg.html',  narrative:'adventure-rpg.html',
  // أدوات → tool-app
  tool:'tool-app.html', app:'tool-app.html',
  timer:'tool-app.html', tracker:'tool-app.html',
  productivity:'tool-app.html', wellness:'tool-app.html',
  creative:'tool-app.html',
};

function selectTemplate(type, concept='', tags=[]) {
  const t = (type||'').toLowerCase();
  if (TEMPLATE_MAP[t]) return TEMPLATE_MAP[t];
  for(const [k,v] of Object.entries(TEMPLATE_MAP))
    if(t.includes(k)||k.includes(t)) return v;
  const ctx = [concept,...tags].join(' ').toLowerCase();
  if(/shoot|bullet|enemy|wave|fire/.test(ctx)) return 'phaser-game.html';
  if(/adventure|rpg|quest|hero|magic/.test(ctx)) return 'adventure-rpg.html';
  if(/tool|timer|focus|util/.test(ctx)) return 'tool-app.html';
  return 'memory-game.html';
}

const path = join(__dirname, 'products.json');
const products = JSON.parse(readFileSync(path,'utf8'));
let updated = 0;

products.forEach(p => {
  const tpl = selectTemplate(p.type, p.concept||'', p.tags||[]);
  if(p.templateFile !== tpl) {
    console.log(`${p.id}: ${p.templateFile||'none'} → ${tpl}`);
    p.templateFile = tpl;
    updated++;
  }
});

// ترتيب: الجديد أولاً
products.sort((a,b) => {
  const da = new Date(a.generatedAt||'2020-01-01');
  const db = new Date(b.generatedAt||'2020-01-01');
  return db - da;
});

writeFileSync(path, JSON.stringify(products,null,2),'utf8');
console.log(`\n✅ Updated ${updated} products`);
console.log(`📦 Total: ${products.length}`);
console.log(`🔝 First: ${products[0]?.name?.en}`);
