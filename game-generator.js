/**
 * game-generator.js — يولّد الألعاب بكل اللغات الست
 * v2: يدعم قوالب action-shooter, adventure-rpg, endless-runner
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── selectTemplate مضمّنة هنا لأن game-generator يُشغَّل مستقلاً ──
const TEMPLATE_MAP = {
  memory:'memory-game.html', puzzle:'memory-game.html',
  word:'memory-game.html',   quiz:'memory-game.html',
  matching:'memory-game.html', trivia:'memory-game.html', arcade:'memory-game.html',
  tool:'tool-app.html',      app:'tool-app.html',
  timer:'tool-app.html',     tracker:'tool-app.html',
  calculator:'tool-app.html', generator:'tool-app.html',
  productivity:'tool-app.html', wellness:'tool-app.html',
  action:'action-shooter.html',   shooter:'action-shooter.html',
  shooting:'action-shooter.html', space:'action-shooter.html',
  bullet:'action-shooter.html',   battle:'action-shooter.html',
  defense:'action-shooter.html',  survival:'action-shooter.html',
  adventure:'adventure-rpg.html', rpg:'adventure-rpg.html',
  dungeon:'adventure-rpg.html',   quest:'adventure-rpg.html',
  story:'adventure-rpg.html',     narrative:'adventure-rpg.html',
  exploration:'adventure-rpg.html',
  runner:'endless-runner.html',   run:'endless-runner.html',
  platformer:'endless-runner.html', dash:'endless-runner.html',
  dodge:'endless-runner.html',    sprint:'endless-runner.html',
  escape:'endless-runner.html',
};

function selectTemplate(idea) {
  const type = (idea.type || '').toLowerCase().trim();
  if (TEMPLATE_MAP[type]) return TEMPLATE_MAP[type];
  for (const [key, tpl] of Object.entries(TEMPLATE_MAP)) {
    if (type.includes(key) || key.includes(type)) return tpl;
  }
  const ctx = [idea.concept||'', ...(idea.tags||[])].join(' ').toLowerCase();
  if (/shoot|bullet|enemy|wave/.test(ctx))           return 'action-shooter.html';
  if (/adventure|rpg|quest|dungeon|hero/.test(ctx))  return 'adventure-rpg.html';
  if (/run|jump|dodge|endless|sprint/.test(ctx))     return 'endless-runner.html';
  return 'memory-game.html';
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة الأنواع → القوالب (legacy + new) ───────────────────
const TYPE_DEFAULTS = {
  // ── قوالب كلاسيكية ──
  memory: { cols:4, pairs:8, emojiSize:'2rem', hintsStart:3, emojis:['🌌','⭐','🪐','🌙','☀️','🌠','🌟','🚀','🛸','🌍','💫','🌈'] },
  puzzle: { cols:4, pairs:8, emojiSize:'2rem', hintsStart:2, emojis:['🧩','🎯','🔮','💎','🌀','⚡','🎪','🎨','🎭','🎬','🎮','🕹️'] },
  word:   { cols:4, pairs:8, emojiSize:'2rem', hintsStart:3, emojis:['📝','✍️','📖','🔤','💬','🗣️','📚','🖊️','📰','💡','🔑','🎯'] },
  quiz:   { cols:4, pairs:6, emojiSize:'2rem', hintsStart:3, emojis:['❓','💡','🎓','🏆','⭐','🔥','✅','❌','🎯','📊','🧠','🌟'] },
  arcade: { cols:4, pairs:8, emojiSize:'2rem', hintsStart:2, emojis:['🕹️','👾','🎮','🚀','💥','⭐','🏆','💣','🎯','🔫','🛡️','⚡'] },
};

// ── ترجمات مشتركة ─────────────────────────────────────────────
const LABELS = {
  ar:{ dir:'rtl', back:'العودة', adLbl:'الإعلانات تدعم الفريق', adRemove:'إزالة $1.99', movesLbl:'حركة', timeLbl:'وقت', pairsLbl:'أزواج', hintLbl:'تلميح', hintLeft:'متبقي', restartLbl:'لعبة جديدة', winTitle:'أحسنت!', playAgain:'مجدداً', focusLbl:'تركيز', shortLbl:'استراحة', longLbl:'استراحة طويلة', startLbl:'ابدأ', pauseLbl:'توقف', sessionsLbl:'جلسات', minutesLbl:'دقيقة', streakLbl:'متواصل', doneLbl:'انتهت الجلسة!',
      // action
      scoreLbl:'نقاط', levelLbl:'مستوى', waveLbl:'موجة', fireLbl:'اطلق', specialLbl:'خاص', loseTitleLbl:'خسرت!', nextLbl:'التالي',
      // adventure
      heroLbl:'البطل', attackLbl:'هجوم', skillLbl:'مهارة', itemLbl:'عنصر', fleeLbl:'فرار',
      // runner
      bestLbl:'أفضل', coinsLbl:'عملات', distLbl:'مسافة', jumpLbl:'قفز', slideLbl:'انزلاق', overTitleLbl:'انتهت!',
  },
  en:{ dir:'ltr', back:'Back', adLbl:'Ads support our team', adRemove:'Remove $1.99', movesLbl:'Moves', timeLbl:'Time', pairsLbl:'Pairs', hintLbl:'Hint', hintLeft:'left', restartLbl:'New Game', winTitle:'You Win!', playAgain:'Play Again', focusLbl:'Focus', shortLbl:'Short Break', longLbl:'Long Break', startLbl:'Start', pauseLbl:'Pause', sessionsLbl:'Sessions', minutesLbl:'Minutes', streakLbl:'Streak', doneLbl:'Session done!',
      scoreLbl:'Score', levelLbl:'Level', waveLbl:'Wave', fireLbl:'Fire', specialLbl:'Special', loseTitleLbl:'Game Over!', nextLbl:'Next',
      heroLbl:'Hero', attackLbl:'Attack', skillLbl:'Skill', itemLbl:'Item', fleeLbl:'Flee',
      bestLbl:'Best', coinsLbl:'Coins', distLbl:'Distance', jumpLbl:'Jump', slideLbl:'Slide', overTitleLbl:'Game Over!',
  },
  fr:{ dir:'ltr', back:'Retour', adLbl:"Les pubs soutiennent l'équipe", adRemove:'Supprimer 1,99$', movesLbl:'Coups', timeLbl:'Temps', pairsLbl:'Paires', hintLbl:'Indice', hintLeft:'restants', restartLbl:'Nouveau jeu', winTitle:'Bravo!', playAgain:'Rejouer', focusLbl:'Focus', shortLbl:'Pause courte', longLbl:'Pause longue', startLbl:'Démarrer', pauseLbl:'Pause', sessionsLbl:'Sessions', minutesLbl:'Minutes', streakLbl:'Série', doneLbl:'Session terminée!',
      scoreLbl:'Score', levelLbl:'Niveau', waveLbl:'Vague', fireLbl:'Tirer', specialLbl:'Spécial', loseTitleLbl:'Perdu!', nextLbl:'Suivant',
      heroLbl:'Héros', attackLbl:'Attaque', skillLbl:'Compétence', itemLbl:'Objet', fleeLbl:'Fuir',
      bestLbl:'Meilleur', coinsLbl:'Pièces', distLbl:'Distance', jumpLbl:'Sauter', slideLbl:'Glisser', overTitleLbl:'Fin!',
  },
  es:{ dir:'ltr', back:'Volver', adLbl:'Los anuncios apoyan al equipo', adRemove:'Eliminar $1.99', movesLbl:'Movs', timeLbl:'Tiempo', pairsLbl:'Pares', hintLbl:'Pista', hintLeft:'restantes', restartLbl:'Nuevo Juego', winTitle:'¡Ganaste!', playAgain:'Jugar de nuevo', focusLbl:'Enfoque', shortLbl:'Pausa corta', longLbl:'Pausa larga', startLbl:'Iniciar', pauseLbl:'Pausar', sessionsLbl:'Sesiones', minutesLbl:'Minutos', streakLbl:'Racha', doneLbl:'¡Sesión completada!',
      scoreLbl:'Puntos', levelLbl:'Nivel', waveLbl:'Ola', fireLbl:'Disparar', specialLbl:'Especial', loseTitleLbl:'¡Perdiste!', nextLbl:'Siguiente',
      heroLbl:'Héroe', attackLbl:'Atacar', skillLbl:'Habilidad', itemLbl:'Objeto', fleeLbl:'Huir',
      bestLbl:'Mejor', coinsLbl:'Monedas', distLbl:'Distancia', jumpLbl:'Saltar', slideLbl:'Deslizar', overTitleLbl:'¡Fin!',
  },
  de:{ dir:'ltr', back:'Zurück', adLbl:'Anzeigen unterstützen das Team', adRemove:'Entfernen 1,99$', movesLbl:'Züge', timeLbl:'Zeit', pairsLbl:'Paare', hintLbl:'Hinweis', hintLeft:'übrig', restartLbl:'Neues Spiel', winTitle:'Gewonnen!', playAgain:'Nochmal', focusLbl:'Fokus', shortLbl:'Kurze Pause', longLbl:'Lange Pause', startLbl:'Starten', pauseLbl:'Pause', sessionsLbl:'Sitzungen', minutesLbl:'Minuten', streakLbl:'Serie', doneLbl:'Sitzung abgeschlossen!',
      scoreLbl:'Punkte', levelLbl:'Level', waveLbl:'Welle', fireLbl:'Schießen', specialLbl:'Spezial', loseTitleLbl:'Verloren!', nextLbl:'Weiter',
      heroLbl:'Held', attackLbl:'Angriff', skillLbl:'Fähigkeit', itemLbl:'Gegenstand', fleeLbl:'Fliehen',
      bestLbl:'Beste', coinsLbl:'Münzen', distLbl:'Entfernung', jumpLbl:'Springen', slideLbl:'Rutschen', overTitleLbl:'Vorbei!',
  },
  zh:{ dir:'ltr', back:'返回', adLbl:'广告支持我们的团队', adRemove:'去除广告 $1.99', movesLbl:'步数', timeLbl:'时间', pairsLbl:'配对', hintLbl:'提示', hintLeft:'剩余', restartLbl:'新游戏', winTitle:'你赢了！', playAgain:'再玩', focusLbl:'专注', shortLbl:'短暂休息', longLbl:'长时间休息', startLbl:'开始', pauseLbl:'暂停', sessionsLbl:'次数', minutesLbl:'分钟', streakLbl:'连续', doneLbl:'专注完成！',
      scoreLbl:'分数', levelLbl:'关卡', waveLbl:'波次', fireLbl:'射击', specialLbl:'特殊', loseTitleLbl:'游戏结束', nextLbl:'下一关',
      heroLbl:'英雄', attackLbl:'攻击', skillLbl:'技能', itemLbl:'道具', fleeLbl:'逃跑',
      bestLbl:'最佳', coinsLbl:'金币', distLbl:'距离', jumpLbl:'跳跃', slideLbl:'滑行', overTitleLbl:'游戏结束',
  },
};

// ── ضمان وجود ترجمة ──────────────────────────────────────────
function ensureTranslations(nameObj, descObj) {
  const LANGS = ['ar','en','fr','es','de','zh'];
  const safeName = {}, safeDesc = {};
  LANGS.forEach(l => {
    safeName[l] = nameObj?.[l] || nameObj?.en || nameObj?.ar || 'Game';
    safeDesc[l] = descObj?.[l] || descObj?.en || descObj?.ar || '';
  });
  return { safeName, safeDesc };
}

// ── استبدال كل المتغيرات في القالب ──────────────────────────
function applyTemplate(tpl, product, lang, lbl, def, safeName, safeDesc) {
  const name = safeName[lang];
  const desc = safeDesc[lang];
  const emojis = product.emojis || def?.emojis || [];
  const levelsJson = JSON.stringify(product.levels || []);

  return tpl
    // أساسيات
    .replace(/\{\{LANG\}\}/g, lang)
    .replace(/\{\{DIR\}\}/g, lbl.dir)
    .replace(/\{\{PRODUCT_ID\}\}/g, product.id)
    .replace(/\{\{GAME_NAME\}\}/g, name)
    .replace(/\{\{GAME_NAME_HTML\}\}/g, name)
    .replace(/\{\{GAME_DESC\}\}/g, desc)
    .replace(/\{\{EMOJI\}\}/g, product.emoji)
    .replace(/\{\{ACCENT\}\}/g, product.accent)
    .replace(/\{\{ACCENT_RGB\}\}/g, product.accentRgb)
    // data
    .replace(/\{\{EMOJIS_JSON\}\}/g, JSON.stringify(emojis))
    .replace(/\{\{LEVELS_JSON\}\}/g, levelsJson)
    .replace(/\{\{IAPS_JSON\}\}/g, JSON.stringify(product.iap || []))
    // classic labels
    .replace(/\{\{COLS\}\}/g, def?.cols || 4)
    .replace(/\{\{PAIRS\}\}/g, def?.pairs || 8)
    .replace(/\{\{EMOJI_SIZE\}\}/g, def?.emojiSize || '2rem')
    .replace(/\{\{HINTS_START\}\}/g, def?.hintsStart || 3)
    // shared labels
    .replace(/\{\{BACK_LABEL\}\}/g, lbl.back)
    .replace(/\{\{AD_LABEL\}\}/g, lbl.adLbl)
    .replace(/\{\{AD_REMOVE_LABEL\}\}/g, lbl.adRemove)
    .replace(/\{\{START_LBL\}\}/g, lbl.startLbl)
    .replace(/\{\{RESTART_LBL\}\}/g, lbl.restartLbl)
    .replace(/\{\{WIN_TITLE\}\}/g, lbl.winTitle)
    // memory labels
    .replace(/\{\{MOVES_LBL\}\}/g, lbl.movesLbl)
    .replace(/\{\{TIME_LBL\}\}/g, lbl.timeLbl)
    .replace(/\{\{PAIRS_LBL\}\}/g, lbl.pairsLbl)
    .replace(/\{\{HINT_LBL\}\}/g, lbl.hintLbl)
    .replace(/\{\{HINT_LEFT_LBL\}\}/g, lbl.hintLeft)
    .replace(/\{\{PLAY_AGAIN_LBL\}\}/g, lbl.playAgain)
    .replace(/\{\{FOCUS_LBL\}\}/g, lbl.focusLbl)
    .replace(/\{\{SHORT_LBL\}\}/g, lbl.shortLbl)
    .replace(/\{\{LONG_LBL\}\}/g, lbl.longLbl)
    .replace(/\{\{PAUSE_LBL\}\}/g, lbl.pauseLbl)
    .replace(/\{\{SESSIONS_LBL\}\}/g, lbl.sessionsLbl)
    .replace(/\{\{MINUTES_LBL\}\}/g, lbl.minutesLbl)
    .replace(/\{\{STREAK_LBL\}\}/g, lbl.streakLbl)
    .replace(/\{\{DONE_LBL\}\}/g, lbl.doneLbl)
    // action shooter labels
    .replace(/\{\{SCORE_LBL\}\}/g, lbl.scoreLbl || 'Score')
    .replace(/\{\{LEVEL_LBL\}\}/g, lbl.levelLbl || 'Level')
    .replace(/\{\{WAVE_LBL\}\}/g, lbl.waveLbl || 'Wave')
    .replace(/\{\{FIRE_LBL\}\}/g, lbl.fireLbl || 'Fire')
    .replace(/\{\{SPECIAL_LBL\}\}/g, lbl.specialLbl || 'Special')
    .replace(/\{\{LOSE_TITLE\}\}/g, lbl.loseTitleLbl || 'Game Over!')
    .replace(/\{\{NEXT_LBL\}\}/g, lbl.nextLbl || 'Next')
    // adventure labels
    .replace(/\{\{HERO_LBL\}\}/g, lbl.heroLbl || 'Hero')
    .replace(/\{\{ATTACK_LBL\}\}/g, lbl.attackLbl || 'Attack')
    .replace(/\{\{SKILL_LBL\}\}/g, lbl.skillLbl || 'Skill')
    .replace(/\{\{ITEM_LBL\}\}/g, lbl.itemLbl || 'Item')
    .replace(/\{\{FLEE_LBL\}\}/g, lbl.fleeLbl || 'Flee')
    .replace(/\{\{LOSE_TITLE\}\}/g, lbl.loseTitleLbl || 'Defeated!')
    // runner labels
    .replace(/\{\{BEST_LBL\}\}/g, lbl.bestLbl || 'Best')
    .replace(/\{\{COINS_LBL\}\}/g, lbl.coinsLbl || 'Coins')
    .replace(/\{\{DIST_LBL\}\}/g, lbl.distLbl || 'Distance')
    .replace(/\{\{JUMP_LBL\}\}/g, lbl.jumpLbl || 'Jump')
    .replace(/\{\{SLIDE_LBL\}\}/g, lbl.slideLbl || 'Slide')
    .replace(/\{\{OVER_TITLE\}\}/g, lbl.overTitleLbl || 'Game Over!');
}

// ── generate ─────────────────────────────────────────────────
function generate(product) {
  // اختيار القالب: أولاً من product.templateFile، ثم selectTemplate
  const tplName = product.templateFile || selectTemplate(product);
  const tplPath = join(__dirname, 'templates', tplName);
  let tpl;
  try { tpl = readFileSync(tplPath, 'utf8'); }
  catch {
    console.error(`❌ Template not found: ${tplName}, falling back to memory-game.html`);
    try { tpl = readFileSync(join(__dirname, 'templates', 'memory-game.html'), 'utf8'); }
    catch { console.error('❌ Even fallback template missing!'); return false; }
  }

  const def = TYPE_DEFAULTS[product.type] || null;
  const { safeName, safeDesc } = ensureTranslations(product.name, product.desc);

  const LANGS = ['ar','en','fr','es','de','zh'];
  const outDir = join(__dirname, 'public', 'games');
  mkdirSync(outDir, { recursive: true });

  LANGS.forEach(lang => {
    const lbl = LABELS[lang];
    const out = applyTemplate(tpl, product, lang, lbl, def, safeName, safeDesc);
    const filename = lang === 'ar'
      ? `${product.slug}.html`
      : `${product.slug}-${lang}.html`;
    writeFileSync(join(outDir, filename), out, 'utf8');
  });

  console.log(`✅ ${product.slug} [${tplName}] → 6 languages`);
  return true;
}

// ── main ─────────────────────────────────────────────────────
const products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf8'));
const target   = process.argv[2];
const list     = target
  ? products.filter(p => p.id === target || p.slug === target)
  : products.filter(p => p.status === 'available');

if (!list.length) { console.warn('⚠️ No products'); process.exit(1); }
let ok = 0;
list.forEach(p => { if (generate(p)) ok++; });
console.log(`\n🎮 Generated ${ok}/${list.length} products × 6 languages`);
