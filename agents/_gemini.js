/**
 * _gemini.js — دالة Gemini مشتركة مصححة نهائياً
 */
import { GoogleGenAI } from '@google/genai';
import { logger }      from '../logger.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGemini(prompt, temperature = 0.9) {
  const response = await ai.models.generateContent({
    model:    'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature,
      maxOutputTokens:  4096, // ← زيادة من 1500 إلى 4096
      responseMimeType: 'application/json',
    },
  });

  // دعم كلا الحالتين: method أو property
  let text = '';
  try {
    text = typeof response.text === 'function'
      ? response.text()
      : response.text;
  } catch {
    text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!text) throw new Error('Empty response from Gemini');

  // تنظيف وتحليل JSON
  const attempts = [
    text,
    text.replace(/```json|```/g, '').trim(),
    text.match(/\{[\s\S]*\}/)?.[0] || '',
    text.match(/\[[\s\S]*\]/)?.[0] || '',
  ];

  for (const attempt of attempts) {
    if (!attempt) continue;
    try { return JSON.parse(attempt); } catch {}
  }

  logger.error('Cannot parse JSON', { preview: text.slice(0, 150) });
  throw new Error('Invalid JSON from Gemini');
}
