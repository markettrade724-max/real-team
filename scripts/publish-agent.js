/**
 * publish-agent.js — v1.0
 * نشر يدوي بمساعدة أزرار — بدون أي مفاتيح API لأي منصة (rule-232)
 * يعمل في admin panel (client-side) — ليس وكيل GitHub Actions
 */

const PUBLISH_CONFIG = {
  youtubeChannelId: 'UCICitmRc7MaM8UjY7RuC3tg',
  // ⚠️ مؤقت: افتراض نشر على البروفايل الشخصي، لا subreddit مخصص بعد.
  // إذا تأكد subreddit حقيقي، بدّل القيمة لاسمه فقط (بدون r/): redditDestination: 'YourSubreddit'
  redditDestination: 'u_One_Kale1147',
};

// ── 1) بناء نص النشر من بيانات الحلقة ──────────────────────
function buildShareText(ep) {
  const title   = ep.title;
  const caption = `${ep.title}\n\n${ep.description || ''}\n\n${(ep.tags || []).map(t => `#${t}`).join(' ')}`.trim();
  return { title, caption, videoUrl: ep.videoUrl, pageUrl: ep.pageUrl };
}

// ── 2) مشاركة نظامية حقيقية بالملف (موبايل أساساً) ─────────
async function shareNative(ep) {
  const { title, caption, videoUrl } = buildShareText(ep);
  try {
    const blob = await (await fetch(videoUrl)).blob();
    const file = new File([blob], `${ep.slug}.mp4`, { type: 'video/mp4' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: caption });
      return true;
    }
  } catch (err) {
    console.warn('[PUBLISH] Native share failed/unsupported', err);
  }
  return false;
}

// ── 3) يوتيوب — مساعدة 3 خطوات (تنزيل + نسخ كابشن + فتح الرفع) ─
async function assistYouTube(ep) {
  const { caption, videoUrl } = buildShareText(ep);
  await navigator.clipboard.writeText(caption);
  window.open(videoUrl, '_blank'); // يبدأ تنزيل/فتح الفيديو
  window.open(
    `https://studio.youtube.com/channel/${PUBLISH_CONFIG.youtubeChannelId}/videos/upload`,
    '_blank'
  );
}

// ── 4) تيك توك — نفس النمط، رابط TikTok Studio الجديد ─────
async function assistTikTok(ep) {
  const { caption, videoUrl } = buildShareText(ep);
  await navigator.clipboard.writeText(caption);
  window.open(videoUrl, '_blank');
  window.open('https://www.tiktok.com/tiktokstudio/upload', '_blank');
}

// ── 5) فيسبوك — رابط مشاركة مباشر، بدون مفتاح ──────────────
function openFacebook(ep) {
  const { pageUrl } = buildShareText(ep);
  window.open(
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    '_blank'
  );
}

// ── 6) ريديت — رابط مشاركة مباشر، بدون مفتاح ───────────────
function openReddit(ep) {
  const { pageUrl, title } = buildShareText(ep);
  window.open(
    `https://www.reddit.com/r/${PUBLISH_CONFIG.redditDestination}/submit?url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(title)}&type=link`,
    '_blank'
  );
}

// ── 7) نقطة الدخول الموحدة لكل زر بلوحة الأدمن ──────────────
export async function publish(platform, episode) {
  if (platform !== 'facebook' && platform !== 'reddit') {
    const shared = await shareNative(episode);
    if (shared) return { method: 'native-share', platform };
  }
  const handlers = {
    youtube:  assistYouTube,
    tiktok:   assistTikTok,
    facebook: openFacebook,
    reddit:   openReddit,
  };
  await handlers[platform]?.(episode);
  return { method: 'manual-assist', platform };
}
