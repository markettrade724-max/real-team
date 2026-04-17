/**
 * _gemini.js — دالة Gemini مشتركة مصححة
 * تستخدم @google/genai v0.7+
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
      maxOutputTokens:  1500,
      responseMimeType: 'application/json',
    },
  });

  // الطريقة الصحيحة في v0.7+
  const text = response.text;
  if (!text) throw new Error('Empty response from Gemini');

  // محاولات استخراج JSON
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch {}

  logger.error('Cannot parse JSON', { preview: text.slice(0, 100) });
  throw new Error('Invalid JSON from Gemini');
}
