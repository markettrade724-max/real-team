/**
 * social-bar.js v2 — شريط التفاعل الاجتماعي
 */
window.SocialBar = (() => {
  const KOFI_URL    = 'https://ko-fi.com/aiagents';
  const TWITTER_URL = 'https://twitter.com/AIAgentsTeam';

  const L = {
    ar:{ share:'مشاركة', follow:'تابعنا', support:'ادعمنا', contact:'تواصل', copy:'نسخ', copied:'تم ✓', tweet:'تغريد', whatsapp:'واتساب', tg:'تيليغرام' },
    en:{ share:'Share', follow:'Follow', support:'Support', contact:'Contact', copy:'Copy', copied:'Copied ✓', tweet:'Tweet', whatsapp:'WhatsApp', tg:'Telegram' },
    fr:{ share:'Partager', follow:'Suivre', support:'Soutenir', contact:'Contact', copy:'Copier', copied:'Copié ✓', tweet:'Tweeter', whatsapp:'WhatsApp', tg:'Telegram' },
    es:{ share:'Compartir', follow:'Seguir', support:'Apoyar', contact:'Contacto', copy:'Copiar', copied:'Copiado ✓', tweet:'Tuitear', whatsapp:'WhatsApp', tg:'Telegram' },
    de:{ share:'Teilen', follow:'Folgen', support:'Unterstützen', contact:'Kontakt', copy:'Kopieren', copied:'Kopiert ✓', tweet:'Tweeten', whatsapp:'WhatsApp', tg:'Telegram' },
    zh:{ share:'分享', follow:'关注', support:'支持', contact:'联系', copy:'复制', copied:'已复制 ✓', tweet:'推文', whatsapp:'WhatsApp', tg:'Telegram' },
  };

  function injectStyles() {
    if (document.getElementById('sb-styles')) return;
    const s = document.createElement('style');
    s.id = 'sb-styles';
    s.textContent = `
      #social-bar{position:fixed;bottom:0;left:0;right:0;z-index:800;
        background:rgba(6,6,16,0.96);backdrop-filter:blur(16px);
        border-top:1px solid rgba(255,255,255,0.08);
        padding:8px 12px;display:flex;align-items:center;justify-content:center;
        gap:6px;flex-wrap:wrap;}
      .sb-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 13px;
        border-radius:10px;border:none;font-size:0.8rem;font-weight:700;cursor:pointer;
        font-family:inherit;transition:transform 0.2s,box-shadow 0.2s;text-decoration:none;
        white-space:nowrap;}
      .sb-btn:hover{transform:translateY(-2px);}
      .sb-share  {background:#1e293b;color:#f1f5f9;border:1px solid rgba(255,255,255,0.1);}
      .sb-twitter{background:#000;color:#fff;}
      .sb-twitter:hover{box-shadow:0 0 14px rgba(255,255,255,0.2);}
      .sb-kofi   {background:#ff5e5b;color:#fff;}
      .sb-kofi:hover{box-shadow:0 0 14px rgba(255,94,91,0.5);}
      .sb-contact{background:#1e293b;color:#94a3b8;border:1px solid rgba(255,255,255,0.08);}
      .sb-contact:hover{color:#f1f5f9;}
      #sb-drop{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
        z-index:801;background:#0d0d1f;border:1px solid rgba(255,255,255,0.1);
        border-radius:16px;padding:10px;display:none;flex-direction:column;
        gap:6px;min-width:190px;box-shadow:0 -8px 28px rgba(0,0,0,0.4);}
      #sb-drop.open{display:flex;}
      .sb-drop-btn{display:flex;align-items:center;gap:8px;padding:9px 13px;
        border-radius:9px;border:none;font-size:0.85rem;font-weight:600;cursor:pointer;
        font-family:inherit;transition:background 0.2s;text-decoration:none;
        color:#f1f5f9;background:rgba(255,255,255,0.05);}
      .sb-drop-btn:hover{background:rgba(255,255,255,0.1);}
      body{padding-bottom:68px!important;}
    `;
    document.head.appendChild(s);
  }

  function init(config = {}) {
    injectStyles();
    const lang = config.lang || localStorage.getItem('rt_lang') || 'ar';
    const t    = L[lang] || L.en;
    const url  = config.url  || window.location.href;
    const title = config.title || document.title;

    // Dropdown
    const drop = document.createElement('div');
    drop.id = 'sb-drop';
    drop.innerHTML = `
      <a class="sb-drop-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank">𝕏 ${t.tweet}</a>
      <a class="sb-drop-btn" href="https://wa.me/?text=${encodeURIComponent(title+' '+url)}" target="_blank">💬 ${t.whatsapp}</a>
      <a class="sb-drop-btn" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank">✈️ ${t.tg}</a>
      <button class="sb-drop-btn" id="sb-copy">🔗 ${t.copy}</button>
    `;
    document.body.appendChild(drop);

    // Bar
    const bar = document.createElement('div');
    bar.id = 'social-bar';
    bar.innerHTML = `
      <button class="sb-btn sb-share" id="sb-share-btn">↗ ${t.share}</button>
      <a class="sb-btn sb-twitter" href="${TWITTER_URL}" target="_blank">𝕏 ${t.follow}</a>
      <a class="sb-btn sb-kofi"    href="${KOFI_URL}"    target="_blank">☕ ${t.support}</a>
      <a class="sb-btn sb-contact" href="/contact.html">💬 ${t.contact}</a>
    `;
    document.body.appendChild(bar);

    // Events
    const shareBtn = document.getElementById('sb-share-btn');

    if (navigator.share) {
      shareBtn.onclick = async () => {
        try { await navigator.share({ title, url }); }
        catch { drop.classList.toggle('open'); }
      };
    } else {
      shareBtn.onclick = e => { e.stopPropagation(); drop.classList.toggle('open'); };
    }

    document.addEventListener('click', () => drop.classList.remove('open'));

    document.getElementById('sb-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        const btn = document.getElementById('sb-copy');
        btn.textContent = '✓ ' + t.copied;
        setTimeout(() => { btn.textContent = '🔗 ' + t.copy; }, 2000);
      } catch {}
      drop.classList.remove('open');
    };
  }

  return { init };
})();
