import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

// المتغيرات البيئية (سيتم تعيينها في Railway)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// دالة لإضافة ربح
async function addEarning(platform, amount, currency, source, status, transactionId) {
    const { error } = await supabase.from('earnings').insert([{
        platform, amount, currency, source, status, type: 'income',
        transaction_id: transactionId, date: new Date()
    }]);
    if (error) console.error('Insert error:', error);
    else console.log(`✅ Added: ${amount} ${currency} from ${platform}`);
}

// نقطة استقبال Ko-fi
app.post('/webhook/kofi', async (req, res) => {
    const { type, data } = req.body;
    if (type === 'Donation') {
        await addEarning('Ko-fi', data.amount, data.currency, 'donation', 'completed', data.transaction_id);
    }
    res.sendStatus(200);
});

// نقطة استقبال PayPal
app.post('/webhook/paypal', async (req, res) => {
    const event = req.body;
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const amount = event.resource.amount.value;
        const currency = event.resource.amount.currency_code;
        await addEarning('PayPal', amount, currency, 'payment', 'completed', event.resource.id);
    }
    res.sendStatus(200);
});

// نقطة فحص الصحة
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
