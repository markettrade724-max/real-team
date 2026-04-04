/**
 * game-generator.js
 * يولّد ملفات الألعاب والتطبيقات تلقائياً
 * node game-generator.js          ← يولّد الكل
 * node game-generator.js memory-cosmos  ← يولّد واحدة
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة النوع → القالب ──────────────────────────────────────
const TEMPLATE_MAP = {
  memory: 'memory-game.html',
  puzzle: 'memory-game.html',   // نفس قالب الذاكرة مبدئياً
  word:   'memory-game.html',
  tool:   'tool-app.html',
  app:    'tool-app.html',
};

// ── إعدادات افتراضية لكل نوع ──────────────────────────────────
const TYPE_DEFAULTS = {
  memory: { cols:4, pairs:8, emojiSize:'2rem', hintsStart:3,
    emojis:['🌌','⭐','🪐','🌙','☀️','🌠','🌟','🚀','🛸','🌍','💫','🌈'] },
  puzzle: { cols:4, pairs:8, emojiSize:'2rem', hintsStart:2,
    emojis:['🧩','🎯','🔮','💎','🌀','⚡','🎪','🎨','🎭','🎬','🎮','🕹️'] },
  word:   { cols:4, pairs:8, emojiSize:'2rem', hintsStart:3,
    emojis:['📝','✍️','📖','🔤','💬','🗣️','📚','🖊️','📰','💡','🔑','🎯'] },
  tool:   { cols:null, pairs:null, emojiSize:null, hintsStart:null, emojis:null },
  app:    { cols:null, pairs:null, emojiSize:null, hintsStart:null, emojis:null },
};

// ── الترجمات ──────────────────────────────────────────────────
const L = {
  ar:{ back:'العودة', adLbl:'الإعلانات تدعم الفريق', adRemove:'إزالة $1.99', movesLbl:'حركة', timeLbl:'وقت', pairsLbl:'أزواج', hintLbl:'تلميح', hintLeft:'متبقي', restartLbl:'لعبة جديدة', winTitle:'أحسنت!', playAgain:'مجدداً', focusLbl:'تركيز', shortLbl:'استراحة قصيرة', longLbl:'استراحة طويلة', startLbl:'ابدأ', pauseLbl:'توقف', sessionsLbl:'جلسات', minutesLbl:'دقيقة', streakLbl:'متواصل', doneLbl:'انتهت الجلسة! خذ استراحة.' },
  en:{ back:'Back', adLbl:'Ads support our team', adRemove:'Remove $1.99', movesLbl:'Moves', timeLbl:'Time', pairsLbl:'Pairs', hintLbl:'Hint', hintLeft:'left', restartLbl:'New Game', winTitle:'You Win!', playAgain:'Play Again', focusLbl:'Focus', shortLbl:'Short Break', longLbl:'Long Break', startLbl:'Start', pauseLbl:'Pause', sessionsLbl:'Sessions', minutesLbl:'Minutes', streakLbl:'Streak', doneLbl:'Session done! Take a break.' },
  fr:{ back:'Retour', adLbl:'Les pubs soutiennent l\'équipe', adRemove:'Supprimer 1,99$', movesLbl:'Coups', timeLbl:'Temps', pairsLbl:'Paires', hintLbl:'Indice', hintLeft:'restants', restartLbl:'Nouveau jeu', winTitle:'Bravo!', playAgain:'Rejouer', focusLbl:'Focus', shortLbl:'Pause courte', longLbl:'Pause longue', startLbl:'Démarrer', pauseLbl:'Pause', sessionsLbl:'Sessions', minutesLbl:'Minutes', streakLbl:'Série', doneLbl:'Session terminée !' },
  es:{ back:'Volver', adLbl:'Los anuncios apoyan al equipo', adRemove:'Eliminar $1.99', movesLbl:'Movs', timeLbl:'Tiempo', pairsLbl:'Pares', hintLbl:'Pista', hintLeft:'restantes', restartLbl:'Nuevo Juego', winTitle:'¡Ganaste!', playAgain:'Jugar de nuevo', focusLbl:'Enfoque', shortLbl:'Pausa corta', longLbl:'Pausa larga', startLbl:'Iniciar', pauseLbl:'Pausar', sessionsLbl:'Sesiones', minutesLbl:'Minutos', streakLbl:'Racha', doneLbl:'¡Sesión completada!' },
  de:{ back:'Zurück', adLbl:'Anzeigen unterstützen das Team', adRemove:'Entfernen 1,99$', movesLbl:'Züge', timeLbl:'Zeit', pairsLbl:'Paare', hintLbl:'Hinweis', hintLeft:'übrig', restartLbl:'Neues Spiel', winTitle:'Gewonnen!', playAgain:'Nochmal', focusLbl:'Fokus', shortLbl:'Kurze Pause', longLbl:'Lange Pause', startLbl:'Starten', pauseLbl:'Pause', sessionsLbl:'Sitzungen', minutesLbl:'Minuten', streakLbl:'Serie', doneLbl:'Sitzung abgeschlossen!' },
  zh:{ back:'返回', adLbl:'广告支持我们的团队', adRemove:'去除广告 $1.99', movesLbl:'步数', timeLbl:'时间', pairsLbl:'配对', hintLbl:'提示', hintLeft:'剩余', restartLbl:'新游戏', winTitle:'你赢了！', playAgain:'再玩', focusLbl:'专注', shortLbl:'短暂休息', longLbl:'长时间休息', startLbl:'开始', pauseLbl:'暂停', sessionsLbl:'次数', minutesLbl:'分钟', streakLbl:'连续', doneLbl:'专注完成！' },
};

function generate(product) {
  const tplName = TEMPLATE_MAP[product.type] || 'memory-game.html';
  const tplPath = join(__dirname, 'templates', tplName);
  let tpl;
  try { tpl = readFileSync(tplPath, 'utf8'); }
  catch { console.error(`❌ Template not found: ${tplName}`); return false; }

  const lang  = 'ar';
  const dir   = lang === 'ar' ? 'rtl' : 'ltr';
  const lbl   = L[lang] || L.en;
  const def   = TYPE_DEFAULTS[product.type] || TYPE_DEFAULTS.memory;
  const name  = product.name[lang] || product.name.en;
  const desc  = product.desc[lang]  || product.desc.en;
  const emojis = product.emojis || def.emojis || [];

  const out = tpl
    .replace(/\{\{LANG\}\}/g, lang)
    .replace(/\{\{DIR\}\}/g, dir)
    .replace(/\{\{PRODUCT_ID\}\}/g, product.id)
    .replace(/\{\{GAME_NAME\}\}/g, name)
    .replace(/\{\{GAME_NAME_HTML\}\}/g, name)
    .replace(/\{\{GAME_DESC\}\}/g, desc)
    .replace(/\{\{EMOJI\}\}/g, product.emoji)
    .replace(/\{\{ACCENT\}\}/g, product.accent)
    .replace(/\{\{ACCENT_RGB\}\}/g, product.accentRgb)
    .replace(/\{\{COLS\}\}/g, def.cols)
    .replace(/\{\{PAIRS\}\}/g, def.pairs)
    .replace(/\{\{EMOJI_SIZE\}\}/g, def.emojiSize)
    .replace(/\{\{HINTS_START\}\}/g, def.hintsStart)
    .replace(/\{\{EMOJIS_JSON\}\}/g, JSON.stringify(emojis))
    .replace(/\{\{IAPS_JSON\}\}/g, JSON.stringify(product.iap || []))
    // labels
    .replace(/\{\{BACK_LABEL\}\}/g, lbl.back)
    .replace(/\{\{AD_LABEL\}\}/g, lbl.adLbl)
    .replace(/\{\{AD_REMOVE_LABEL\}\}/g, lbl.adRemove)
    .replace(/\{\{MOVES_LBL\}\}/g, lbl.movesLbl)
    .replace(/\{\{TIME_LBL\}\}/g, lbl.timeLbl)
    .replace(/\{\{PAIRS_LBL\}\}/g, lbl.pairsLbl)
    .replace(/\{\{HINT_LBL\}\}/g, lbl.hintLbl)
    .replace(/\{\{HINT_LEFT_LBL\}\}/g, lbl.hintLeft)
    .replace(/\{\{RESTART_LBL\}\}/g, lbl.restartLbl)
    .replace(/\{\{WIN_TITLE\}\}/g, lbl.winTitle)
    .replace(/\{\{PLAY_AGAIN_LBL\}\}/g, lbl.playAgain)
    .replace(/\{\{FOCUS_LBL\}\}/g, lbl.focusLbl)
    .replace(/\{\{SHORT_LBL\}\}/g, lbl.shortLbl)
    .replace(/\{\{LONG_LBL\}\}/g, lbl.longLbl)
    .replace(/\{\{START_LBL\}\}/g, lbl.startLbl)
    .replace(/\{\{PAUSE_LBL\}\}/g, lbl.pauseLbl)
    .replace(/\{\{SESSIONS_LBL\}\}/g, lbl.sessionsLbl)
    .replace(/\{\{MINUTES_LBL\}\}/g, lbl.minutesLbl)
    .replace(/\{\{STREAK_LBL\}\}/g, lbl.streakLbl)
    .replace(/\{\{DONE_LBL\}\}/g, lbl.doneLbl);

  const outDir  = join(__dirname, 'public', 'games');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${product.slug}.html`), out, 'utf8');
  console.log(`✅ ${product.slug}.html`);
  return true;
}

// ── main ──────────────────────────────────────────────────────
const products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf8'));
const target   = process.argv[2];
const list     = target ? products.filter(p=>p.id===target||p.slug===target) : products.filter(p=>p.status==='available');

if (!list.length) { console.warn('⚠️ No products found'); process.exit(1); }
let ok=0;
list.forEach(p=>{ if(generate(p)) ok++; });
console.log(`\n🎮 Generated ${ok}/${list.length}`);
