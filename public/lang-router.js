/**
 * lang-router.js — يوجّه المستخدم لنسخة اللعبة بلغته
 * أضفه في index.html بدل الروابط المباشرة
 */
window.getGameUrl = function(slug) {
  const lang = localStorage.getItem('rt_lang') || 'ar';
  // اللغة العربية = الملف الأساسي
  if (lang === 'ar') return `/games/${slug}.html`;
  // باقي اللغات = slug-lang.html
  return `/games/${slug}-${lang}.html`;
};

// استخدم في index.html:
// onclick="location.href=getGameUrl('memory-cosmos')"
// href="${getGameUrl(p.slug)}"
