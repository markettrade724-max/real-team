import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public')));

// ── ENV ───────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KOFI_VERIFICATION_TOKEN, ADMIN_PASSWORD, PORT=3000 } = process.env;
const missing = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','KOFI_VERIFICATION_TOKEN','ADMIN_PASSWORD'].filter(k=>!process.env[k]);
if (missing.length) { console.error('❌ Missing:', missing.join(', ')); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Auth middleware ───────────────────────────────────────────
const requireAdmin = (req,res,next) => {
  if(req.headers['x-admin-token']===ADMIN_PASSWORD) return next();
  res.status(401).json({error:'Unauthorized'});
};

// ── Helper ────────────────────────────────────────────────────
async function saveEarning({ platform, amount, currency='USD', source, status='completed', transactionId=null, iapId=null }) {
  const n = parseFloat(amount);
  if (isNaN(n)||n<=0) return false;
  const { error } = await supabase.from('earnings').insert([{
    platform, amount:n, currency, source, status,
    type:'income', transaction_id:transactionId, iap_id:iapId,
    date: new Date().toISOString()
  }]);
  if (error) { console.error('❌ DB:', error.message); return false; }
  console.log(`✅ ${n} ${currency} [${platform}] iap:${iapId||'-'}`);
  return true;
}

// ── products.json ─────────────────────────────────────────────
app.get('/products.json', (req, res) => {
  res.sendFile(join(__dirname, 'products.json'));
});

// ── Ko-fi webhook ─────────────────────────────────────────────
app.post('/webhook/kofi', async (req, res) => {
  try {
    const raw = req.body?.data;
    if (!raw) return res.sendStatus(400);
    let data;
    try { data = JSON.parse(raw); } catch { return res.sendStatus(400); }
    if (data.verification_token !== KOFI_VERIFICATION_TOKEN) return res.sendStatus(401);
    if (['Donation','Shop Order','Subscription'].includes(data.type)) {
      const iapId = data.message?.match(/\[iap:([^\]]+)\]/)?.[1] || null;
      const ok = await saveEarning({
        platform:'Ko-fi', amount:data.amount, currency:data.currency||'USD',
        source:data.type.toLowerCase().replace(' ','_'),
        transactionId:data.kofi_transaction_id, iapId
      });
      if (!ok) return res.sendStatus(500);
    }
    res.sendStatus(200);
  } catch(e) { console.error('Ko-fi:', e.message); res.sendStatus(500); }
});

// ── PayPal webhook ────────────────────────────────────────────
app.post('/webhook/paypal', async (req, res) => {
  try {
    const ev = req.body;
    if (ev?.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const amount   = ev?.resource?.amount?.value;
      const currency = ev?.resource?.amount?.currency_code;
      const txId     = ev?.resource?.id;
      const iapId    = ev?.resource?.custom_id || null;
      if (!amount||!currency) return res.sendStatus(400);
      const ok = await saveEarning({ platform:'PayPal', amount, currency, source:'payment', transactionId:txId, iapId });
      if (!ok) return res.sendStatus(500);
    }
    res.sendStatus(200);
  } catch(e) { console.error('PayPal:', e.message); res.sendStatus(500); }
});

// ── Admin: GET earnings ───────────────────────────────────────
app.get('/api/admin/earnings', requireAdmin, async (req,res) => {
  try {
    const { data, error } = await supabase.from('earnings').select('*').order('date',{ascending:false});
    if (error) throw error;
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// ── Admin: POST manual earning ────────────────────────────────
app.post('/api/admin/earnings', requireAdmin, async (req,res) => {
  const { platform, amount, currency, source, status } = req.body;
  if (!platform||!amount) return res.status(400).json({ error:'platform and amount required' });
  const ok = await saveEarning({ platform, amount, currency, source, status });
  ok ? res.json({ success:true }) : res.status(500).json({ error:'Insert failed' });
});

// ── Admin: GET products ───────────────────────────────────────
app.get('/api/admin/products', requireAdmin, async (req,res) => {
  try {
    const { readFileSync } = await import('fs');
    const products = JSON.parse(readFileSync(join(__dirname,'products.json'),'utf8'));
    res.json({ success:true, data:products });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Health ────────────────────────────────────────────────────
app.get('/health', async (req,res) => {
  try {
    const { error } = await supabase.from('earnings').select('*',{count:'exact',head:true});
    if (error) throw error;
    res.json({ status:'ok', database:'connected', time:new Date().toISOString() });
  } catch(e) { res.status(503).json({ status:'degraded', error:e.message }); }
});

app.listen(PORT, () => console.log(`✅ Port ${PORT}`));
