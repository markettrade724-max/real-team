/**
 * code-agent.js
 * يستقبل templateData من orchestrator (جاهز من template-engineer)
 * لا يستدعي Gemini مباشرة — كل شيء جاهز
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { logger }         from '../logger.js';
import { selectTemplate } from './template-engineer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_IAPS = [
  { id:'no-ads',      type:'remove_ads', price:1.99, emoji:'🚫', name:{ar:'إزالة الإعلانات',en:'Remove Ads',fr:'Sans pub',es:'Sin anuncios',de:'Werbefrei',zh:'去广告'} },
  { id:'hint-pack',   type:'consumable', price:0.99, emoji:'💡', name:{ar:'10 تلميحات',en:'10 Hints',fr:'10 indices',es:'10 pistas',de:'10 Hinweise',zh:'10个提示'} },
  { id:'theme-pack',  type:'cosmetic',   price:1.49, emoji:'🎨', name:{ar:'حزمة الثيمات',en:'Themes Pack',fr:'Pack thèmes',es:'Pack temas',de:'Theme-Paket',zh:'主题包'} },
  { id:'full-unlock', type:'unlock',     price:2.99, emoji:'⭐', name:{ar:'فتح كل المحتوى',en:'Unlock All',fr:'Tout débloquer',es:'Desbloquear todo',de:'Alles freischalten',zh:'解锁全部'} },
];

/**
 * @param {object} idea        - نتيجة idea-agent
 * @param {object} story       - نتيجة story-agent
 * @param {object} levels      - نتيجة level-agent (legacy)
 * @param {object} art         - نتيجة art-agent
 * @param {object} templateData - نتيجة template-engineer (جديد)
 */
export async function run(idea, story, levels, art, templateData) {
  const path     = join(__dirname, '..', 'products.json');
  const products = JSON.parse(readFileSync(path, 'utf8'));

  if (products.find(p => p.id === idea.id)) {
    logger.info('Product already exists — skipped', { id: idea.id });
    return { skipped: true, id: idea.id };
  }

  // ── اختيار القالب ────────────────────────────────────────────
  // إذا جاء templateData من orchestrator → استخدمه مباشرة
  // وإلا → اختر بناءً على النوع (fallback آمن بدون Gemini)
  const templateFile = templateData?.templateFile || selectTemplate(idea);
  const templateLevels = templateData?.levels || levels?.levels || null;
  const templateEmojis = templateData?.emojis?.length
    ? templateData.emojis
    : (levels?.emojis || art?.emojis || []);

  logger.info('Building product', { id: idea.id, template: templateFile });

  // ── بناء product ─────────────────────────────────────────────
  const product = {
    id:       idea.id,
    slug:     idea.id,
    type:     idea.type,
    category: idea.category,
    status:   'available',
    emoji:    idea.emoji,

    templateFile,

    accent:    art?.accent    || '#facc15',
    accentRgb: art?.accentRgb || '250,204,21',
    gradient:  art?.gradient  || '135deg,#0f172a,#1e293b',

    emojis: templateEmojis,
    levels: templateLevels,

    name: idea.name,
    desc: idea.desc,
    tags: idea.tags || [],
    iap:  DEFAULT_IAPS,

    story: story ? {
      setting:       story.setting,
      mainCharacter: story.mainCharacter,
      objective:     story.objective,
      intro:         story.intro,
      winMessage:    story.winMessage,
      loseMessage:   story.loseMessage,
    } : null,

    generated:   true,
    generatedAt: new Date().toISOString(),
  };

  // ── حفظ في products.json ─────────────────────────────────────
  products.push(product);
  writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
  logger.info('Product saved', { id: idea.id, template: templateFile });

  // ── توليد ملفات HTML (×6 لغات) ──────────────────────────────
  try {
    execSync(`node ${join(__dirname, '..', 'game-generator.js')} ${idea.id}`, {
      cwd: join(__dirname, '..'), stdio: 'inherit',
    });
    logger.info('HTML files generated', {
      id: idea.id,
      template: templateFile,
      output: `public/games/${idea.id}*.html (×6)`,
    });
  } catch (err) {
    logger.warn('game-generator failed', { error: err.message });
  }

  return {
    success:      true,
    id:           idea.id,
    templateFile,
  };
}
