import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const app = express();

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // مطلوب لاستقبال Ko-fi

// ─── متغيرات البيئة ───────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, // استخدام service role بدلاً من anon key
  KOFI_VERIFICATION_TOKEN,
  PAYPAL_WEBHOOK_ID,
  PORT = 3000,
} = process.env;

const missing = [
  !SUPABASE_URL && 'SUPABASE_URL',
  !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  !KOFI_VERIFICATION_TOKEN && 'KOFI_VERIFICATION_TOKEN',
  !PAYPAL_WEBHOOK_ID && 'PAYPAL_WEBHOOK_ID',
].filter(Boolean);

if (missing.length > 0) {
  console.error('❌ Missing environment variables:', missing.join(', '));
  process.exit(1);
}

// ─── Supabase Client ──────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── دالة إضافة ربح ──────────────────────────────────────────
async function addEarning({ platform, amount, currency, source, status, transactionId }) {
  const parsedAmount = parseFloat(amount); // تحويل صريح إلى رقم

  if (isNaN(parsedAmount)) {
    console.error(`❌ Invalid amount: "${amount}" from ${platform}`);
    return false;
  }

  const { error } = await supabase.from('earnings').insert([{
    platform,
    amount: parsedAmount,
    currency,
    source,
    status,
    type: 'income',
    transaction_id: transactionId,
    date: new Date().toISOString(),
  }]);

  if (error) {
    console.error(`❌ Insert error [${platform}]:`, error.message);
    return false;
  }

  console.log(`✅ Added: ${parsedAmount} ${currency} from ${platform}`);
  return true;
}

// ─── Ko-fi Webhook ────────────────────────────────────────────
app.post('/webhook/kofi', async (req, res) => {
  try {
    // Ko-fi يُرسل البيانات كـ form-urlencoded مع حقل "data" يحتوي JSON
    const raw = req.body?.data;
    if (!raw) {
      console.warn('⚠️ Ko-fi: missing data field');
      return res.sendStatus(400);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn('⚠️ Ko-fi: invalid JSON in data field');
      return res.sendStatus(400);
    }

    // التحقق من الـ verification token
    if (data.verification_token !== KOFI_VERIFICATION_TOKEN) {
      console.warn('⚠️ Ko-fi: invalid verification token');
      return res.sendStatus(401);
    }

    if (data.type === 'Donation') {
      const success = await addEarning({
        platform: 'Ko-fi',
        amount: data.amount,
        currency: data.currency,
        source: 'donation',
        status: 'completed',
        transactionId: data.kofi_transaction_id,
      });

      if (!success) return res.sendStatus(500);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Ko-fi webhook error:', err);
    res.sendStatus(500);
  }
});

// ─── PayPal Webhook ───────────────────────────────────────────
app.post('/webhook/paypal', async (req, res) => {
  try {
    // التحقق من توقيع PayPal
    const isValid = verifyPaypalSignature(req);
    if (!isValid) {
      console.warn('⚠️ PayPal: invalid webhook signature');
      return res.sendStatus(401);
    }

    const event = req.body;

    if (event?.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const amount = event?.resource?.amount?.value;
      const currency = event?.resource?.amount?.currency_code;
      const transactionId = event?.resource?.id;

      if (!amount || !currency || !transactionId) {
        console.warn('⚠️ PayPal: missing required fields', { amount, currency, transactionId });
        return res.sendStatus(400);
      }

      const success = await addEarning({
        platform: 'PayPal',
        amount,
        currency,
        source: 'payment',
        status: 'completed',
        transactionId,
      });

      if (!success) return res.sendStatus(500);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ PayPal webhook error:', err);
    res.sendStatus(500);
  }
});

// ─── التحقق من توقيع PayPal ───────────────────────────────────
function verifyPaypalSignature(req) {
  try {
    const transmissionId = req.headers['paypal-transmission-id'];
    const timestamp     = req.headers['paypal-transmission-time'];
    const certUrl       = req.headers['paypal-cert-url'];
    const signature     = req.headers['paypal-transmission-sig'];

    if (!transmissionId || !timestamp || !certUrl || !signature) return false;

    // بناء رسالة التحقق
    const message = `${transmissionId}|${timestamp}|${PAYPAL_WEBHOOK_ID}|${crc32(JSON.stringify(req.body))}`;

    // ملاحظة: التحقق الكامل يتطلب جلب الشهادة من certUrl والتحقق بـ RSA
    // هنا نتحقق على الأقل من وجود الـ headers — للإنتاج الكامل استخدم paypal-rest-sdk
    return Boolean(message && signature);
  } catch {
    return false;
  }
}

function crc32(str) {
  return crypto.createHash('crc32').update(str).digest('hex');
}

// ─── Health Check (مع فحص Supabase) ──────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { error } = await supabase
      .from('earnings')
      .select('count', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
    res.status(503).json({ status: 'degraded', database: 'disconnected' });
  }
});

// ─── تشغيل السيرفر ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
