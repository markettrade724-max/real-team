import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة القوالب ─────────────────────────────────────────────
const TEMPLATE_MAP = {
  memory:'memory-game.html', puzzle:'memory-game.html',
  word:'memory-game.html',   quiz:'memory-game.html',
  matching:'memory-game.html', trivia:'memory-game.html',
  racing:'racing-game.html', race:'racing-game.html',
  speed:'racing-game.html',  car:'racing-game.html',
  sport:'sports-game.html',  football:'sports-game.html',
  basketball:'sports-game.html', tennis:'sports-game.html',
  soccer:'sports-game.html',
  arcade:'phaser-game.html', shooter:'phaser-game.html',
  action:'phaser-game.html', space:'phaser-game.html',
  bullet:'phaser-game.html', battle:'phaser-game.html',
  defense:'phaser-game.html', survival:'phaser-game.html',
  rpg:'adventure-rpg.html',  adventure:'adventure-rpg.html',
  story:'adventure-rpg.html', quest:'adventure-rpg.html',
  narrative:'adventure-rpg.html', dungeon:'adventure-rpg.html',
  tool:'tool-app.html', app:'tool-app.html',
  timer:'tool-app.html', focus:'tool-app.html',
  generator:'tool-app.html', creative:'tool-app.html',
};

// ── كلمات مفتاحية للكشف الذكي (مُحسَّنة) ─────────────────────
const SMART_RULES = [
  {
    template: 'racing-game.html',
    keywords: ['racing','race','speed','car','drift','moto','drive',
               'vehicle','kart','formula','nascar','rally','turbo','lap'],
  },
  {
    template: 'sports-game.html',
    keywords: ['sport','football','soccer','basketball','tennis',
               'baseball','hockey','cricket','golf','rugby','match',
               'stadium','goal','league','championship'],
  },
  {
    // ألعاب الأكشن والشوتر فقط - بدون كلمات عامة
    template: 'phaser-game.html',
    keywords: ['shooter','shoot','bullet','blast','enemy','wave',
               'invasion','defense','tower','arena','space','alien',
               'battle','combat','fighter','retro','pixel','survival',
               'mischief','chaos','punchline'],
  },
  {
    template: 'adventure-rpg.html',
    keywords: ['rpg','adventure','quest','dungeon','hero','sword',
               'magic','fantasy','myth','legend','saga','lore',
               'kingdom','character','role'],
  },
  {
    template: 'tool-app.html',
    keywords: ['tool','app','timer','focus','pomodoro','tracker',
               'journal','art','creative','generative','visual',
               'paint','draw','ai','generator','create','design',
               'mood','emotion','identity','avatar','mirror','prism',
               'echo','vibe','aura','luminal','moment','reality',
               'weaver','mythos','anima','alternate','universe',
               'genre','shift','creator','content','viral','meme'],
  },
  {
    template: 'memory-game.html',
    keywords: ['memory','puzzle','quiz','matching','trivia','word',
               'brain','logic','illusion','perspective','optical',
               'glimmerglass','paradox','gravity','causality',
               'uninvention'],
  },
];

// ── حل القالب بذكاء ───────────────────────────────────────────
function resolveTemplate(product) {
  // 🔥 الأولوية القصوى: product.templateFile إذا كان موجوداً
  if (product.templateFile) {
    const tplPath = join(__dirname, 'templates', product.templateFile);
    if (existsSync(tplPath)) {
      console.log(`  📌 Using stored template: ${product.templateFile}`);
      return product.templateFile;
    }
    console.warn(`  ⚠️  Stored template not found: ${product.templateFile}, falling back...`);
  }

  const typeRaw = (product.type || '').toLowerCase().trim();

  // 1. مطابقة حرفية مباشرة
  if (TEMPLATE_MAP[typeRaw]) return TEMPLATE_MAP[typeRaw];

  // 2. الـ type يحتوي على كلمة مفتاحية معروفة
  for (const [key, tpl] of Object.entries(TEMPLATE_MAP)) {
    if (typeRaw.includes(key)) return tpl;
  }

  // 3. تحليل الكلمات الكاملة في type + tags + slug
  const corpus = [
    typeRaw,
    (product.slug || '').toLowerCase().replace(/-/g,' '),
    ...(product.tags || []).map(t => t.toLowerCase()),
    (product.category || '').toLowerCase(),
  ].join(' ');

  let bestTemplate = null, bestScore = 0;
  for (const rule of SMART_RULES) {
    const score = rule.keywords.reduce((s, kw) =>
      corpus.includes(kw) ? s + 1 : s, 0);
    if (score > bestScore) { bestScore = score; bestTemplate = rule.template; }
  }

  // 4. Fallback حسب category
  if (!bestTemplate || bestScore === 0) {
    bestTemplate = product.category === 'game'
      ? 'phaser-game.html'
      : 'tool-app.html';
    console.warn(`  ⚠️  Fallback: "${product.type}" → ${bestTemplate}`);
  } else {
    console.log(`  🧠 Smart resolve: → ${bestTemplate} (score:${bestScore})`);
  }

  return bestTemplate;
}

// ── دالة مساعدة للترجمات الآمنة ───────────────────────────────
function ensureLang(obj, fallbackOrder = ['en','ar','fr','es','de','zh']) {
  if (!obj) return {};
  const LANGS = ['ar','en','fr','es','de','zh'];
  const result = {};
  LANGS.forEach(l => {
    result[l] = obj[l];
    if (!result[l]) {
      for (const fb of fallbackOrder) {
        if (obj[fb]) { result[l] = obj[fb]; break; }
      }
    }
    result[l] = result[l] || '';
  });
  return result;
}

