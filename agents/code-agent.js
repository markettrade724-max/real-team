import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_IAPS = [
  { id:'no-ads',      type:'remove_ads', price:1.99, emoji:'🚫', name:{ar:'إزالة الإعلانات',en:'Remove Ads',fr:'Sans pub',es:'Sin anuncios',de:'Werbefrei',zh:'去广告'} },
  { id:'hint-pack',   type:'consumable', price:0.99, emoji:'💡', name:{ar:'10 تلميحات',en:'10 Hints',fr:'10 indices',es:'10 pistas',de:'10 Hinweise',zh:'10个提示'} },
  { id:'theme-pack',  type:'cosmetic',   price:1.49, emoji:'🎨', name:{ar:'حزمة الثيمات',en:'Themes Pack',fr:'Pack thèmes',es:'Pack temas',de:'Theme-Paket',zh:'主题包'} },
  { id:'full-unlock', type:'unlock',     price:2.99, emoji:'⭐', name:{ar:'فتح كل المحتوى',en:'Unlock All',fr:'Tout débloquer',es:'Desbloquear todo',de:'Alles freischalten',zh:'解锁全部'} },
];

export async function run(idea, story, levels, art) {
  const path     = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(path, 'utf8'));

  if (products.find(p => p.id === idea.id)) {
    logger.info('Product already exists — skipped', { id: idea.id });
    return { skipped: true, id: idea.id };
  }

  const product = {
    id: idea.id, slug: idea.id, type: idea.type, category: idea.category,
    status: 'available', emoji: idea.emoji,
    accent: art?.accent || '#facc15', accentRgb: art?.accentRgb || '250,204,21',
    gradient: art?.gradient || '135deg,#0f172a,#1e293b',
    emojis: levels?.emojis || art?.emojis || [],
    name: idea.name, desc: idea.desc, tags: idea.tags || [],
    iap: DEFAULT_IAPS,
    story: story ? {
      setting: story.setting, mainCharacter: story.mainCharacter,
      objective: story.objective, intro: story.intro,
      winMessage: story.winMessage, loseMessage: story.loseMessage,
    } : null,
    levels: levels?.levels || null,
    generated: true, generatedAt: new Date().toISOString(),
  };

  products.push(product);
  writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
  logger.info('Product added', { id: idea.id });

  try {
    execSync(`node ${join(__dirname, '..', 'game-generator.js')} ${idea.id}`, {
      cwd: join(__dirname, '..'), stdio: 'inherit'
    });
    logger.info('Game file built', { file: `public/games/${idea.id}.html` });
  } catch (err) {
    logger.warn('game-generator failed', { error: err.message });
  }

  return { success: true, id: idea.id };
}
