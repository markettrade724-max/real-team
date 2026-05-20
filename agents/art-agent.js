import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

const PALETTES = [
  { mood: 'dark',    accent: '#FF4444', accentRgb: '255,68,68',   gradient: 'linear-gradient(135deg,#1a1a2e,#16213e)' },
  { mood: 'cosmic',  accent: '#A855F7', accentRgb: '168,85,247',  gradient: 'linear-gradient(135deg,#0f0c29,#302b63)' },
  { mood: 'neon',    accent: '#00FF88', accentRgb: '0,255,136',   gradient: 'linear-gradient(135deg,#0a0a0a,#1a1a1a)' },
  { mood: 'fire',    accent: '#FF6B35', accentRgb: '255,107,53',  gradient: 'linear-gradient(135deg,#1a0a00,#2d1200)' },
  { mood: 'ice',     accent: '#00D4FF', accentRgb: '0,212,255',   gradient: 'linear-gradient(135deg,#001428,#002952)' },
  { mood: 'gold',    accent: '#FFD700', accentRgb: '255,215,0',   gradient: 'linear-gradient(135deg,#1a1400,#2d2200)' },
  { mood: 'blood',   accent: '#CC0000', accentRgb: '204,0,0',     gradient: 'linear-gradient(135deg,#1a0000,#2d0000)' },
  { mood: 'forest',  accent: '#22C55E', accentRgb: '34,197,94',   gradient: 'linear-gradient(135deg,#001a00,#002d00)' },
  { mood: 'ocean',   accent: '#0EA5E9', accentRgb: '14,165,233',  gradient: 'linear-gradient(135deg,#00141a,#00202d)' },
  { mood: 'sand',    accent: '#F59E0B', accentRgb: '245,158,11',  gradient: 'linear-gradient(135deg,#1a1200,#2d1e00)' },
  { mood: 'void',    accent: '#8B5CF6', accentRgb: '139,92,246',  gradient: 'linear-gradient(135deg,#05000f,#0a0020)' },
  { mood: 'steel',   accent: '#94A3B8', accentRgb: '148,163,184', gradient: 'linear-gradient(135deg,#0f1117,#1e2130)' },
];

export async function run(idea) {
  try {
    const result = await askGemini(`
أنت مصمم بصري لكون رقمي.
اللعبة: "${idea.name?.en}"
النوع: "${idea.type}"
الوصف: "${idea.desc?.en}"

اختر الهوية البصرية المناسبة وأنتج JSON فقط:
{
  "paletteIndex": <رقم من 0 إلى ${PALETTES.length - 1}>,
  "emojis": ["...", "...", "..."]
}

الحالات المتاحة:
${PALETTES.map((p, i) => `${i}: ${p.mood}`).join('\n')}

القواعد:
- paletteIndex يجب أن يكون رقماً صحيحاً بين 0 و ${PALETTES.length - 1}
- emojis مصفوفة من 3 إلى 12 رمز تعبيري يعكس روح اللعبة
- أنتج JSON فقط بدون أي نص إضافي
`, 0.8);

    // التحقق من paletteIndex
    let paletteIndex = Number(result.paletteIndex);
    if (isNaN(paletteIndex) || paletteIndex < 0 || paletteIndex >= PALETTES.length) {
      logger.warn('Invalid paletteIndex from Gemini, fallback to 0');
      paletteIndex = 0;
    }

    const palette = PALETTES[paletteIndex];

    // التحقق من emojis
    let emojis = [];
    if (Array.isArray(result.emojis)) {
      emojis = result.emojis.filter(e => typeof e === 'string').slice(0, 12);
    }
    if (emojis.length === 0) {
      logger.warn('No valid emojis from Gemini, using default');
      emojis = ['🎮'];
    }

    const art = {
      gameId:      idea.id,
      mood:        palette.mood,
      accent:      palette.accent,
      accentRgb:   palette.accentRgb,
      gradient:    palette.gradient,
      emojis,
      generatedAt: new Date().toISOString(),
    };

    logger.info('Art generated', { gameId: idea.id, mood: art.mood });
    return art;

  } catch (err) {
    logger.error('Art generation failed', { gameId: idea.id, error: err.message });

    // fallback آمن
    const fallback = PALETTES[0];
    return {
      gameId:      idea.id,
      mood:        fallback.mood,
      accent:      fallback.accent,
      accentRgb:   fallback.accentRgb,
      gradient:    fallback.gradient,
      emojis:      ['🎮'],
      generatedAt: new Date().toISOString(),
    };
  }
}
