import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

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

export async function run(idea) {
  const result = await askGemini(`
For game "${idea.name?.en}" (${idea.type}), concept: "${idea.concept}".
Choose the best visual mood from: ${PALETTES.map((p,i)=>`${i}:${p.mood}`).join(', ')}
Also suggest 12 thematic emojis.
Return ONLY valid JSON:
{ "paletteIndex": 0, "emojis": ["e1","e2","e3","e4","e5","e6","e7","e8","e9","e10","e11","e12"] }
`, 0.8);

  const palette = PALETTES[result.paletteIndex] || PALETTES[0];
  const art = {
    gameId:    idea.id,
    mood:      palette.mood,
    accent:    palette.accent,
    accentRgb: palette.accentRgb,
    gradient:  palette.gradient,
    emojis:    result.emojis?.slice(0,12) || [],
    generatedAt: new Date().toISOString(),
  };

  logger.info('Art generated', { gameId: idea.id, mood: art.mood, accent: art.accent });
  return art;
}
