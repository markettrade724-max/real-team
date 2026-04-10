import express       from 'express';
import helmet        from 'helmet';
import cors          from 'cors';
import rateLimit     from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { z }         from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger }    from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app       = express();

// ── Security Middleware ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: process.env.SITE_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public')));

// ── Rate Limiters ─────────────────────────────────────────────
const webhookLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  message: { error: 'Too many requests' },
});
const adminLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  message: { error: 'Too many requests' },
});

// ── ENV Validation ────────────────────────────────────────────
const EnvSchema = z.object({
  SUPABASE_URL:              z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  KOFI_VERIFICATION_TOKEN:   z.string().min(1),
  ADMIN_PASSWORD:            z.string().min(6),
});

const env = EnvSchema.safeParse(process.env);
if (!env.success) {
  logger.error('Missing environment variables', { issues: env.error.issues.map(i => i.path[0]) });
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Zod Schemas ───────────────────────────────────────────────
const KofiSchema = z.object({
  verification_token:  z.string(),
  type:                z.enum(['Donation', 'Shop Order', 'Subscription']),
  amount:              z.string(),
  currency:            z.string().length(3).default('USD'),
  kofi_transaction_id: z.string(),
  message:             z.string().nullable().optional(),
});

const PaypalSchema = z.object({
  event_type: z.string(),
  resource: z.object({
    amount: z.object({
      value:         z.string(),
      currency_code: z.string(),
    }),
    id:        z.string(),
    custom_id: z.string().optional(),
  }),
});

const ManualEarningSchema = z.object({
  platform: z.string().min(1),
  amount:   z.number().positive(),
  currency: z.string().length(3).default('USD'),
  source:   z.string().default('manual'),
  status:   z.enum(['completed', 'pending']).default('completed'),
  iap_id:   z.string().nullable().optional(),
});

// ── Auth Middleware ───────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.headers['x-admin-token'] === process.env.ADMIN_PASSWORD) return next();
  logger.warn('Unauthorized admin access', { ip: req.ip });
  res.status(401).json({ error: 'Unauthorized' });
};

// ── Helper: Save Earning ──────────────────────────────────────
async function saveEarning({ platform, amount, currency = 'USD', source, status = 'completed', transactionId = null, iapId = null }) {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return false;

  const { error } = await supabase.from('earnings').insert([{
    platform, amount: n, currency, source, status,
    type: 'income', transaction_id: transactionId,
    iap_id: iapId, date: new Date().toISOString(),
  }]);

  if (error) { logger.error('DB insert failed', { platform, error: error.message }); return false; }
  logger.info('Earning saved', { platform, amount: n, currency, iapId });
  return true;
}

// ── Ko-fi Webhook ─────────────────────────────────────────────
app.post('/webhook/kofi', webhookLimiter, async (req, res) => {
  try {
    const raw = req.body?.data;
    if (!raw) return res.sendStatus(400);

    let parsed;
    try { parsed = JSON.parse(raw); } catch { return res.sendStatus(400); }

    const result = KofiSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn('Ko-fi invalid payload', { issues: result.error.issues });
      return res.sendStatus(400);
    }

    const data = result.data;
    if (data.verification_token !== process.env.KOFI_VERIFICATION_TOKEN) {
      logger.warn('Ko-fi invalid token');
      return res.sendStatus(401);
    }

    const iapId = data.message?.match(/\[iap:([^\]]+)\]/)?.[1] || null;
    const ok    = await saveEarning({
      platform: 'Ko-fi', amount: data.amount,
      currency: data.currency, source: data.type.toLowerCase().replace(' ', '_'),
      transactionId: data.kofi_transaction_id, iapId,
    });

    if (!ok) return res.sendStatus(500);
    res.sendStatus(200);
  } catch (err) {
    logger.error('Ko-fi webhook error', { error: err.message });
    res.sendStatus(500);
  }
});

// ── PayPal Webhook ────────────────────────────────────────────
app.post('/webhook/paypal', webhookLimiter, async (req, res) => {
  try {
    const result = PaypalSchema.safeParse(req.body);
    if (!result.success) return res.sendStatus(400);

    const ev = result.data;
    if (ev.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const ok = await saveEarning({
        platform: 'PayPal',
        amount:   ev.resource.amount.value,
        currency: ev.resource.amount.currency_code,
        source:   'payment',
        transactionId: ev.resource.id,
        iapId:    ev.resource.custom_id || null,
      });
      if (!ok) return res.sendStatus(500);
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error('PayPal webhook error', { error: err.message });
    res.sendStatus(500);
  }
});

// ── products.json ─────────────────────────────────────────────
app.get('/products.json', (req, res) => {
  res.sendFile(join(__dirname, 'products.json'));
});

// ── Admin: GET earnings ───────────────────────────────────────
app.get('/api/admin/earnings', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('earnings').select('*').order('date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    logger.error('Admin earnings fetch failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: POST earning ───────────────────────────────────────
app.post('/api/admin/earnings', adminLimiter, requireAdmin, async (req, res) => {
  const result = ManualEarningSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }
  const { platform, amount, currency, source, status, iap_id } = result.data;
  const ok = await saveEarning({ platform, amount, currency, source, status, iapId: iap_id });
  ok ? res.json({ success: true }) : res.status(500).json({ error: 'Insert failed' });
});

// ── Admin: GET products ───────────────────────────────────────
app.get('/api/admin/products', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { readFileSync } = await import('fs');
    const products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf8'));
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health ────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { error } = await supabase
      .from('earnings').select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    logger.error('Health check failed', { error: err.message });
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
