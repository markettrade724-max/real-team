// ══════════════════════════════════════════
// world-evolution-agent.js — عالم جديد كل يوم
// الهدف: 365 عالماً في السنة
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

const YEARLY_TARGET = 365;

export async function run(universe) {
  const currentCount = universe.worlds?.length || 0;
  const dayOfYear    = getDayOfYear();
  const behind       = dayOfYear - currentCount;

  logger.info('World evolution', {
    universeId:    universe.id,
    worldsCount:   currentCount,
    dayOfYear,
    target:        YEARLY_TARGET,
    behind:        behind > 0 ? behind : 0,
  });

  const soul          = soulContext('levelAgent');
  const existingNames = universe.worlds?.map(w => w.name?.en).join(', ') || 'none';

  const world = await askGemini(`
${soul}

أنت مصمم أكوان. مهمتك: عالم واحد كل يوم — 365 عالماً في السنة.
الكون: "${universe.name?.en}"
جوهره: "${universe.soul?.essence}"
العوالم الموجودة (${currentCount}/${YEARLY_TARGET}): ${existingNames}
اليوم رقم: ${dayOfYear} من السنة

هذا العالم هو العالم رقم ${currentCount + 1}.
${behind > 0 ? `تأخرنا ${behind} يوم — اجعله استثنائياً بشكل خاص.` : ''}

القانون الذهبي:
- لا يشبه أي عالم سبق — لا في الفيزياء، لا في الجو، لا في المنطق
- كل عالم له هوية بصرية فريدة تماماً
- كل 30 عالم يجب أن تشكل "فصلاً" له طابع مختلف عن الفصول الأخرى

الفصل الحالي: ${getChapterName(currentCount)}
طابع هذا الفصل: ${getChapterTheme(currentCount)}

أنتج JSON:
{
  "id": "world-${currentCount + 1}",
  "dayNumber": ${currentCount + 1},
  "chapter": ${Math.ceil((currentCount + 1) / 30)},
  "chapterName": "${getChapterName(currentCount)}",
  "name": { "ar": "", "en": "" },
  "essence": "جوهر هذا العالم في كلمة",
  "physics": "قانون فيزيائي فريد لم يظهر في أي عالم سابق",
  "atmosphere": "كيف يبدو ويُحس ويُشم",
  "secret": "سر مخفي لا يكتشفه إلا من يستحق",
  "enemyBehavior": "كيف يتصرف الأعداء هنا بمنطق خاص",
  "playerAbility": "قدرة جديدة تُكتسب في هذا العالم فقط",
  "backgroundColor": "#hex",
  "fogColor": "#hex",
  "lightColor": "#hex",
  "enemySpeed": 0.0,
  "enemyHealth": 0,
  "enemyCount": 0,
  "difficulty": "easy|medium|hard|expert|legendary",
  "addedAt": "${new Date().toISOString()}"
}`, 0.95, { topP: 0.97, topK: 60 });

  logger.info('World created', {
    number:  currentCount + 1,
    name:    world.name?.en,
    chapter: world.chapter,
    physics: world.physics,
  });

  return world;
}

// ── الأيام والفصول ────────────────────────
function getDayOfYear() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

function getChapterName(worldIndex) {
  const chapters = [
    'Genesis',       // 1-30
    'The Fracture',  // 31-60
    'Memory Tides',  // 61-90
    'Void Currents', // 91-120
    'Crystal Age',   // 121-150
    'The Awakening', // 151-180
    'Shadow Flux',   // 181-210
    'Resonance',     // 211-240
    'The Collapse',  // 241-270
    'Rebirth',       // 271-300
    'The Silence',   // 301-330
    'Transcendence', // 331-365
  ];
  return chapters[Math.floor(worldIndex / 30)] || 'Transcendence';
}

function getChapterTheme(worldIndex) {
  const themes = [
    'البداية والولادة — عوالم تشكّل من لا شيء',
    'الكسر والتحول — عوالم حدث فيها شيء لا يمكن تفسيره',
    'الذاكرة والماضي — عوالم تحمل أثر ما كان',
    'الفراغ والغياب — عوالم بنيت على ما لا يوجد',
    'البلوّر والتبلور — عوالم من طاقة متصلبة',
    'الصحو والوعي — عوالم بدأت تدرك أنها موجودة',
    'الظلال والانعكاس — عوالم مبنية على الظل وليس على الضوء',
    'الرنين والتردد — عوالم تسمع وتتجاوب',
    'الانهيار والتفكك — عوالم في لحظتها الأخيرة',
    'الولادة الثانية — عوالم ولدت من رماد ما سبق',
    'الصمت المطبق — عوالم حيث لا شيء يتحرك ولا شيء يموت',
    'التجاوز والانعتاق — عوالم وصلت إلى ما وراء الوجود',
  ];
  return themes[Math.floor(worldIndex / 30)] || themes[themes.length - 1];
}
