/**
 * template-engineer.js
 * يحلل نوع اللعبة → يختار القالب → يولّد levels عبر Gemini
 * 
 * IMPORTANT: هذا الوكيل يستدعي askGemini مرة واحدة فقط للقوالب الجديدة.
 * الـ orchestrator يتحكم في العداد عبر needsTemplateGemini().
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة الأنواع → القوالب ─────────────────────────────────
const TEMPLATE_MAP = {
  // ألعاب الذاكرة والألغاز الكلاسيكية
  memory:   'memory-game.html',
  puzzle:   'memory-game.html',
  word:     'memory-game.html',
  quiz:     'memory-game.html',
  matching: 'memory-game.html',
  trivia:   'memory-game.html',

  // أدوات وتطبيقات
  tool:        'tool-app.html',
  app:         'tool-app.html',
  timer:       'tool-app.html',
  tracker:     'tool-app.html',
  calculator:  'tool-app.html',
  generator:   'tool-app.html',
  productivity:'tool-app.html',
  wellness:    'tool-app.html',

  // أكشن وإطلاق نار ← قالب جديد!
  action:   'action-shooter.html',
  shooter:  'action-shooter.html',
  shooting: 'action-shooter.html',
  space:    'action-shooter.html',
  bullet:   'action-shooter.html',
  battle:   'action-shooter.html',
  defense:  'action-shooter.html',
  survival: 'action-shooter.html',

  // مغامرات وRPG ← قالب جديد!
  adventure:   'adventure-rpg.html',
  rpg:         'adventure-rpg.html',
  dungeon:     'adventure-rpg.html',
  quest:       'adventure-rpg.html',
  story:       'adventure-rpg.html',
  narrative:   'adventure-rpg.html',
  'text-adventure': 'adventure-rpg.html',
  exploration: 'adventure-rpg.html',

  // جري لا نهائي ← قالب جديد!
  runner:       'endless-runner.html',
  'endless-runner': 'endless-runner.html',
  run:          'endless-runner.html',
  platformer:   'endless-runner.html',
  dash:         'endless-runner.html',
  dodge:        'endless-runner.html',
  sprint:       'endless-runner.html',
  escape:       'endless-runner.html',
};

// ── labels متعددة اللغات لكل قالب ───────────────────────────
const TEMPLATE_LABELS = {
  'action-shooter.html': {
    ar: { scoreLbl:'نقاط', levelLbl:'مستوى', waveLbl:'موجة', fireLbl:'اطلق', specialLbl:'خاص', loseTitleLbl:'خسرت!', nextLbl:'التالي', winTitle:'فزت!' },
    en: { scoreLbl:'Score', levelLbl:'Level', waveLbl:'Wave', fireLbl:'Fire', specialLbl:'Special', loseTitleLbl:'Game Over!', nextLbl:'Next', winTitle:'You Win!' },
    fr: { scoreLbl:'Score', levelLbl:'Niveau', waveLbl:'Vague', fireLbl:'Tirer', specialLbl:'Spécial', loseTitleLbl:'Perdu!', nextLbl:'Suivant', winTitle:'Gagné!' },
    es: { scoreLbl:'Puntos', levelLbl:'Nivel', waveLbl:'Ola', fireLbl:'Disparar', specialLbl:'Especial', loseTitleLbl:'¡Perdiste!', nextLbl:'Siguiente', winTitle:'¡Ganaste!' },
    de: { scoreLbl:'Punkte', levelLbl:'Level', waveLbl:'Welle', fireLbl:'Schießen', specialLbl:'Spezial', loseTitleLbl:'Verloren!', nextLbl:'Weiter', winTitle:'Gewonnen!' },
    zh: { scoreLbl:'分数', levelLbl:'关卡', waveLbl:'波次', fireLbl:'射击', specialLbl:'特殊', loseTitleLbl:'游戏结束', nextLbl:'下一关', winTitle:'你赢了！' },
  },
  'adventure-rpg.html': {
    ar: { heroLbl:'البطل', attackLbl:'هجوم', skillLbl:'مهارة', itemLbl:'عنصر', fleeLbl:'فرار', loseTitleLbl:'سقطت!', nextLbl:'الفصل التالي', winTitle:'انتصرت!' },
    en: { heroLbl:'Hero', attackLbl:'Attack', skillLbl:'Skill', itemLbl:'Item', fleeLbl:'Flee', loseTitleLbl:'Defeated!', nextLbl:'Next Chapter', winTitle:'Victory!' },
    fr: { heroLbl:'Héros', attackLbl:'Attaque', skillLbl:'Compétence', itemLbl:'Objet', fleeLbl:'Fuir', loseTitleLbl:'Vaincu!', nextLbl:'Chapitre suivant', winTitle:'Victoire!' },
    es: { heroLbl:'Héroe', attackLbl:'Atacar', skillLbl:'Habilidad', itemLbl:'Objeto', fleeLbl:'Huir', loseTitleLbl:'¡Derrotado!', nextLbl:'Siguiente capítulo', winTitle:'¡Victoria!' },
    de: { heroLbl:'Held', attackLbl:'Angriff', skillLbl:'Fähigkeit', itemLbl:'Gegenstand', fleeLbl:'Fliehen', loseTitleLbl:'Besiegt!', nextLbl:'Nächstes Kapitel', winTitle:'Sieg!' },
    zh: { heroLbl:'英雄', attackLbl:'攻击', skillLbl:'技能', itemLbl:'道具', fleeLbl:'逃跑', loseTitleLbl:'被击败！', nextLbl:'下一章', winTitle:'胜利！' },
  },
  'endless-runner.html': {
    ar: { scoreLbl:'نقاط', bestLbl:'أفضل', coinsLbl:'عملات', distLbl:'مسافة', jumpLbl:'قفز', slideLbl:'انزلاق', overTitleLbl:'انتهت!', winTitle:'رائع!' },
    en: { scoreLbl:'Score', bestLbl:'Best', coinsLbl:'Coins', distLbl:'Distance', jumpLbl:'Jump', slideLbl:'Slide', overTitleLbl:'Game Over!', winTitle:'Amazing!' },
    fr: { scoreLbl:'Score', bestLbl:'Meilleur', coinsLbl:'Pièces', distLbl:'Distance', jumpLbl:'Sauter', slideLbl:'Glisser', overTitleLbl:'Fin!', winTitle:'Bravo!' },
    es: { scoreLbl:'Puntos', bestLbl:'Mejor', coinsLbl:'Monedas', distLbl:'Distancia', jumpLbl:'Saltar', slideLbl:'Deslizar', overTitleLbl:'¡Fin!', winTitle:'¡Increíble!' },
    de: { scoreLbl:'Punkte', bestLbl:'Beste', coinsLbl:'Münzen', distLbl:'Entfernung', jumpLbl:'Springen', slideLbl:'Rutschen', overTitleLbl:'Vorbei!', winTitle:'Fantastisch!' },
    zh: { scoreLbl:'分数', bestLbl:'最佳', coinsLbl:'金币', distLbl:'距离', jumpLbl:'跳跃', slideLbl:'滑行', overTitleLbl:'游戏结束', winTitle:'太棒了！' },
  },
};

/**
 * يحدد القالب المناسب بناءً على نوع اللعبة
 */
