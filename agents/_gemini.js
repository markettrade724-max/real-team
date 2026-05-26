/**
 * _gemini.js — Gemini 2.5 Flash
 * مع retry تلقائي عند 503 و 429
 */
import { GoogleGenAI } from '@google/genai';
import { logger }      from '../logger.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const RETRY_DELAYS = [30000, 60000, 120000]; // 30s, 60s, 120s

/**
 * @param {string} prompt
 * @param {number} temperature
 * @param {object} options
 * @param {number} _retry — داخلي فقط
 */
export async function askGemini(prompt, temperature = 0.9, options = {}, _retry = 0) {
  const {
    topP             = undefined,
    topK             = undefined,
    maxOutputTokens  = 4096,
    frequencyPenalty = undefined,
    presencePenalty  = undefined,
  } = options;

  const config = {
    temperature,
    maxOutputTokens,
    responseMimeType: 'application/json',
  };
  if (topP             !== undefined) config.topP             = topP;
  if (topK             !== undefined) config.topK             = topK;
  if (frequencyPenalty !== undefined) config.frequencyPenalty = frequencyPenalty;
  if (presencePenalty  !== undefined) config.presencePenalty  = presencePenalty;

  let response;
  try {
    response = await ai.models.generateContent({
      model:    'gemini-2.5-flash',
      contents: prompt,
      config,
    });
  } catch (err) {
    const is503 = err.message.includes('503');
    const is429 = err.message.includes('429');

    if ((is503 || is429) && _retry < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[_retry];
      logger.warn(`[RETRY] ${is503 ? '503' : '429'} — attempt ${_retry + 1}/3 — waiting ${delay/1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      return askGemini(prompt, temperature, options, _retry + 1);
    }

    logger.error('[ERROR] Gemini API call failed', { error: err.message });
    throw new Error('Gemini API call failed: ' + err.message);
  }

  // استخراج النص
  let text = '';
  try {
    if (typeof response.text === 'function')    text = response.text();
    else if (typeof response.text === 'string') text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!text || text.trim().length < 2) {
    if (_retry < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[_retry];
      logger.warn(`[RETRY] Empty response — attempt ${_retry + 1}/3 — waiting ${delay/1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      return askGemini(prompt, temperature, options, _retry + 1);
    }
    throw new Error('Empty response from Gemini after retries');
  }

  // تحليل JSON
  const clean = text.replace(/```json|```/g, '').trim();
  for (const s of [clean, text]) {
    try { return JSON.parse(s); } catch {}
    const obj = s.match(/\{[\s\S]*\}/)?.[0];
    if (obj) { try { return JSON.parse(obj); } catch {} }
    const arr = s.match(/\[[\s\S]*\]/)?.[0];
    if (arr) { try { return JSON.parse(arr); } catch {} }
  }

  // JSON مقطوع — أعد المحاولة بـ maxOutputTokens أكبر
  if (_retry < RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[_retry];
    const newTokens = Math.min((maxOutputTokens || 4096) * 2, 8192);
    logger.warn(`[RETRY] JSON truncated — attempt ${_retry + 1}/3 — increasing tokens to ${newTokens}...`);
    await new Promise(r => setTimeout(r, delay));
    return askGemini(prompt, temperature, { ...options, maxOutputTokens: newTokens }, _retry + 1);
  }

  logger.error('[ERROR] Cannot parse JSON', { preview: text.slice(0, 200) });
  throw new Error('Invalid JSON from Gemini: ' + text.slice(0, 100));
}
