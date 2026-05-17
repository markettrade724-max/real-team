/**
 * _gemini.js — Gemini 2.5 Flash
 */
import { GoogleGenAI } from '@google/genai';
import { logger }      from '../logger.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * @param {string} prompt
 * @param {number} temperature
 * @param {object} options - معاملات إضافية اختيارية
 *   topP, topK, maxOutputTokens, frequencyPenalty, presencePenalty
 */
export async function askGemini(prompt, temperature = 0.9, options = {}) {
  const {
    topP               = undefined,
    topK               = undefined,
    maxOutputTokens    = 4096,
    frequencyPenalty   = undefined,
    presencePenalty    = undefined,
  } = options;

  // بناء config — نضيف فقط المعاملات الموجودة
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
    logger.error('Gemini API call failed', { error: err.message });
    throw new Error('Gemini API call failed: ' + err.message);
  }

  // استخراج النص
  let text = '';
  try {
    if (typeof response.text === 'function')      text = response.text();
    else if (typeof response.text === 'string')   text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!text || text.trim().length < 2)
    throw new Error('Empty response from Gemini');

  // تحليل JSON
  const clean = text.replace(/```json|```/g, '').trim();
  for (const s of [clean, text]) {
    try { return JSON.parse(s); } catch {}
    const obj = s.match(/\{[\s\S]*\}/)?.[0];
    if (obj) { try { return JSON.parse(obj); } catch {} }
    const arr = s.match(/\[[\s\S]*\]/)?.[0];
    if (arr) { try { return JSON.parse(arr); } catch {} }
  }

  logger.error('Cannot parse JSON', { preview: text.slice(0, 200) });
  throw new Error('Invalid JSON from Gemini: ' + text.slice(0, 100));
}