export function selectTemplate(idea) {
  const type = (idea.type || '').toLowerCase().trim();

  // بحث مباشر
  if (TEMPLATE_MAP[type]) return TEMPLATE_MAP[type];

  // بحث جزئي
  for (const [key, tpl] of Object.entries(TEMPLATE_MAP)) {
    if (type.includes(key) || key.includes(type)) return tpl;
  }

  // بحث في concept و tags
  const context = [
    idea.concept || '',
    idea.uniqueFeature || '',
    ...(idea.tags || [])
  ].join(' ').toLowerCase();

  if (/shoot|shoot|bullet|enemy|wave|fire|space.?invader|turret/.test(context)) return 'action-shooter.html';
  if (/adventure|rpg|quest|dungeon|hero|sword|magic|story|chapter|battle.?system/.test(context)) return 'adventure-rpg.html';
  if (/run|jump|dodge|endless|sprint|obstacle|platform|dash/.test(context)) return 'endless-runner.html';
  if (/tool|app|timer|tracker|focus|util|meditat|breath/.test(context)) return 'tool-app.html';

  // افتراضي
  return 'memory-game.html';
}

/**
 * يولّد بيانات levels مخصصة للعبة باستخدام Gemini
 */
export async function run(idea, story) {
  const templateFile = selectTemplate(idea);

  logger.info('Template selected', { id: idea.id, type: idea.type, template: templateFile });

  // إذا كان قالب كلاسيكي، نعيد البيانات البسيطة
  if (templateFile === 'memory-game.html' || templateFile === 'tool-app.html') {
    return {
      templateFile,
      levels: null,
      emojis: idea.emojis || [],
      labels: null,
    };
  }

  // للقوالب الجديدة: نطلب من Gemini توليد بيانات مخصصة
  const storyContext = story ? `
Story setting: ${story.setting}
Main character: ${story.mainCharacter}  
Objective: ${story.objective}
` : '';

  const prompt = buildLevelsPrompt(templateFile, idea, storyContext);

  let levelsData;
  try {
    levelsData = await askGemini(prompt, 0.8);
  } catch (err) {
    logger.warn('Gemini levels generation failed, using fallback', { error: err.message });
    levelsData = buildFallbackLevels(templateFile, idea);
  }

  return {
    templateFile,
    levels: levelsData.levels || [],
    emojis: levelsData.emojis || idea.emojis || [],
    labels: TEMPLATE_LABELS[templateFile] || null,
  };
}

