import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات CORS - السماح لـ GitHub Pages
app.use(cors({
    origin: ['https://markettrade724-max.github.io', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// نقطة الاختبار
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ Server is working!',
        supabase: supabaseUrl ? 'Connected' : 'No',
        time: new Date().toISOString()
    });
});

// جلب جميع الأرباح
app.get('/api/earnings', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('earnings')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.json({ success: false, error: error.message, data: [] });
    }
});

// إضافة ربح جديد
app.post('/api/earnings', async (req, res) => {
    try {
        const { platform, amount, source, status } = req.body;
        
        const { data, error } = await supabase
            .from('earnings')
            .insert([{
                platform: platform || 'unknown',
                amount: amount || 0,
                source: source || 'manual',
                status: status || 'pending',
                type: 'income',
                date: new Date().toISOString()
            }])
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// إجمالي الأرباح
app.get('/api/earnings/total', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('earnings')
            .select('amount')
            .eq('type', 'income')
            .eq('status', 'completed');
        
        if (error) throw error;
        const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
        res.json({ success: true, total });
    } catch (error) {
        res.json({ success: false, total: 0 });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({
        name: 'AI Agents API',
        version: '1.0.0',
        endpoints: ['/api/test', '/api/earnings', '/api/earnings/total']
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Supabase: ${supabaseUrl ? 'Configured' : 'Missing'}`);
});
