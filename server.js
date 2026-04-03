import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// نقطة فحص الصحة
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// نقطة اختبار بسيطة
app.get('/api/test', async (req, res) => {
    try {
        const { data, error } = await supabase.from('earnings').select('count', { count: 'exact', head: true });
        if (error) throw error;
        res.json({ success: true, message: 'Supabase connected', count: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Supabase: ${supabaseUrl ? 'configured' : 'MISSING'}`);
});
