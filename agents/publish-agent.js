/**
 * publish-agent.js — v1.0
 * Manual publish assist — no API keys required for any platform (rule-232)
 * Runs client-side in admin panel, not via GitHub Actions
 *
 * Platforms:
 *  - YouTube  : download + copy caption + open Studio upload page
 *  - TikTok   : download + copy caption + open TikTok Studio (2026 URL)
 *  - Facebook : direct share link (sharer.php — no key needed)
 *  - Reddit   : direct submit link to personal profile u_one_kale1147
 *
 * rule-232 : zero platform API keys — native share API on mobile, assisted manual on desktop
 */

const PUBLISH_CONFIG = {
  youtubeChannelId: 'UCICitmRc7MaM8UjY7RuC3tg',
  redditDestination: 'u_one_kale1147', // personal profile — confirmed 2026-07-01
};

// ── Build share text from episode data ────────────────────
function buildShareText(ep) {
  const title   = ep.title || 'New Episode';
  const caption = [
    ep.title,
    '',
    ep.description || ep.logline || '',
    '',
    (ep.tags || []).map(t => `#${t}`).join(' '),
  ].filter(s => s !== undefined).join('\n').trim();
  return { title, caption, videoUrl: ep.videoUrl, pageUrl: ep.pageUrl };
}

// ── Native share (mobile — real file share) ──────────────
async function shareNative(ep) {
  const { title, caption, videoUrl } = buildShareText(ep);
  try {
    const blob = await (await fetch(videoUrl)).blob();
    const file = new File([blob], `${ep.slug || 'episode'}.mp4`, { type: 'video/mp4' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: caption });
      return true;
    }
  } catch (err) {
    console.warn('[PUBLISH] Native share failed/unsupported', err);
  }
  return false;
}

// ── YouTube — 3-step assist ───────────────────────────────
async function assistYouTube(ep) {
  const { caption, videoUrl } = buildShareText(ep);
  await navigator.clipboard.writeText(caption);
  window.open(videoUrl, '_blank');
  window.open(
    `https://studio.youtube.com/channel/${PUBLISH_CONFIG.youtubeChannelId}/videos/upload`,
    '_blank'
  );
}

// ── TikTok — TikTok Studio (2026 URL) ────────────────────
async function assistTikTok(ep) {
  const { caption, videoUrl } = buildShareText(ep);
  await navigator.clipboard.writeText(caption);
  window.open(videoUrl, '_blank');
  window.open('https://www.tiktok.com/tiktokstudio/upload', '_blank');
}

// ── Facebook — direct share link, no key ─────────────────
function openFacebook(ep) {
  const { pageUrl } = buildShareText(ep);
  window.open(
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    '_blank'
  );
}

// ── Reddit — submit to personal profile ──────────────────
function openReddit(ep) {
  const { pageUrl, title } = buildShareText(ep);
  window.open(
    `https://www.reddit.com/r/${PUBLISH_CONFIG.redditDestination}/submit` +
    `?url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(title)}&type=link`,
    '_blank'
  );
}

// ── Unified entry point for admin panel buttons ───────────
export async function publish(platform, episode) {
  // Mobile-first: native share for YouTube/TikTok (not Facebook/Reddit — they use links)
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

// ── publishStatus schema to inject into series.json ──────
// Add this to each episode in series.json:
// "publishStatus": {
//   "youtube":  { "done": false, "confirmedAt": null },
//   "tiktok":   { "done": false, "confirmedAt": null },
//   "facebook": { "done": false, "confirmedAt": null },
//   "reddit":   { "done": false, "confirmedAt": null }
// }
export function confirmPublished(platform, episode) {
  if (!episode.publishStatus) episode.publishStatus = {};
  episode.publishStatus[platform] = {
    done: true,
    confirmedAt: new Date().toISOString(),
  };
  return episode;
}
