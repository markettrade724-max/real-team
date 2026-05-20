// ══════════════════════════════════════════
// player-memory.js
// ══════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import { askGemini }    from './_gemini.js';
import { logger }       from '../logger.js';

export async function run(universe, playerId) {
  if (!playerId) {
    logger.warn('player-memory: no playerId');
    return universe;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn('player-memory: Supabase credentials missing');
    return universe;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // قراءة ذاكرة اللاعب
  let memory = null;
  try {
    const { data } = await supabase
      .from('player_memory')
      .select('*')
      .eq('player_id', playerId)
      .single();
    memory = data;
  } catch {
    logger.info('player-memory: new player', { playerId });
  }

  const preferences = memory?.preferences || 'no preferences yet';

  const suggestion = await askGemini(`
Universe: "${universe.name?.en}"
Soul: "${universe.soul?.essence}"
Player preferences: ${preferences}

Based on this player's history, suggest one evolution for their personal universe.
Return JSON only:
{
  "type": "world|weapon|enemy|vehicle",
  "name": { "ar": "", "en": "" },
  "reason": "why this fits this player",
  "personalEssence": "one word that defines this player's journey"
}`, 0.85, { topP: 0.95 }); // ✅ إصلاح

  // حفظ الذاكرة
  try {
    await supabase.from('player_memory').upsert({
      player_id:       playerId,
      universe_id:     universe.id,
      preferences,
      last_suggestion: suggestion,
      updated_at:      new Date().toISOString(),
    });
  } catch (err) {
    logger.error('player-memory: save failed', { error: err.message });
  }

  universe.playerSuggestion = suggestion;
  logger.info('Player memory updated', { playerId, type: suggestion?.type });
  return universe;
}
