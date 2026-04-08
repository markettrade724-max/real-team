/**
 * level-agent.js
 * يصمم مستويات متصاعدة الصعوبة للألعاب
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run(idea, story) {
  const prompt = `
أنت مصمم مستويات ألعاب خبير. صمم 5 مستويات متصاعدة الصعوبة للعبة "${idea.name?.en}".

معلومات:
- نوع اللعبة: ${idea.type}
- الهدف: ${story?.objective || idea.concept}
- الشخصية: ${story?.mainCharacter?.name || 'البطل'}

أجب بـ JSON فقط:
{
  "gameId": "${idea.id}",
  "totalLevels": 5,
  "emojis": ["إيموجي1", "إيموجي2", "إيموجي3", "إيموجي4", "إيموجي5", "إيموجي6", "إيموجي7", "إيموجي8", "إيموجي9", "إيموجي10", "إيموجي11", "إيموجي12"],
  "levels": [
    {
      "number": 1,
      "name": { "ar": "اسم المستوى", "en": "Level Name" },
      "difficulty": "easy",
      "pairs": 4,
      "timeLimit": 60,
      "description": { "ar": "وصف", "en": "Description" }
    },
    {
      "number": 2,
      "name": { "ar": "اسم المستوى", "en": "Level Name" },
      "difficulty": "medium",
      "pairs": 6,
      "timeLimit": 50,
      "description": { "ar": "وصف", "en": "Description" }
    },
    {
      "number": 3,
      "name": { "ar": "اسم المستوى", "en": "Level Name" },
      "difficulty": "medium",
      "pairs": 8,
      "timeLimit": 45,
      "description": { "ar": "وصف", "en": "Description" }
    },
    {
      "number": 4,
      "name": { "ar": "اسم المستوى", "en": "Level Name" },
      "difficulty": "hard",
      "pairs": 10,
      "timeLimit": 40,
      "description": { "ar": "وصف", "en": "Description" }
    },
    {
      "number": 5,
      "name": { "ar": "اسم المستوى", "en": "Level Name" },
      "difficulty": "expert",
      "pairs": 12,
      "timeLimit": 35,
      "description": { "ar": "وصف", "en": "Description" }
    }
  ]
}`;

  const raw   = await gemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid levels response');

  const levels = JSON.parse(match[0]);
  levels.generatedAt = new Date().toISOString();

  console.log(`🎯 Levels: ${levels.totalLevels} levels designed`);
  console.log(`   Emojis: ${levels.emojis?.join(' ')}`);

  return levels;
}
