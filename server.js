// server.js - مع Supabase API حقيقي
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============ 1. جلب جميع الأرباح ============
app.get('/api/earnings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('earnings')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 2. جلب إجمالي الأرباح ============
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
    console.error('Error calculating total:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 3. إضافة ربح جديد ============
app.post('/api/earnings', async (req, res) => {
  try {
    const { source, amount, type, platform, status, transaction_id } = req.body;
    
    const { data, error } = await supabase
      .from('earnings')
      .insert([
        {
          source,
          amount,
          type: type || 'income',
          platform,
          status: status || 'pending',
          transaction_id: transaction_id || null,
          date: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error adding earning:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 4. تحديث حالة ربح ============
app.put('/api/earnings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transaction_id } = req.body;
    
    const { data, error } = await supabase
      .from('earnings')
      .update({ status, transaction_id })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error updating earning:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 5. تقرير حسب المنصة ============
app.get('/api/reports/platform', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('earnings')
      .select('platform, amount')
      .eq('type', 'income')
      .eq('status', 'completed');

    if (error) throw error;
    
    const platformTotals = {};
    data.forEach(item => {
      const platform = item.platform;
      const amount = parseFloat(item.amount);
      platformTotals[platform] = (platformTotals[platform] || 0) + amount;
    });
    
    res.json({ success: true, data: platformTotals });
  } catch (error) {
    console.error('Error generating platform report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 6. تشغيل السيرفر ============
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Supabase connected: ${supabaseUrl ? 'Yes' : 'No'}`);
});
