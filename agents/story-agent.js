/**
 * story-agent.js
 * يكتب قصة وشخصيات لكل لعبة
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1500 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run(idea) {
  const prompt = `
أنت كاتب قصص ألعاب محترف. اكتب قصة قصيرة ومثيرة للعبة "${idea.name?.en}" من نوع "${idea.type}".

معلومات اللعبة:
- الفكرة: ${idea.concept}
- ما يميزها: ${idea.uniqueFeature}
- الجمهور: ${idea.targetAudience}

أجب بـ JSON فقط:
{
  "gameId": "${idea.id}",
  "setting": "مكان وزمان أحداث اللعبة",
  "mainCharacter": {
    "name": "اسم الشخصية",
    "emoji": "إيموجي يمثلها",
    "description": "وصف الشخصية"
  },
  "villain": {
    "name": "اسم الخصم (اختياري)",
    "emoji": "إيموجي",
    "description": "وصف الخصم"
  },
  "objective": "هدف اللاعب في اللعبة",
  "intro": {
    "ar": "مقدمة اللعبة بالعربية (3 جمل)",
    "en": "Game intro in English (3 sentences)"
  },
  "winMessage": {
    "ar": "رسالة الفوز بالعربية",
    "en": "Win message in English"
  },
  "loseMessage": {
    "ar": "رسالة الخسارة بالعربية",
    "en": "Lose message in English"
  }
}`;

  const raw   = await gemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid story response');

  const story = JSON.parse(match[0]);
  story.generatedAt = new Date().toISOString();

  console.log(`📖 Story: "${story.mainCharacter?.name}" vs "${story.villain?.name}"`);
  console.log(`   Setting: ${story.setting}`);

  return story;
}
