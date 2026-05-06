// بداية الملف
const PRODUCTS_PATH = join(__dirname, '..', 'products.json');
const BACKUP_PATH = PRODUCTS_PATH + '.bak';
const GENERATOR_SCRIPT = join(__dirname, '..', 'game-generator.js');

function readProductsSafely() {
  try {
    if (!existsSync(PRODUCTS_PATH)) {
      logger.warn('products.json not found, creating new');
      return [];
    }
    return JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8'));
  } catch (err) {
    logger.error('Failed to read products.json', err);
    // محاولة استرجاع النسخة الاحتياطية
    if (existsSync(BACKUP_PATH)) {
      logger.warn('Restoring from backup');
      return JSON.parse(readFileSync(BACKUP_PATH, 'utf8'));
    }
    return [];
  }
}

function writeProductsSafely(products) {
  try {
    // نسخ احتياطي
    if (existsSync(PRODUCTS_PATH)) {
      writeFileSync(BACKUP_PATH, readFileSync(PRODUCTS_PATH));
    }
    writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf8');
  } catch (err) {
    logger.error('Failed to write products.json', err);
    throw err; // دع المستدعي يتعامل معه
  }
}

export async function run(idea, story, levels, art, templateData) {
  const products = readProductsSafely();

  if (products.find(p => p.id === idea.id)) {
    logger.info('Product already exists — skipped', { id: idea.id });
    return { skipped: true, id: idea.id };
  }

  const templateFile = selectTemplate(idea, templateData);
  logger.info('Template selected', { id: idea.id, type: idea.type, template: templateFile });

  const product = {
    id: idea.id,
    slug: idea.id,
    type: idea.type,
    category: idea.category,
    status: 'available',
    emoji: idea.emoji,
    templateFile,
    accent: art?.accent || '#facc15',
    accentRgb: art?.accentRgb || '250,204,21',
    gradient: art?.gradient || '135deg,#0f172a,#1e293b',
    emojis: art?.emojis || templateData?.emojis || [],
    name: idea.name,
    desc: idea.desc,
    tags: idea.tags || [],
    iap: DEFAULT_IAPS, // بعد تصحيح 提示
    story: story ? {
      setting: story.setting,
      mainCharacter: story.mainCharacter,
      objective: story.objective,
      intro: story.intro,
      winMessage: story.winMessage,
      loseMessage: story.loseMessage,
    } : null,
    levels: templateData?.levels || levels || null, // تبسيط
    generated: true,
    generatedAt: new Date().toISOString(),
  };

  products.push(product);
  writeProductsSafely(products);
  logger.info('Product added', { id: idea.id, template: templateFile });

  // تشغيل game-generator (إذا كان موجوداً)
  if (existsSync(GENERATOR_SCRIPT)) {
    try {
      execSync(`node ${GENERATOR_SCRIPT} ${idea.id}`, {
        cwd: join(__dirname, '..'),
        stdio: 'inherit',
      });
      logger.info('Game built', { id: idea.id });
    } catch (err) {
      logger.warn('game-generator failed', { error: err.message });
    }
  } else {
    logger.warn('game-generator script not found, skipping build');
  }

  return { success: true, id: idea.id, template: templateFile };
}
