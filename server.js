import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// ====================== إعدادات CORS المتقدمة ======================
// السماح لـ GitHub Pages بالاتصال
const allowedOrigins = [
    'https://markettrade724-max.github.io',
    'http://localhost:3000',
    'http://localhost:5500'
];

app.use(cors({
    origin: function(origin, callback) {
        // السماح بالطلبات بدون origin (مثل التطبيقات المحلية)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('Blocked origin:', origin);
            callback(null, true); // نسمح مؤقتاً للاختبار
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apikey']
}));

app.use(express.json());

// ====================== Supabase Client ======================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase configured');
} else {
    console.log('⚠️ Supabase not configured - missing environment variables');
}

// ====================== نقطة الاختبار ======================
app.get('/api/test', (req, res) => {
    res.json({
        message: '✅ Server is working!',
        cors: 'Enabled',
        supabase: supabase ? 'Configured' : 'Not configured',
        time: new Date().toISOString()
    });
});

// ====================== جلب جميع الأرباح ======================
app.get('/api/earnings', async (req, res) => {
    try {
        if (!supabase) {
            return res.json({ success: true, data: [], message: 'Supabase not configured' });
        }
        
        const { data, error } = await supabase
            .from('earnings')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error('Error fetching earnings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ====================== إضافة ربح جديد ======================
app.post('/api/earnings', async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({ success: false, error: 'Supabase not configured' });
        }
        
        const { platform, amount, source, status, type } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        
        const { data, error } = await supabase
            .from('earnings')
            .insert([{
                platform: platform || 'unknown',
                amount: amount,
                source: source || 'manual',
                status: status || 'pending',
                type: type || 'income',
                date: new Date().toISOString()
            }])
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (error) {
        console.error('Error adding earning:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ====================== إجمالي الأرباح ======================
app.get('/api/earnings/total', async (req, res) => {
    try {
        if (!supabase) {
            return res.json({ success: true, total: 0 });
        }
        
        const { data, error } = await supabase
            .from('earnings')
            .select('amount')
            .eq('type', 'income')
            .eq('status', 'completed');
        
        if (error) throw error;
        
        const total = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
        res.json({ success: true, total });
    } catch (error) {
        res.json({ success: false, error: error.message, total: 0 });
    }
});

// ====================== نقطة رئيسية ======================
app.get('/', (req, res) => {
    res.json({
        name: 'AI Agents API',
        version: '1.0.0',
        endpoints: ['/api/test', '/api/earnings', '/api/earnings/total'],
        status: 'running',
        cors: 'enabled for GitHub Pages'
    });
});

// ====================== تشغيل السيرفر ======================
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
    console.log(`✅ Supabase: ${supabase ? 'Configured' : 'Missing'}`);
    console.log(`✅ Test: http://localhost:${PORT}/api/test`);
});
