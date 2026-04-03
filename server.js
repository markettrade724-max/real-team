import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const app = express();

// ====================== إعدادات الوسائط ======================
app.use(express.json()); // لـ PayPal (يرسل JSON)
app.use(express.urlencoded({ extended: true })); // لـ Ko-fi (يرسل x-www-form-urlencoded)

// ====================== قراءة المتغيرات البيئية ======================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ✅ SERVICE_ROLE_KEY
const kofiVerificationToken = process.env.KOFI_VERIFICATION_TOKEN;
const paypalWebhookId = process.env.PAYPAL_WEBHOOK_ID;
const paypalClientId = process.env.PAYPAL_CLIENT_ID;
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

// التحقق من وجود المتغيرات الأساسية
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// تهيئة Supabase بـ SERVICE_ROLE_KEY (يتجاوز RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ====================== دالة مساعدة لإضافة ربح ======================
async function addEarning(platform, amount, currency, source, status, transactionId = null) {
    try {
        const { error } = await supabase
            .from('earnings')
            .insert([{
                platform,
                amount: parseFloat(amount),
                currency: currency || 'USD',
                source: source || 'auto',
                status: status || 'completed',
                type: 'income',
                transaction_id: transactionId,
                date: new Date().toISOString()
            }]);
        
        if (error) {
            console.error('❌ DB Insert Error:', error);
            return false;
        }
        console.log(`✅ Added: ${amount} ${currency} from ${platform} (${transactionId})`);
        return true;
    } catch (err) {
        console.error('❌ Exception:', err);
        return false;
    }
}

// ====================== Webhook: Ko-fi (مع التحقق من التوكن) ======================
app.post('/webhook/kofi', async (req, res) => {
    console.log('📨 Ko-fi webhook received');
    
    try {
        // Ko-fi يرسل البيانات كـ x-www-form-urlencoded مع حقل data يحتوي على JSON
        let payload;
        if (req.body.data) {
            payload = JSON.parse(req.body.data);
        } else {
            payload = req.body;
        }
        
        const { verification_token, type, data } = payload;
        
        // التحقق من صحة التوكن
        if (kofiVerificationToken && verification_token !== kofiVerificationToken) {
            console.warn('⚠️ Invalid Ko-fi verification token');
            return res.status(403).send('Invalid token');
        }
        
        if (type === 'Donation' || type === 'Shop Order') {
            const amount = data.amount;
            const currency = data.currency || 'USD';
            const transactionId = data.transaction_id || data.order_id || `kofi_${Date.now()}`;
            const source = type === 'Donation' ? 'donation' : 'shop';
            
            await addEarning('Ko-fi', amount, currency, source, 'completed', transactionId);
        }
        
        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Ko-fi error:', err);
        res.status(500).send('Internal error');
    }
});

// ====================== Webhook: PayPal (مع التحقق من التوقيع) ======================
async function verifyPayPalWebhook(req, body) {
    // إذا لم يتم إعداد webhook id، نسمح مؤقتاً (مع تحذير)
    if (!paypalWebhookId || !paypalClientId || !paypalClientSecret) {
        console.warn('⚠️ PayPal webhook verification disabled (missing env vars)');
        return true;
    }
    
    // الحصول على توقيع PayPal من headers
    const transmissionSig = req.headers['paypal-transmission-sig'];
    const transmissionId = req.headers['paypal-transmission-id'];
    const transmissionTime = req.headers['paypal-transmission-time'];
    const certUrl = req.headers['paypal-cert-url'];
    const authAlgo = req.headers['paypal-auth-algo'];
    
    if (!transmissionSig || !transmissionId) {
        console.warn('⚠️ Missing PayPal signature headers');
        return false;
    }
    
    // الحصول على access token من PayPal
    const auth = Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString('base64');
    const tokenRes = await fetch('https://api.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
        console.error('❌ Failed to get PayPal access token');
        return false;
    }
    
    // التحقق من التوقيع
    const verifyRes = await fetch('https://api.paypal.com/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            transmission_id: transmissionId,
            transmission_time: transmissionTime,
            webhook_id: paypalWebhookId,
            webhook_event: body,
            cert_url: certUrl,
            auth_algo: authAlgo,
            transmission_sig: transmissionSig
        })
    });
    
    const verifyData = await verifyRes.json();
    return verifyData.verification_status === 'SUCCESS';
}

app.post('/webhook/paypal', async (req, res) => {
    console.log('📨 PayPal webhook received');
    
    try {
        // التحقق من التوقيع
        const isValid = await verifyPayPalWebhook(req, req.body);
        if (!isValid) {
            console.warn('⚠️ Invalid PayPal signature');
            return res.status(401).send('Invalid signature');
        }
        
        const eventType = req.body.event_type;
        const resource = req.body.resource;
        
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            const amount = resource.amount?.value;
            const currency = resource.amount?.currency_code;
            const transactionId = resource.id;
            
            if (amount) {
                await addEarning('PayPal', amount, currency, 'payment', 'completed', transactionId);
            }
        }
        
        res.sendStatus(200);
    } catch (err) {
        console.error('❌ PayPal error:', err);
        res.status(500).send('Internal error');
    }
});

// ====================== نقطة فحص الصحة ======================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        supabase: supabaseUrl ? 'configured' : 'missing',
        service_role: supabaseServiceKey ? 'configured' : 'missing'
    });
});

// ====================== تشغيل الخادم ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Supabase service role: ${supabaseServiceKey ? 'configured' : 'MISSING'}`);
    console.log(`✅ Ko-fi verification: ${kofiVerificationToken ? 'enabled' : 'disabled'}`);
    console.log(`✅ PayPal verification: ${paypalWebhookId ? 'enabled' : 'disabled'}`);
});
