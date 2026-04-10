import { askGemini } from './_gemini.js';
import { logger }    from '../logger.js';

const SITE_URL = process.env.SITE_URL || 'https://real-team-production.up.railway.app';

export async function run(idea, art) {
  const name    = idea.name?.en || idea.id;
  const gameUrl = `${SITE_URL}/games/${idea.id}.html`;

  const posts = await askGemini(`
Create marketing content for the game "${name}" (${idea.emoji}).
Description: ${idea.desc?.en}
URL: ${gameUrl}
Free to play with optional in-app purchases.
Return ONLY valid JSON:
{
  "twitter": { "en": "tweet max 280 chars with hashtags", "ar": "تغريدة" },
  "reddit":  { "title": "Reddit title", "body": "two paragraphs" },
  "facebook": { "ar": "منشور", "en": "post" },
  "tiktok":  { "caption": "short caption", "hashtags": ["h1","h2","h3","h4","h5"] },
  "youtube": { "title": "SEO title", "description": "3 paragraphs", "tags": ["t1","t2","t3"] }
}`, 0.95);

  posts.gameId      = idea.id;
  posts.gameUrl     = gameUrl;
  posts.generatedAt = new Date().toISOString();
  logger.info('Marketing generated', { gameId: idea.id });
  return posts;
}
