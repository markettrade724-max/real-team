/**
 * _gemini.js — مصحح نهائياً
 */
import { GoogleGenAI } from '@google/genai';
import { logger }      from '../logger.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGemini(prompt, temperature = 0.9) {
  const response = await ai.models.generateContent({
    model:   'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature,
      maxOutputTokens:  4096,
      responseMimeType: 'application/json',
    },
  });

  // دعم كل أشكال استخراج النص
  let text = '';
  try {
    if (typeof response.text === 'function') text = response.text();
    else if (typeof response.text === 'string') text = response.text;
    else text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!text || text.trim().length < 2)
    throw new Error('Empty response from Gemini');

  // محاولات تحليل JSON
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
