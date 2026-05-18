// ══════════════════════════════════════════
// enemy-evolution-agent.js — عدو جديد
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe) {
  logger.info('Evolving new enemy', { universeId: universe.id });

  const soul           = soulContext('godotAgent');
  const existingEnemies = universe.enemies?.map(e => e.name?.en).join(', ') || 'none';

  const enemy = await askGemini(`
${soul}

أنت خالق الكائنات. اخلق عدواً لم يُتخيَّل من قبل.
الكون: "${universe.name?.en}"
جوهره: "${universe.soul?.essence}"
الأعداء الموجودون: ${existingEnemies}

الأعداء ليسوا أشراراً — هم منطق مختلف من كون موازٍ.
كل عدو يحمل فلسفة خاصة به وسبباً وجودياً.

أنتج JSON:
{
  "id": "enemy-${Date.now()}",
  "name": { "ar": "", "en": "" },
  "species": "نوع الكائن وأصله الكوني",
  "philosophy": "لماذا يوجد هذا الكائن — فلسفته الخاصة",
  "behavior": "كيف يفكر ويتخذ القرارات في المعركة",
  "weakness": "نقطة ضعفه الوحيدة — ليس مجرد عنصر بل منطق",
  "visualDesc": "كيف يبدو — شكله المذهل وغير المتوقع",
  "sound": "الصوت الذي يصدره — يجب أن يكون مميزاً",
  "speed": 0.0,
  "health": 0.0,
  "damage": 0.0,
  "attackPattern": "نمط الهجوم الفريد الذي لا يشبه أي عدو آخر",
  "rarity": "common|rare|legendary|cosmic",
  "addedAt": "${new Date().toISOString()}"
}`, 0.95, { topP: 0.97, topK: 60 });

  logger.info('New enemy created', { name: enemy.name?.en, philosophy: enemy.philosophy });
  return enemy;
}
