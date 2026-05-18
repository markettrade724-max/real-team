// ══════════════════════════════════════════
// world-evolution-agent.js — عالم جديد
// ══════════════════════════════════════════
import { askGemini }  from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger }      from '../logger.js';

export async function run(universe) {
  logger.info('Evolving new world', { universeId: universe.id });

  const soul         = soulContext('levelAgent');
  const existingWorlds = universe.worlds?.map(w => w.name?.en).join(', ') || 'none';

  const world = await askGemini(`
${soul}

أنت مصمم أكوان. أضف عالماً جديداً لهذا الكون.
الكون: "${universe.name?.en}"
جوهره: "${universe.soul?.essence}"
العوالم الموجودة: ${existingWorlds}

القانون الذهبي: هذا العالم يجب أن يكون مختلفاً كلياً عن كل ما سبق.
لا تكرر فيزياء، لا تكرر جواً، لا تكرر منطقاً.

أنتج JSON:
{
  "id": "world-${Date.now()}",
  "name": { "ar": "", "en": "" },
  "essence": "جوهر هذا العالم في كلمة",
  "physics": "قانون فيزيائي فريد لم يظهر في أي عالم سابق",
  "atmosphere": "كيف يبدو ويُحس ويُشم",
  "secret": "سر مخفي في هذا العالم لا يكتشفه إلا من يستحق",
  "enemyBehavior": "كيف يتصرف الأعداء هنا — منطق خاص بهذا العالم",
  "playerAbility": "قدرة جديدة يكتسبها اللاعب في هذا العالم فقط",
  "backgroundColor": "#hex",
  "fogColor": "#hex",
  "lightColor": "#hex",
  "enemySpeed": 0.0,
  "enemyHealth": 0,
  "enemyCount": 0,
  "difficulty": "easy|medium|hard|expert|legendary",
  "addedAt": "${new Date().toISOString()}"
}`, 0.95, { topP: 0.97, topK: 60 });

  logger.info('New world created', { name: world.name?.en, physics: world.physics });
  return world;
}
