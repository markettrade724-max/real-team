import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تخديم ملفات HTML من مجلد public
app.use(express.static(join(__dirname, 'public')));

// ─── متغيرات البيئة ───────────────────────────────────────────
const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    KOFI_VERIFICATION_TOKEN,
    ADMIN_PASSWORD,
    PORT = 3000,
} = process.env;

const missing = [
    !SUPABASE_URL              && 'SUPABASE_URL',
    !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !KOFI_VERIFICATION_TOKEN   && 'KOFI_VERIFICATION_TOKEN',
    !ADMIN_PASSWORD            && 'ADMIN_PASSWORD',
].filter(Boolean);

if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    process.exit(1);
}

// ─── Supabase Client ──────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Middleware: حماية مسارات /api/admin ─────────────────────
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token || token !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ─── دالة إضافة ربح ──────────────────────────────────────────
async function addEarning({ platform, amount, currency, source, status, transactionId }) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        console.error(`❌ Invalid amount: "${amount}" from ${platform}`);
        return false;
    }

    const { error } = await supabase.from('earnings').insert([{
        platform,
        amount: parsedAmount,
        currency: currency || 'USD',
        source,
        status,
        type: 'income',
        transaction_id: transactionId || null,
        date: new Date().toISOString(),
    }]);

    if (error) {
        console.error(`❌ Insert error [${platform}]:`, error.message);
        return false;
    }

    console.log(`✅ Saved: ${parsedAmount} ${currency} from ${platform}`);
    return true;
}

// ─── Ko-fi Webhook ────────────────────────────────────────────
app.post('/webhook/kofi', async (req, res) => {
    try {
        const raw = req.body?.data;
        if (!raw) return res.sendStatus(400);

        let data;
        try { data = JSON.parse(raw); }
        catch { return res.sendStatus(400); }

        // التحقق من verification token
        if (data.verification_token !== KOFI_VERIFICATION_TOKEN) {
            console.warn('⚠️ Ko-fi: invalid token');
            return res.sendStatus(401);
        }

        if (data.type === 'Donation' || data.type === 'Shop Order' || data.type === 'Subscription') {
            const ok = await addEarning({
                platform: 'Ko-fi',
                amount: data.amount,
                currency: data.currency || 'USD',
                source: data.type.toLowerCase().replace(' ', '_'),
                status: 'completed',
                transactionId: data.kofi_transaction_id,
            });
            if (!ok) return res.sendStatus(500);
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Ko-fi error:', err.message);
        res.sendStatus(500);
    }
});

// ─── PayPal Webhook ───────────────────────────────────────────
app.post('/webhook/paypal', async (req, res) => {
    try {
        const event = req.body;
        if (event?.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const amount       = event?.resource?.amount?.value;
            const currency     = event?.resource?.amount?.currency_code;
            const transactionId = event?.resource?.id;

            if (!amount || !currency) return res.sendStatus(400);

            const ok = await addEarning({
                platform: 'PayPal',
                amount, currency,
                source: 'payment',
                status: 'completed',
                transactionId,
            });
            if (!ok) return res.sendStatus(500);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error('❌ PayPal error:', err.message);
        res.sendStatus(500);
    }
});

// ─── Admin API: جلب الأرباح ───────────────────────────────────
app.get('/api/admin/earnings', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('earnings')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Admin API: إضافة ربح يدوي ───────────────────────────────
app.post('/api/admin/earnings', requireAdmin, async (req, res) => {
    try {
        const { platform, amount, currency, source, status } = req.body;
        if (!platform || !amount) {
            return res.status(400).json({ error: 'platform and amount are required' });
        }

        const ok = await addEarning({ platform, amount, currency, source, status });
        if (!ok) return res.status(500).json({ error: 'Failed to insert' });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase
            .from('earnings')
            .select('*', { count: 'exact', head: true });
        if (error) throw error;
        res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'degraded', database: 'disconnected', error: err.message });
    }
});

// ─── تشغيل السيرفر ────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
