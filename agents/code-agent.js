/**
 * code-agent.js — مصحح: يستخدم templateFile من template-engineer
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة القوالب الكاملة (fallback إذا لم يوجد templateFile) ──
const TEMPLATE_MAP = {
  // ألعاب ذاكرة وألغاز
  memory:'memory-game.html', puzzle:'memory-game.html',
  word:'memory-game.html',   quiz:'memory-game.html',
  matching:'memory-game.html', trivia:'memory-game.html',
  // أكشن وإطلاق نار
  arcade:'arcade-shooter.html',   shooter:'arcade-shooter.html',
  action:'arcade-shooter.html',   space:'arcade-shooter.html',
  bullet:'arcade-shooter.html',   battle:'arcade-shooter.html',
  defense:'arcade-shooter.html',  survival:'arcade-shooter.html',
  // مغامرات وRPG
  rpg:'adventure-rpg.html',       adventure:'adventure-rpg.html',
  dungeon:'adventure-rpg.html',   quest:'adventure-rpg.html',
  story:'adventure-rpg.html',     narrative:'adventure-rpg.html',
  exploration:'adventure-rpg.html',
  // أدوات وتطبيقات
  tool:'tool-app.html',           app:'tool-app.html',
  timer:'tool-app.html',          tracker:'tool-app.html',
  calculator:'tool-app.html',     generator:'tool-app.html',
  productivity:'tool-app.html',   wellness:'tool-app.html',
  creative:'tool-app.html',
};

// ── اختيار القالب الصحيح ──────────────────────────────────────
function selectTemplate(idea, templateData) {
  // أولوية ١: template-engineer قرر
  if (templateData?.templateFile) return templateData.templateFile;

  // أولوية ٢: products.json يحدد
  if (idea.templateFile) return idea.templateFile;

  // أولوية ٣: TEMPLATE_MAP
  const type = (idea.type || '').toLowerCase();
  if (TEMPLATE_MAP[type]) return TEMPLATE_MAP[type];

  // بحث جزئي في النوع
  for (const [key, tpl] of Object.entries(TEMPLATE_MAP)) {
    if (type.includes(key) || key.includes(type)) return tpl;
  }

  // بحث في concept و tags
  const ctx = [idea.concept || '', ...(idea.tags || [])].join(' ').toLowerCase();
  if (/shoot|bullet|enemy|wave|fire|space/.test(ctx))          return 'arcade-shooter.html';
  if (/adventure|rpg|quest|dungeon|hero|magic|sword/.test(ctx)) return 'adventure-rpg.html';
  if (/tool|timer|focus|meditat|util/.test(ctx))               return 'tool-app.html';

  // افتراضي
  return 'memory-game.html';
}

const DEFAULT_IAPS = [
  { id:'no-ads',      type:'remove_ads', price:1.99, emoji:'🚫', name:{ar:'إزالة الإعلانات',en:'Remove Ads',fr:'Sans pub',es:'Sin anuncios',de:'Werbefrei',zh:'去广告'} },
  { id:'hint-pack',   type:'consumable', price:0.99, emoji:'💡', name:{ar:'10 تلميحات',en:'10 Hints',fr:'10 indices',es:'10 pistas',de:'10 Hinweise',zh:'10个提ش示'} },
  { id:'theme-pack',  type:'cosmetic',   price:1.49, emoji:'🎨', name:{ar:'حزمة الثيمات',en:'Themes Pack',fr:'Pack thèmes',es:'Pack temas',de:'Theme-Paket',zh:'主题包'} },
  { id:'full-unlock', type:'unlock',     price:2.99, emoji:'⭐', name:{ar:'فتح كل المحتوى',en:'Unlock All',fr:'Tout débloquer',es:'Desbloquear todo',de:'Alles freischalten',zh:'解锁全部'} },
];

export async function run(idea, story, levels, art, templateData) {
  const path     = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(path, 'utf8'));

  if (products.find(p => p.id === idea.id)) {
    logger.info('Product already exists — skipped', { id: idea.id });
    return { skipped: true, id: idea.id };
  }

  const templateFile = selectTemplate(idea, templateData);
  logger.info('Template selected', { id: idea.id, type: idea.type, template: templateFile });

  const product = {
    id:          idea.id,
    slug:        idea.id,
    type:        idea.type,
    category:    idea.category,
    status:      'available',
    emoji:       idea.emoji,
    templateFile,                              // ← حفظ اسم القالب
    accent:      art?.accent    || '#facc15',
    accentRgb:   art?.accentRgb || '250,204,21',
    gradient:    art?.gradient  || '135deg,#0f172a,#1e293b',
    emojis:      templateData?.emojis || levels?.emojis || art?.emojis || [],
    name:        idea.name,
    desc:        idea.desc,
    tags:        idea.tags || [],
    iap:         DEFAULT_IAPS,
    story:       story ? {
      setting:       story.setting,
      mainCharacter: story.mainCharacter,
      objective:     story.objective,
      intro:         story.intro,
      winMessage:    story.winMessage,
      loseMessage:   story.loseMessage,
    } : null,
    levels:      templateData?.levels || levels?.levels || null,
    generated:   true,
    generatedAt: new Date().toISOString(),
  };

  products.push(product);
  writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
  logger.info('Product added', { id: idea.id, template: templateFile });

  // تشغيل game-generator
  try {
    execSync(`node ${join(__dirname, '..', 'game-generator.js')} ${idea.id}`, {
      cwd: join(__dirname, '..'), stdio: 'inherit'
    });
    logger.info('Game built', { id: idea.id, template: templateFile });
  } catch (err) {
    logger.warn('game-generator failed', { error: err.message });
  }

  return { success: true, id: idea.id, template: templateFile };
}
