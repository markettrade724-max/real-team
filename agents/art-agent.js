import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

// ... PALETTES as is ...

export async function run(idea) {
  try {
    const result = await askGemini(`...`, 0.8);
    
    // Validate paletteIndex
    let paletteIndex = Number(result.paletteIndex);
    if (isNaN(paletteIndex) || paletteIndex < 0 || paletteIndex >= PALETTES.length) {
      logger.warn('Invalid paletteIndex from Gemini, fallback to 0');
      paletteIndex = 0;
    }
    
    const palette = PALETTES[paletteIndex];
    
    // Validate emojis
    let emojis = [];
    if (Array.isArray(result.emojis)) {
      emojis = result.emojis.filter(e => typeof e === 'string').slice(0,12);
    }
    if (emojis.length === 0) {
      logger.warn('No valid emojis from Gemini, using empty');
    }
    
    const art = {
      gameId:    idea.id,
      mood:      palette.mood,
      accent:    palette.accent,
      accentRgb: palette.accentRgb,
      gradient:  palette.gradient,
      emojis,
      generatedAt: new Date().toISOString(),
    };
    
    logger.info('Art generated', { gameId: idea.id, mood: art.mood });
    return art;
  } catch (err) {
    logger.error('Art generation failed', { gameId: idea.id, error: err.message });
    // Return a default art object
    const fallback = PALETTES[0];
    return {
      gameId: idea.id,
      mood: fallback.mood,
      accent: fallback.accent,
      accentRgb: fallback.accentRgb,
      gradient: fallback.gradient,
      emojis: ['🎮'],
      generatedAt: new Date().toISOString(),
    };
  }
}
