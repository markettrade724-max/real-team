// ══════════════════════════════════════════
// vehicle-evolution-agent.js — وسيلة نقل
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe) {
  logger.info('Evolving new vehicle', { universeId: universe.id });

  const soul             = soulContext('godotAgent');
  const existingVehicles = universe.vehicles?.map(v => v.name?.en).join(', ') || 'none';

  const vehicle = await askGemini(`
${soul}

أنت مهندس وسائل النقل الكونية. اخترع وسيلة نقل تكسر قانون الحركة.
الكون: "${universe.name?.en}"
قوانينه: "${universe.soul?.rules?.join(' | ')}"
وسائل النقل الموجودة: ${existingVehicles}

وسيلة النقل ليست مجرد سرعة — بل طريقة مختلفة للوجود في المكان.
يمكنها أن تتحرك في الزمن، بين الأبعاد، داخل الذاكرة، عبر الضوء.

أنتج JSON:
{
  "id": "vehicle-${Date.now()}",
  "name": { "ar": "", "en": "" },
  "concept": "المفهوم الذي تقوم عليه — ليس مجرد آلة",
  "movementType": "كيف تتحرك — نوع الحركة الفريد",
  "visualDesc": "شكلها المذهل الذي يبهر العين",
  "sound": "صوتها حين تتحرك",
  "specialAbility": "قدرة خاصة تمنحها للاعب",
  "limitation": "قيد واحد — لأن كل شيء عظيم له ثمن",
  "speed": 0.0,
  "handling": "sluggish|normal|agile|telekinetic",
  "rarity": "common|rare|legendary|cosmic",
  "addedAt": "${new Date().toISOString()}"
}`, 0.95, { topP: 0.97, topK: 60 });

  logger.info('New vehicle created', { name: vehicle.name?.en, concept: vehicle.concept });
  return vehicle;
}
