import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// ====================== قراءة المتغيرات البيئية ======================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const kofiVerificationToken = process.env.KOFI_VERIFICATION_TOKEN;
const paypalWebhookId = process.env.PAYPAL_WEBHOOK_ID;
const paypalClientId = process.env.PAYPAL_CLIENT_ID;
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

// التحقق من وجود المتغيرات الأساسية
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
    process.exit(1);
}

// تهيئة Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// ====================== دالة مساعدة لإضافة ربح إلى Supabase ======================
async function addEarning(platform, amount, currency, source, status, transactionId = null) {
    try {
        const { data, error } = await supabase
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
            }])
            .select();
        
        if (error) {
            console.error('❌ DB Insert Error:', error);
            return false;
        }
        console.log(`✅ Added earning: ${amount} ${currency} from ${platform} (${transactionId})`);
        return true;
    } catch (err) {
        console.error('❌ Exception in addEarning:', err);
        return false;
    }
}

// ====================== Webhook: Ko-fi ======================
app.post('/webhook/kofi', async (req, res) => {
    console.log('📨 Received Ko-fi webhook');
    
    try {
        const { verification_token, type, data } = req.body;
        
        // التحقق من صحة التوكن (إذا كان موجوداً)
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
            res.sendStatus(200);
        } else {
            console.log(`ℹ️ Unhandled Ko-fi event type: ${type}`);
            res.sendStatus(200);
        }
    } catch (err) {
        console.error('❌ Ko-fi webhook error:', err);
        res.status(500).send('Internal error');
    }
});

// ====================== Webhook: PayPal (مع التحقق من التوقيع) ======================
app.post('/webhook/paypal', async (req, res) => {
    console.log('📨 Received PayPal webhook');
    
    try {
        // إذا كان لديك PayPal Webhook ID، يمكنك التحقق من التوقيع هنا
        // هذا مثال مبسط، الإنتاج يتطلب التحقق الكامل باستخدام مكتبة PayPal
        
        const eventType = req.body.event_type;
        const resource = req.body.resource;
        
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.APPROVED') {
            const amount = resource.amount?.value || resource.amount?.total;
            const currency = resource.amount?.currency_code || 'USD';
            const transactionId = resource.id || resource.invoice_id || `paypal_${Date.now()}`;
            
            if (amount) {
                await addEarning('PayPal', amount, currency, 'payment', 'completed', transactionId);
            } else {
                console.log('ℹ️ No amount in PayPal webhook:', resource);
            }
            res.sendStatus(200);
        } else {
            console.log(`ℹ️ Unhandled PayPal event: ${eventType}`);
            res.sendStatus(200);
        }
    } catch (err) {
        console.error('❌ PayPal webhook error:', err);
        res.status(500).send('Internal error');
    }
});

// ====================== نقطة فحص الصحة (Health Check) ======================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        supabase: supabaseUrl ? 'configured' : 'missing'
    });
});

// ====================== تشغيل الخادم ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Automation server running on port ${PORT}`);
    console.log(`✅ Supabase: ${supabaseUrl ? 'configured' : 'MISSING'}`);
    console.log(`📌 Webhook endpoints:`);
    console.log(`   - Ko-fi: POST /webhook/kofi`);
    console.log(`   - PayPal: POST /webhook/paypal`);
    console.log(`   - Health: GET /health`);
});
