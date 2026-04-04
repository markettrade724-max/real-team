/**
 * iap-modal.js
 * مكوّن المتجر الداخلي — يُحقن في كل لعبة/تطبيق
 * الاستخدام: <script src="/iap-modal.js"></script>
 * ثم: IAPStore.init(productId, lang)
 */

window.IAPStore = (() => {

  const KOFI_URL   = 'https://ko-fi.com/aiagents';
  const PAYPAL_URL = 'https://paypal.me/realteam'; // ← غيّر هذا

  const LABELS = {
    ar: { title:'المتجر', buy:'شراء', kofi:'ادفع عبر Ko-fi', paypal:'ادفع عبر PayPal', close:'إغلاق', choose:'اختر طريقة الدفع', owned:'مفعّل ✓', restore:'استعادة المشتريات', types:{remove_ads:'إزالة الإعلانات',consumable:'قابل للاستهلاك',cosmetic:'مظهر',feature:'ميزة',unlock:'فتح محتوى'} },
    en: { title:'Store', buy:'Buy', kofi:'Pay via Ko-fi', paypal:'Pay via PayPal', close:'Close', choose:'Choose payment method', owned:'Owned ✓', restore:'Restore Purchases', types:{remove_ads:'Remove Ads',consumable:'Consumable',cosmetic:'Cosmetic',feature:'Feature',unlock:'Unlock'} },
    fr: { title:'Boutique', buy:'Acheter', kofi:'Payer via Ko-fi', paypal:'Payer via PayPal', close:'Fermer', choose:'Choisissez le mode de paiement', owned:'Activé ✓', restore:'Restaurer les achats', types:{remove_ads:'Sans pub',consumable:'Consommable',cosmetic:'Cosmétique',feature:'Fonctionnalité',unlock:'Débloquer'} },
    es: { title:'Tienda', buy:'Comprar', kofi:'Pagar via Ko-fi', paypal:'Pagar via PayPal', close:'Cerrar', choose:'Elige método de pago', owned:'Activado ✓', restore:'Restaurar compras', types:{remove_ads:'Sin anuncios',consumable:'Consumible',cosmetic:'Cosmético',feature:'Función',unlock:'Desbloquear'} },
    de: { title:'Shop', buy:'Kaufen', kofi:'Zahlen via Ko-fi', paypal:'Zahlen via PayPal', close:'Schließen', choose:'Zahlungsmethode wählen', owned:'Aktiviert ✓', restore:'Käufe wiederherstellen', types:{remove_ads:'Werbefrei',consumable:'Verbrauchbar',cosmetic:'Kosmetik',feature:'Funktion',unlock:'Freischalten'} },
    zh: { title:'商店', buy:'购买', kofi:'通过Ko-fi支付', paypal:'通过PayPal支付', close:'关闭', choose:'选择支付方式', owned:'已拥有 ✓', restore:'恢复购买', types:{remove_ads:'去广告',consumable:'消耗品',cosmetic:'外观',feature:'功能',unlock:'解锁'} },
  };

  let _productId = null;
  let _lang      = 'en';
  let _iaps      = [];
  let _owned     = new Set();

  // ── 持久化 ──────────────────────────────────────────────────
  function saveOwned() { localStorage.setItem('rt_owned_'+_productId, JSON.stringify([..._owned])); }
  function loadOwned() {
    try { _owned = new Set(JSON.parse(localStorage.getItem('rt_owned_'+_productId)||'[]')); }
    catch { _owned = new Set(); }
  }

  // ── CSS ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('iap-styles')) return;
    const s = document.createElement('style');
    s.id = 'iap-styles';
    s.textContent = `
      #iap-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.25s;pointer-events:none;}
      #iap-overlay.open{opacity:1;pointer-events:all;}
      #iap-box{background:#0d0d1f;border:1px solid rgba(255,255,255,0.1);border-radius:24px;width:100%;max-width:440px;max-height:85vh;overflow-y:auto;transform:translateY(24px) scale(0.97);transition:transform 0.3s cubic-bezier(.175,.885,.32,1.275);padding:28px 24px;}
      #iap-overlay.open #iap-box{transform:translateY(0) scale(1);}
      #iap-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}
      #iap-title{font-size:1.2rem;font-weight:900;color:#f1f5f9;}
      #iap-close{background:rgba(255,255,255,0.06);border:none;color:#94a3b8;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;}
      #iap-close:hover{color:#f1f5f9;}
      .iap-item{display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;cursor:pointer;transition:border-color 0.2s,background 0.2s;background:rgba(255,255,255,0.02);}
      .iap-item:hover{border-color:rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);}
      .iap-item.owned{border-color:rgba(52,211,153,0.3);cursor:default;}
      .iap-icon{font-size:1.8rem;flex-shrink:0;}
      .iap-info{flex:1;}
      .iap-name{font-size:0.95rem;font-weight:700;color:#f1f5f9;}
      .iap-type{font-size:0.72rem;color:#64748b;margin-top:2px;font-family:monospace;letter-spacing:0.05em;}
      .iap-price{font-family:monospace;font-size:1rem;font-weight:700;flex-shrink:0;}
      .iap-owned-badge{font-size:0.75rem;color:#34d399;font-weight:700;}
      #iap-pay-modal{display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);align-items:center;justify-content:center;}
      #iap-pay-modal.open{display:flex;}
      #iap-pay-box{background:#0d0d1f;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px 24px;width:100%;max-width:360px;text-align:center;}
      #iap-pay-title{font-size:1rem;font-weight:700;color:#f1f5f9;margin-bottom:6px;}
      #iap-pay-subtitle{font-size:0.85rem;color:#64748b;margin-bottom:24px;}
      .iap-pay-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px;border-radius:12px;font-weight:700;font-size:0.95rem;text-decoration:none;border:none;cursor:pointer;margin-bottom:10px;transition:transform 0.2s,box-shadow 0.2s;font-family:inherit;}
      .iap-pay-btn:hover{transform:translateY(-2px);}
      .iap-pay-kofi{background:#ff5e5b;color:#fff;}
      .iap-pay-kofi:hover{box-shadow:0 0 24px rgba(255,94,91,0.4);}
      .iap-pay-paypal{background:#0070ba;color:#fff;}
      .iap-pay-paypal:hover{box-shadow:0 0 24px rgba(0,112,186,0.4);}
      .iap-pay-cancel{background:rgba(255,255,255,0.06);color:#94a3b8;border:1px solid rgba(255,255,255,0.08);}
      #iap-restore{display:block;text-align:center;color:#475569;font-size:0.78rem;margin-top:16px;cursor:pointer;background:none;border:none;font-family:inherit;}
      #iap-restore:hover{color:#94a3b8;}
      #iap-fab{position:fixed;bottom:24px;right:24px;z-index:900;background:var(--accent,#facc15);border:none;border-radius:16px;padding:12px 18px;font-weight:700;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:transform 0.2s,box-shadow 0.2s;font-family:inherit;color:#000;}
      #iap-fab:hover{transform:translateY(-3px);box-shadow:0 8px 28px rgba(0,0,0,0.4);}
      [dir=rtl] #iap-fab{right:auto;left:24px;}
    `;
    document.head.appendChild(s);
  }

  // ── HTML ─────────────────────────────────────────────────────
  function buildHTML(t) {
    const overlay = document.createElement('div');
    overlay.id = 'iap-overlay';
    overlay.innerHTML = `
      <div id="iap-box">
        <div id="iap-header">
          <div id="iap-title">🛒 ${t.title}</div>
          <button id="iap-close">✕</button>
        </div>
        <div id="iap-list"></div>
        <button id="iap-restore">${t.restore}</button>
      </div>`;
    document.body.appendChild(overlay);

    const payModal = document.createElement('div');
    payModal.id = 'iap-pay-modal';
    payModal.innerHTML = `
      <div id="iap-pay-box">
        <div id="iap-pay-title"></div>
        <div id="iap-pay-subtitle">${t.choose}</div>
        <a id="iap-btn-kofi"   class="iap-pay-btn iap-pay-kofi"   target="_blank">☕ ${t.kofi}</a>
        <a id="iap-btn-paypal" class="iap-pay-btn iap-pay-paypal" target="_blank">💳 ${t.paypal}</a>
        <button class="iap-pay-btn iap-pay-cancel" onclick="document.getElementById('iap-pay-modal').classList.remove('open')">${t.close}</button>
      </div>`;
    document.body.appendChild(payModal);

    const fab = document.createElement('button');
    fab.id = 'iap-fab';
    fab.innerHTML = '🛒 ' + t.title;
    document.body.appendChild(fab);

    // events
    document.getElementById('iap-close').onclick  = close;
    overlay.addEventListener('click', e => { if(e.target===overlay) close(); });
    fab.onclick = open;
    document.getElementById('iap-restore').onclick = restorePurchases;
  }

  function renderItems(t) {
    const list = document.getElementById('iap-list');
    if (!list) return;
    list.innerHTML = _iaps.map(item => {
      const owned = _owned.has(item.id);
      const name  = item.name[_lang] || item.name.en;
      const typeLabel = t.types[item.type] || item.type;
      return `
        <div class="iap-item ${owned?'owned':''}" onclick="${owned?'':'IAPStore._buy(\''+item.id+'\')'}">
          <div class="iap-icon">${item.emoji}</div>
          <div class="iap-info">
            <div class="iap-name">${name}</div>
            <div class="iap-type">${typeLabel.toUpperCase()}</div>
          </div>
          ${owned
            ? `<div class="iap-owned-badge">${t.owned}</div>`
            : `<div class="iap-price" style="color:var(--accent,#facc15)">$${item.price.toFixed(2)}</div>`}
        </div>`;
    }).join('');
  }

  // ── Public API ───────────────────────────────────────────────
  function init(productId, lang='en', iaps=[]) {
    _productId = productId;
    _lang      = lang;
    _iaps      = iaps;
    loadOwned();
    injectStyles();
    const t = LABELS[lang] || LABELS.en;
    buildHTML(t);
    renderItems(t);
  }

  function open()  { document.getElementById('iap-overlay')?.classList.add('open'); }
  function close() { document.getElementById('iap-overlay')?.classList.remove('open'); }

  function _buy(iapId) {
    const item = _iaps.find(i => i.id === iapId);
    if (!item) return;
    const lang = _lang;
    const t    = LABELS[lang] || LABELS.en;
    const name = item.name[lang] || item.name.en;
    const note = encodeURIComponent(`${name} — ${_productId} ($${item.price})`);

    document.getElementById('iap-pay-title').textContent = `${item.emoji} ${name} — $${item.price.toFixed(2)}`;
    document.getElementById('iap-btn-kofi').href   = `${KOFI_URL}?note=${note}`;
    document.getElementById('iap-btn-paypal').href = `${PAYPAL_URL}/${item.price}USD?note=${note}`;

    // بعد الدفع: علّم العنصر كـ owned (يحتاج تحقق حقيقي في الإنتاج)
    document.getElementById('iap-btn-kofi').onclick = () => {
      setTimeout(() => { markOwned(iapId); document.getElementById('iap-pay-modal').classList.remove('open'); }, 1500);
    };
    document.getElementById('iap-btn-paypal').onclick = () => {
      setTimeout(() => { markOwned(iapId); document.getElementById('iap-pay-modal').classList.remove('open'); }, 1500);
    };

    document.getElementById('iap-pay-modal').classList.add('open');
  }

  function markOwned(iapId) {
    _owned.add(iapId);
    saveOwned();
    renderItems(LABELS[_lang] || LABELS.en);
    if (iapId === 'no-ads') window.dispatchEvent(new Event('iap:no-ads'));
    window.dispatchEvent(new CustomEvent('iap:purchased', { detail: { iapId } }));
  }

  function restorePurchases() {
    loadOwned();
    renderItems(LABELS[_lang] || LABELS.en);
    if (_owned.has('no-ads')) window.dispatchEvent(new Event('iap:no-ads'));
    alert('✓');
  }

  function isOwned(iapId) { return _owned.has(iapId); }

  return { init, open, close, markOwned, isOwned, _buy };
})();
