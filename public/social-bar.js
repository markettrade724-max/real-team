/**
 * social-bar.js
 * شريط الأزرار الاجتماعية — يُحقن في كل صفحة
 * الاستخدام: <script src="/social-bar.js"></script>
 * ثم: SocialBar.init({ title, url, kofi, twitter })
 */

window.SocialBar = (() => {

  const KOFI_URL    = 'https://ko-fi.com/aiagents';
  const TWITTER_URL = 'https://twitter.com/AIAgentsTeam';

  const LABELS = {
    ar: { share:'مشاركة', follow:'تابعنا', support:'ادعمنا', copy:'نسخ الرابط', copied:'تم النسخ ✓', tweet:'تغريد', whatsapp:'واتساب', telegram:'تيليغرام' },
    en: { share:'Share', follow:'Follow', support:'Support', copy:'Copy link', copied:'Copied ✓', tweet:'Tweet', whatsapp:'WhatsApp', telegram:'Telegram' },
    fr: { share:'Partager', follow:'Suivre', support:'Soutenir', copy:'Copier', copied:'Copié ✓', tweet:'Tweeter', whatsapp:'WhatsApp', telegram:'Telegram' },
    es: { share:'Compartir', follow:'Seguir', support:'Apoyar', copy:'Copiar', copied:'Copiado ✓', tweet:'Tuitear', whatsapp:'WhatsApp', telegram:'Telegram' },
    de: { share:'Teilen', follow:'Folgen', support:'Unterstützen', copy:'Kopieren', copied:'Kopiert ✓', tweet:'Tweeten', whatsapp:'WhatsApp', telegram:'Telegram' },
    zh: { share:'分享', follow:'关注', support:'支持', copy:'复制链接', copied:'已复制 ✓', tweet:'推文', whatsapp:'WhatsApp', telegram:'Telegram' },
  };

  function injectStyles() {
    if (document.getElementById('sb-styles')) return;
    const s = document.createElement('style');
    s.id = 'sb-styles';
    s.textContent = `
      #social-bar{
        position:fixed;bottom:0;left:0;right:0;z-index:800;
        background:rgba(6,6,16,0.95);backdrop-filter:blur(16px);
        border-top:1px solid rgba(255,255,255,0.08);
        padding:10px 16px;
        display:flex;align-items:center;justify-content:center;gap:8px;
        flex-wrap:wrap;
      }
      [dir=rtl] #social-bar{flex-direction:row-reverse;}
      .sb-btn{
        display:inline-flex;align-items:center;gap:6px;
        padding:8px 14px;border-radius:10px;border:none;
        font-size:0.82rem;font-weight:700;cursor:pointer;
        font-family:inherit;transition:transform 0.2s,box-shadow 0.2s;
        text-decoration:none;white-space:nowrap;
      }
      .sb-btn:hover{transform:translateY(-2px);}
      .sb-share   {background:#334155;color:#f1f5f9;}
      .sb-share:hover{background:#475569;}
      .sb-twitter {background:#000;color:#fff;}
      .sb-twitter:hover{box-shadow:0 0 16px rgba(255,255,255,0.2);}
      .sb-kofi    {background:#ff5e5b;color:#fff;}
      .sb-kofi:hover{box-shadow:0 0 16px rgba(255,94,91,0.5);}
      .sb-copy    {background:#1e293b;color:#94a3b8;border:1px solid rgba(255,255,255,0.08);}
      .sb-copy:hover{color:#f1f5f9;}
      .sb-wa      {background:#25d366;color:#fff;}
      .sb-wa:hover{box-shadow:0 0 16px rgba(37,211,102,0.4);}
      .sb-tg      {background:#229ed9;color:#fff;}
      .sb-tg:hover{box-shadow:0 0 16px rgba(34,158,217,0.4);}

      /* share dropdown */
      #sb-dropdown{
        position:fixed;bottom:64px;left:50%;transform:translateX(-50%);
        z-index:801;background:#0d0d1f;border:1px solid rgba(255,255,255,0.1);
        border-radius:16px;padding:12px;
        display:none;flex-direction:column;gap:8px;min-width:200px;
        box-shadow:0 -8px 32px rgba(0,0,0,0.4);
      }
      #sb-dropdown.open{display:flex;}
      .sb-drop-btn{
        display:flex;align-items:center;gap:10px;
        padding:10px 14px;border-radius:10px;border:none;
        font-size:0.88rem;font-weight:600;cursor:pointer;
        font-family:inherit;transition:background 0.2s;text-decoration:none;
        color:#f1f5f9;background:rgba(255,255,255,0.05);
      }
      .sb-drop-btn:hover{background:rgba(255,255,255,0.1);}

      /* padding bottom للمحتوى حتى لا يُخفيه الشريط */
      body{padding-bottom:72px !important;}
    `;
    document.head.appendChild(s);
  }

  function buildBar(config) {
    const lang = config.lang || localStorage.getItem('rt_lang') || 'en';
    const t    = LABELS[lang] || LABELS.en;
    const url  = config.url  || window.location.href;
    const title = config.title || document.title;

    // Dropdown للمشاركة
    const dropdown = document.createElement('div');
    dropdown.id = 'sb-dropdown';
    dropdown.innerHTML = `
      <a class="sb-drop-btn sb-twitter" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank">
        𝕏 &nbsp;${t.tweet}
      </a>
      <a class="sb-drop-btn sb-wa" href="https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}" target="_blank">
        💬 ${t.whatsapp}
      </a>
      <a class="sb-drop-btn sb-tg" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank">
        ✈️ ${t.telegram}
      </a>
      <button class="sb-drop-btn sb-copy" id="sb-copy-btn">
        🔗 ${t.copy}
      </button>
    `;
    document.body.appendChild(dropdown);

    // الشريط
    const bar = document.createElement('div');
    bar.id = 'social-bar';
    bar.innerHTML = `
      <button class="sb-btn sb-share" id="sb-share-btn">
        ↗ ${t.share}
      </button>
      <a class="sb-btn sb-twitter" href="${TWITTER_URL}" target="_blank">
        𝕏 ${t.follow}
      </a>
      <a class="sb-btn sb-kofi" href="${KOFI_URL}" target="_blank">
        ☕ ${t.support}
      </a>
    `;
    document.body.appendChild(bar);

    // أحداث
    document.getElementById('sb-share-btn').onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    };

    document.addEventListener('click', () => dropdown.classList.remove('open'));

    document.getElementById('sb-copy-btn').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        const btn = document.getElementById('sb-copy-btn');
        btn.textContent = '✓ ' + t.copied;
        setTimeout(() => { btn.textContent = '🔗 ' + t.copy; }, 2000);
      } catch { console.warn('Copy failed'); }
      dropdown.classList.remove('open');
    };

    // Web Share API إذا كانت متاحة
    if (navigator.share) {
      document.getElementById('sb-share-btn').onclick = async (e) => {
        e.stopPropagation();
        try {
          await navigator.share({ title, url });
        } catch {
          dropdown.classList.toggle('open');
        }
      };
    }
  }

  function init(config = {}) {
    injectStyles();
    buildBar(config);
  }

  return { init };
})();