// ── Prompts per template ──────────────────────────────────────

function buildLevelsPrompt(templateFile, idea, storyContext) {
  if (templateFile === 'action-shooter.html') {
    return `
You are a game designer creating levels for an action/shooter game.

Game: "${idea.name?.en}"
Concept: "${idea.concept}"
${storyContext}

Return ONLY valid JSON with this structure:
{
  "levels": [
    {
      "enemyCount": 8,
      "enemySpeed": 1.2,
      "enemyHealth": 1,
      "bulletSpeed": 6,
      "spawnInterval": 90,
      "emojis": ["👾","🤖","👽"],
      "winMessage": "Wave cleared! Next sector ahead...",
      "loseMessage": "Mission failed. Try again!"
    }
  ],
  "emojis": ["👾","🤖","👽","💀","🔥"]
}

Create 5 levels of increasing difficulty. Match emojis to the game's theme: ${idea.concept}
`;
  }

  if (templateFile === 'adventure-rpg.html') {
    return `
You are a game designer creating story nodes for an RPG adventure game.

Game: "${idea.name?.en}"
Concept: "${idea.concept}"
${storyContext}

Return ONLY valid JSON:
{
  "levels": [
    {
      "winMessage": "Chapter 1 complete!",
      "loseMessage": "You were defeated...",
      "nodes": [
        {
          "type": "choice",
          "icon": "🌲",
          "locationName": "Ancient Forest",
          "narrative": "Dark trees surround you, whispering ancient secrets.",
          "choices": [
            { "icon": "⚔️", "text": "Enter the dark cave", "effect": "combat" },
            { "icon": "🔍", "text": "Search the ruins", "effect": "loot" },
            { "icon": "🏃", "text": "Take the safe path", "effect": "skip" }
          ]
        },
        {
          "type": "combat",
          "icon": "🏰",
          "locationName": "Cursed Tower",
          "narrative": "A powerful guardian blocks your path!",
          "enemy": { "icon": "🐉", "name": "Shadow Drake", "hp": 60, "atk": 12 },
          "winMessage": "The beast falls!",
          "loseMessage": "Overwhelmed by darkness..."
        }
      ]
    }
  ]
}

Create 1 chapter with 4-6 nodes. Theme: ${idea.concept}
Mix combat, choice, and exploration nodes.
`;
  }

  if (templateFile === 'endless-runner.html') {
    return `
You are a game designer for an endless runner game.

Game: "${idea.name?.en}"
Concept: "${idea.concept}"
${storyContext}

Return ONLY valid JSON:
{
  "levels": [{ "startSpeed": 5, "speedIncrement": 0.001 }],
  "emojis": ["⭐","💎","🔮","💡","🌟"]
}

Choose 5 collectible emojis that match the theme: ${idea.concept}
`;
  }

  return `{}`;
}

function buildFallbackLevels(templateFile, idea) {
  if (templateFile === 'action-shooter.html') {
    const enemyEmojis = ['👾','🤖','👽','🦠','💀'];
    return {
      levels: [1,2,3,4,5].map(i => ({
        enemyCount: 5 + i*3,
        enemySpeed: 1 + i*.3,
        enemyHealth: Math.ceil(i/2),
        bulletSpeed: 6,
        spawnInterval: Math.max(50, 100 - i*10),
        emojis: enemyEmojis,
        winMessage: `Level ${i} cleared!`,
        loseMessage: 'Mission failed!',
      })),
      emojis: enemyEmojis,
    };
  }
  if (templateFile === 'adventure-rpg.html') {
    return { levels: [], emojis: [] }; // fallback built into template
  }
  if (templateFile === 'endless-runner.html') {
    return { levels: [{ startSpeed: 5, speedIncrement: .001 }], emojis: ['⭐','💎','🔮','💡','🌟'] };
  }
  return { levels: [], emojis: [] };
}