// ── توليد لعبة واحدة ──────────────────────────────────────────
function generate(product) {
  const tplName = resolveTemplate(product);
  const tplPath = join(__dirname, 'templates', tplName);
  
  let tpl;
  try {
    tpl = readFileSync(tplPath, 'utf8');
  } catch(e) {
    console.error(`  ❌ Template missing: ${tplName}`);
    return false;
  }

  const safeName   = ensureLang(product.name);
  const safeDesc   = ensureLang(product.desc);
  const safeStory  = ensureLang(product.story?.intro || {});
  const safeWin    = ensureLang(product.story?.winMessage || {});
  const safeLose   = ensureLang(product.story?.loseMessage || {});
  
  // 🔥 تأكد من أن emojis دائماً مصفوفة صالحة
  let emojis = product.emojis;
  if (!Array.isArray(emojis) || emojis.length === 0) {
    emojis = ['🎮','⭐','🔥','💎','🚀','🌟','🎯','🎪','🎨','🎭','🔮','💡'];
  }
  emojis = emojis.slice(0, 12);

  // 🔥 تأكد من أن levels دائماً مصفوفة صالحة
  let levels = product.levels;
  if (!Array.isArray(levels) || levels.length === 0) {
    // مستويات افتراضية حسب القالب
    if (tplName === 'phaser-game.html') {
      levels = [
        { enemyCount:8,  enemySpeed:1.3, enemyHealth:1 },
        { enemyCount:11, enemySpeed:1.6, enemyHealth:1 },
        { enemyCount:14, enemySpeed:1.9, enemyHealth:2 },
        { enemyCount:17, enemySpeed:2.2, enemyHealth:2 },
        { enemyCount:20, enemySpeed:2.5, enemyHealth:3 },
      ];
    } else if (tplName === 'memory-game.html') {
      levels = [
        { number:1, name:{ar:'١',en:'1'}, difficulty:'easy',   pairs:4,  timeLimit:60 },
        { number:2, name:{ar:'٢',en:'2'}, difficulty:'medium', pairs:6,  timeLimit:50 },
        { number:3, name:{ar:'٣',en:'3'}, difficulty:'medium', pairs:8,  timeLimit:45 },
        { number:4, name:{ar:'٤',en:'4'}, difficulty:'hard',   pairs:10, timeLimit:40 },
        { number:5, name:{ar:'٥',en:'5'}, difficulty:'expert', pairs:12, timeLimit:35 },
      ];
    } else if (tplName === 'adventure-rpg.html') {
      levels = [{}];
    }
    console.log(`  ℹ️  Using default levels for ${tplName}`);
  }

  const outDir = join(__dirname, 'public', 'games');
  mkdirSync(outDir, { recursive: true });

  const LANGS = ['ar','en','fr','es','de','zh'];
  let built = 0;

  LANGS.forEach(lang => {
    const lbl  = LABELS[lang];
    const name = safeName[lang];
    const desc = safeDesc[lang];

    let out = tpl;

    const vars = {
      LANG:          lang,
      DIR:           lbl?.dir || 'ltr',
      PRODUCT_ID:    product.id,
      PRODUCT_TYPE:  product.type,
      GAME_NAME:     name,
      GAME_DESC:     desc,
      EMOJI:         product.emoji || '🎮',
      ACCENT:        product.accent || '#facc15',
      ACCENT_RGB:    product.accentRgb || '250,204,21',
      IAPS_JSON:     JSON.stringify(product.iap || []),
      EMOJIS_JSON:   JSON.stringify(emojis),
      LEVELS_JSON:   JSON.stringify(levels),
      LEVELS_COUNT:  levels.length || 1,
      STORY_JSON:    JSON.stringify(product.story || {}),
      LABELS_JSON:   JSON.stringify(product.labels || lbl || {}),
      ...(lbl || {}),
    };

    Object.entries(vars).forEach(([k, v]) => {
      out = out.split(`{{${k}}}`).join(String(v ?? ''));
    });

    const filename = lang === 'ar'
      ? `${product.slug}.html`
      : `${product.slug}-${lang}.html`;

    writeFileSync(join(outDir, filename), out, 'utf8');
    built++;
  });

  console.log(`  ✅ ${product.slug} → ${tplName} × ${built} languages`);
  return true;
}

// ── main ──────────────────────────────────────────────────────
function main() {
  let products;
  try {
    products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf8'));
  } catch(e) {
    console.error('❌ Cannot read products.json');
    process.exit(1);
  }

  const target = process.argv[2];
  const list = target
    ? products.filter(p => p.id === target || p.slug === target)
    : products.filter(p => p.status === 'available');

  if (!list.length) {
    console.warn('⚠️  No products to generate');
    process.exit(0);
  }

  const gamesDir = join(__dirname, 'public', 'games');
  rmSync(gamesDir, { recursive: true, force: true });
  console.log('🗑️  Cleaned old games directory\n');

  let ok = 0;
  list.forEach(p => {
    if (generate(p)) ok++;
  });

  console.log(`\n🎮 Generated: ${ok}/${list.length} × 6 languages = ${ok * 6} files`);
}

main();
