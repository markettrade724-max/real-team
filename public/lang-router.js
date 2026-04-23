/**
 * lang-router.js — realteam
 * يُحمَّل أول شيء في <head> لتجنب وميض الاتجاه الخاطئ (RTL/LTR flash)
 * المهام:
 *  1. قراءة اللغة المحفوظة في localStorage
 *  2. إن لم توجد → اكتشاف لغة المتصفح تلقائياً
 *  3. ضبط <html lang> و dir فوراً قبل رسم الصفحة
 */

(function () {
  // اللغات المدعومة
  var SUPPORTED = ['ar', 'en', 'fr', 'es', 'de', 'zh'];
  var RTL_LANGS  = ['ar'];
  var DEFAULT    = 'ar';

  /**
   * تحويل كود المتصفح إلى كود مدعوم
   * مثال: "fr-FR" → "fr" | "zh-CN" → "zh" | "en-US" → "en"
   */
  function normalize(code) {
    if (!code) return null;
    var base = code.split('-')[0].toLowerCase();
    if (SUPPORTED.indexOf(base) !== -1) return base;
    return null;
  }

  /**
   * اكتشاف لغة المتصفح (يجرب قائمة كاملة)
   */
  function detectBrowser() {
    var langs = navigator.languages || [navigator.language || navigator.userLanguage || ''];
    for (var i = 0; i < langs.length; i++) {
      var found = normalize(langs[i]);
      if (found) return found;
    }
    return DEFAULT;
  }

  // ── الحصول على اللغة النهائية ──────────────────────────────────────
  var stored = localStorage.getItem('rt_lang');
  var lang;

  if (stored && SUPPORTED.indexOf(stored) !== -1) {
    // لغة محفوظة مسبقاً → استخدمها مباشرة
    lang = stored;
  } else {
    // زيارة أولى → اكتشاف تلقائي وحفظ
    lang = detectBrowser();
    localStorage.setItem('rt_lang', lang);
  }

  // ── تطبيق فوري على <html> قبل رسم أي شيء ─────────────────────────
  var html = document.documentElement;
  html.lang = lang;
  html.dir  = RTL_LANGS.indexOf(lang) !== -1 ? 'rtl' : 'ltr';

  // ── تصدير للاستخدام من الصفحات الأخرى ────────────────────────────
  window.RT_LANG = lang;

})();
