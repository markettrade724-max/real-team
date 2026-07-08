import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  // Always redirect on any error — never return 500
  try {
    const n = parseInt(req.query?.n);
    if (!n || isNaN(n)) {
      res.redirect(302, '/#seriesSec');
      return;
    }

    const SITE = process.env.SITE_URL || 'https://real-team.vercel.app';

    // Try multiple paths — Vercel cwd can vary
    let episode = null;
    for (const p of [
      join(process.cwd(), 'public', 'series.json'),
      join(process.cwd(), 'series.json'),
    ]) {
      if (existsSync(p)) {
        try {
          const data = JSON.parse(readFileSync(p, 'utf8'));
          episode = data.episodes?.find(ep => ep.number === n) || null;
          if (episode) break;
        } catch {}
      }
    }

    if (!episode) {
      res.redirect(302, '/#seriesSec');
      return;
    }

    const h = s => String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const title     = episode.title   || `Episode ${n} — Memory Shards Saga`;
    const desc      = episode.logline || episode.theme || 'AI-born survival series — new episode every week.';
    const videoUrl  = episode.videoUrl     || '';
    const thumbUrl  = episode.thumbnailUrl || `${SITE}/thumb-default.png`;
    const epUrl     = `${SITE}/api/ep?n=${n}`;
    const isVideo   = !!videoUrl;

    res.setHeader('Content-Type',  'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.end(`<!DOCTYPE html>
<html prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8">
<title>${h(title)}</title>
<meta name="description" content="${h(desc)}">
<meta property="og:site_name"   content="realteam">
<meta property="og:type"        content="${isVideo ? 'video.episode' : 'website'}">
<meta property="og:title"       content="${h(title)}">
<meta property="og:description" content="${h(desc)}">
<meta property="og:url"         content="${h(epUrl)}">
<meta property="og:image"       content="${h(thumbUrl)}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
${isVideo ? `<meta property="og:video"            content="${h(videoUrl)}">
<meta property="og:video:secure_url" content="${h(videoUrl)}">
<meta property="og:video:type"       content="video/mp4">
<meta property="og:video:width"      content="1920">
<meta property="og:video:height"     content="1080">` : ''}
<meta name="twitter:card"        content="${isVideo ? 'player' : 'summary_large_image'}">
<meta name="twitter:title"       content="${h(title)}">
<meta name="twitter:description" content="${h(desc)}">
<meta name="twitter:image"       content="${h(thumbUrl)}">
${isVideo ? `<meta name="twitter:player"        content="${h(videoUrl)}">
<meta name="twitter:player:width"  content="1280">
<meta name="twitter:player:height" content="720">` : ''}
<meta http-equiv="refresh" content="0;url=/#seriesSec">
</head>
<body>
<script>window.location.replace('/#seriesSec');</script>
<p><a href="/#seriesSec">Redirecting…</a></p>
</body>
</html>`);

  } catch (err) {
    // Catch-all — never return 500 to the user
    console.error('[api/ep] Error:', err.message);
    res.redirect(302, '/#seriesSec');
  }
}
