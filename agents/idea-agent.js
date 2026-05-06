export async function run() {
  // 1. قراءة آمنة
  const products = loadJSON(join(__dirname,'..','products.json')) || [];
  const existingIds = products.map(p=>p.id).join(', ');

  const roadmap  = loadJSON(join(__dirname,'..','agent-results','roadmap.json'));
  const feedback = loadJSON(join(__dirname,'..','agent-results','feedback.json'));
  const analytics= loadJSON(join(__dirname,'..','agent-results','analytics.json'));

  // تحذير في حال عدم وجود بيانات التعلم
  if (!roadmap && !feedback && !analytics) {
    logger.warn('No agent-results found — running without learning data');
  }

  const learnings = `...`; // كما هو

  // 2. استدعاء Gemini مع حماية
  let idea;
  try {
    idea = await askGemini(`...`, 0.9); // خفض درجة الحرارة قليلاً
  } catch (err) {
    logger.error('Gemini failed to generate idea', err);
    throw new Error('Idea generation failed: ' + err.message);
  }

  // 3. تحقق شامل
  if (!idea || typeof idea !== 'object') throw new Error('Invalid JSON from Gemini');
  if (!idea.id || !idea.name?.en || !idea.category || !['game','app'].includes(idea.category)) {
    throw new Error(`Missing or invalid core fields: ${JSON.stringify(idea)}`);
  }

  // 4. ضمان تفرد id بشكل قوي
  while (products.find(p => p.id === idea.id)) {
    idea.id = idea.id + '-' + Date.now().toString(36);
  }

  idea.generatedAt = new Date().toISOString();
  idea.generatedBy = 'idea-agent-v2-learning';

  logger.info('Idea generated', { id: idea.id, type: idea.type, name: idea.name.en });
  return idea;
}
