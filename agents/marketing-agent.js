/**
 * marketing-agent.js
 * يولّد منشورات تسويقية لكل المنصات
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SITE_URL   = process.env.SITE_URL || 'https://real-team-production.up.railway.app';

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.95, maxOutputTokens: 2000 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function run(idea, art) {
  const name    = idea.name?.en || idea.id;
  const nameAr  = idea.name?.ar || idea.id;
  const desc    = idea.desc?.en || '';
  const gameUrl = `${SITE_URL}/games/${idea.id}.html`;

  const prompt = `
أنت خبير تسويق رقمي. اكتب محتوى تسويقياً للعبة "${name}" (${idea.emoji}).

معلومات اللعبة:
- النوع: ${idea.type}
- الوصف: ${desc}
- الرابط: ${gameUrl}
- مجانية مع مشتريات اختيارية

اكتب منشوراً لكل منصة. أجب بـ JSON فقط:
{
  "twitter": {
    "en": "تغريدة بالإنجليزية (max 280 chars) مع هاشتاقات",
    "ar": "تغريدة بالعربية (max 280 chars)"
  },
  "reddit": {
    "title": "عنوان Reddit بالإنجليزية",
    "body": "نص المنشور بالإنجليزية (فقرتان)"
  },
  "facebook": {
    "ar": "منشور فيسبوك بالعربية (3-4 جمل مع إيموجي)",
    "en": "Facebook post in English (3-4 sentences with emojis)"
  },
  "tiktok": {
    "caption": "كابشن TikTok قصير جذاب بالإنجليزية",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
  },
  "youtube": {
    "title": "عنوان YouTube بالإنجليزية (جذاب للـ SEO)",
    "description": "وصف YouTube بالإنجليزية (3 فقرات)",
    "tags": ["tag1", "tag2", "tag3"]
  }
}`;

  const raw   = await gemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid marketing response');

  const posts = JSON.parse(match[0]);
  posts.gameId      = idea.id;
  posts.gameUrl     = gameUrl;
  posts.generatedAt = new Date().toISOString();

  console.log(`📣 Marketing content generated for: ${name}`);
  console.log(`   Twitter: ${posts.twitter?.en?.slice(0, 60)}...`);
  console.log(`   Reddit title: ${posts.reddit?.title}`);

  return posts;
}
