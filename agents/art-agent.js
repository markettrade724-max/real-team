/**
 * art-agent.js
 * يولّد الهوية البصرية للعبة (ألوان، تدرجات، إيموجي)
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const PALETTES = [
  { accent:'#818cf8', accentRgb:'129,140,248', gradient:'135deg,#1e1b4b,#312e81', mood:'cosmic'    },
  { accent:'#f472b6', accentRgb:'244,114,182', gradient:'135deg,#1a0533,#831843', mood:'neon'      },
  { accent:'#34d399', accentRgb:'52,211,153',  gradient:'135deg,#022c22,#064e3b', mood:'nature'    },
  { accent:'#fbbf24', accentRgb:'251,191,36',  gradient:'135deg,#1c1007,#78350f', mood:'adventure' },
  { accent:'#60a5fa', accentRgb:'96,165,250',  gradient:'135deg,#030712,#1e3a5f', mood:'ocean'     },
  { accent:'#f87171', accentRgb:'248,113,113', gradient:'135deg,#1f0707,#7f1d1d', mood:'fire'      },
  { accent:'#a78bfa', accentRgb:'167,139,250', gradient:'135deg,#1e1b4b,#4c1d95', mood:'magic'     },
  { accent:'#2dd4bf', accentRgb:'45,212,191',  gradient:'135deg,#042830,#134e4a', mood:'tech'      },
];

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 512 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run(idea) {
  // اختر لوحة ألوان تناسب الفكرة
  const prompt = `
للعبة "${idea.name?.en}" من نوع "${idea.type}" بفكرة "${idea.concept}".
أي من هذه الأجواء البصرية يناسبها أكثر؟
${PALETTES.map((p, i) => `${i}: ${p.mood}`).join(', ')}
أجب برقم فقط (0-${PALETTES.length - 1}):`;

  const raw   = await gemini(prompt);
  const index = parseInt(raw.trim()) || 0;
  const palette = PALETTES[Math.min(index, PALETTES.length - 1)];

  // توليد إيموجي مناسبة
  const emojiPrompt = `
اقترح 12 إيموجي مناسبة تماماً للعبة "${idea.name?.en}" (${idea.type}).
الأجواء: ${palette.mood}
أجب بـ JSON فقط: ["e1","e2","e3","e4","e5","e6","e7","e8","e9","e10","e11","e12"]`;

  const emojiRaw   = await gemini(emojiPrompt);
  const emojiMatch = emojiRaw.match(/\[[\s\S]*\]/);
  const emojis     = emojiMatch ? JSON.parse(emojiMatch[0]).slice(0, 12) : ['🎮','⭐','🌟','💫','✨','🎯','🔮','💎','🌈','🎪','🎨','🎭'];

  const art = {
    gameId:     idea.id,
    mood:       palette.mood,
    accent:     palette.accent,
    accentRgb:  palette.accentRgb,
    gradient:   palette.gradient,
    emojis,
    generatedAt: new Date().toISOString(),
  };

  console.log(`🎨 Art: mood=${art.mood}, accent=${art.accent}`);
  console.log(`   Emojis: ${art.emojis.join(' ')}`);

  return art;
}
