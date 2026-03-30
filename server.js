import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = 3000;

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());

// نقطة اختبار بسيطة
app.get('/api/test', (req, res) => {
  res.json({ 
    message: '✅ Server is working!', 
    supabase: supabaseUrl ? 'Connected' : 'Not configured',
    time: new Date().toISOString() 
  });
});

// جلب جميع الأرباح من Supabase
app.get('/api/earnings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('earnings')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error:', error.message);
    res.json({ success: false, error: error.message, data: [] });
  }
});

// إضافة ربح جديد إلى Supabase
app.post('/api/earnings', async (req, res) => {
  try {
    const { source, amount, platform, status, type } = req.body;
    
    const { data, error } = await supabase
      .from('earnings')
      .insert([{
        source: source || 'manual',
        amount: amount || 0,
        type: type || 'income',
        platform: platform || 'unknown',
        status: status || 'pending',
        date: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error:', error.message);
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
    
    const total = data.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    res.json({ success: true, total });
  } catch (error) {
    res.json({ success: false, error: error.message, total: 0 });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Supabase: ${supabaseUrl ? 'Configured' : 'Missing'}`);
  console.log(`✅ Test: http://localhost:${PORT}/api/test`);
});
