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

STRICT RULES:
- twitter.en: MAX 240 characters including spaces, hashtags and URL
- twitter.ar: MAX 240 characters
- Count every character carefully

Return ONLY valid JSON:
{
  "twitter": {
    "en": "tweet under 240 chars with 2-3 hashtags and URL",
    "ar": "تغريدة أقل من 240 حرف مع هاشتاقات والرابط"
  },
  "reddit": {
    "title": "catchy title under 100 chars",
    "body": "two short paragraphs"
  },
  "facebook": {
    "ar": "منشور قصير 2-3 جمل مع إيموجي",
    "en": "short post 2-3 sentences with emojis"
  },
  "tiktok": {
    "caption": "caption under 150 chars",
    "hashtags": ["h1","h2","h3","h4","h5"]
  },
  "youtube": {
    "title": "SEO title under 70 chars",
    "description": "3 short paragraphs",
    "tags": ["t1","t2","t3"]
  }
}`, 0.9);

  posts.gameId      = idea.id;
  posts.gameUrl     = gameUrl;
  posts.generatedAt = new Date().toISOString();

  // ضمان أن Twitter لا يتجاوز 280 حرف
  if (posts.twitter?.en?.length > 270) {
    posts.twitter.en = posts.twitter.en.slice(0, 267) + '...';
  }
  if (posts.twitter?.ar?.length > 270) {
    posts.twitter.ar = posts.twitter.ar.slice(0, 267) + '...';
  }

  logger.info('Marketing generated', {
    gameId: idea.id,
    tweetLen: posts.twitter?.en?.length
  });
  return posts;
}
