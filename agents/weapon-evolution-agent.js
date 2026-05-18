// ══════════════════════════════════════════
// weapon-evolution-agent.js — سلاح جديد
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe) {
  logger.info('Evolving new weapon', { universeId: universe.id });

  const soul            = soulContext('godotAgent');
  const existingWeapons = universe.weapons?.map(w => w.name?.en).join(', ') || 'none';

  const weapon = await askGemini(`
${soul}

أنت مخترع أسلحة كونية. اخترع سلاحاً لم يوجد من قبل.
الكون: "${universe.name?.en}"
قوانينه: "${universe.soul?.rules?.join(' | ')}"
الأسلحة الموجودة: ${existingWeapons}

السلاح ليس أداة قتل فقط — بل أداة تغيير الواقع.
يمكنه أن يغير الزمن، يعيد كتابة المكان، يتحدث مع الأعداء.

أنتج JSON:
{
  "id": "weapon-${Date.now()}",
  "name": { "ar": "", "en": "" },
  "concept": "المفهوم الفلسفي الذي يقوم عليه هذا السلاح",
  "visualDesc": "كيف يبدو — شكله، لونه، كيف يتحرك",
  "sound": "كيف يبدو صوته حين يُستخدم",
  "effect": "ماذا يفعل للعدو — ليس الضرر فقط بل التحول",
  "sideEffect": "أثر جانبي غير متوقع على اللاعب أو العالم",
  "damage": 0.0,
  "fireRate": 0.0,
  "bulletSpeed": 0.0,
  "rarity": "common|rare|legendary|cosmic",
  "addedAt": "${new Date().toISOString()}"
}`, 0.95, { topP: 0.97, topK: 60 });

  logger.info('New weapon created', { name: weapon.name?.en, concept: weapon.concept });
  return weapon;
}
