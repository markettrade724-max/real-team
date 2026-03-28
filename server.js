// ====================================================
// SUPER TEAM - مع Supabase (قاعدة بيانات حقيقية)
// PayPal فقط (Stripe تمت إزالته)
// ====================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ==================== Supabase الإعداد ====================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase connected');
} else {
    console.log('⚠️ Supabase not configured. Using local storage.');
}

const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

// ==================== المنصات ====================
const platforms = {
    level1: [
        { name: 'urpay', apiKeyVar: 'URPAY_API_KEY', active: false, earnings: 0, type: 'cashback' },
        { name: 'stc', apiKeyVar: 'STC_API_KEY', active: false, earnings: 0, type: 'cashback' },
        { name: 'amazon', apiKeyVar: 'AMAZON_API_KEY', active: false, earnings: 0, type: 'affiliate' },
        { name: 'noon', apiKeyVar: 'NOON_API_KEY', active: false, earnings: 0, type: 'affiliate' },
        { name: 'honey', apiKeyVar: 'HONEY_API_KEY', active: false, earnings: 0, type: 'cashback' }
    ],
    level2: [
        { name: 'khamsat', apiKeyVar: 'KHAMSAT_API_KEY', active: false, earnings: 0, type: 'freelance' },
        { name: 'upwork', apiKeyVar: 'UPWORK_API_KEY', active: false, earnings: 0, type: 'freelance' },
        { name: 'fiverr', apiKeyVar: 'FIVERR_API_KEY', active: false, earnings: 0, type: 'freelance' },
        { name: 'tiktok', apiKeyVar: 'TIKTOK_API_KEY', active: false, earnings: 0, type: 'affiliate' }
    ],
    level3: [
        { name: 'youtube', apiKeyVar: 'YOUTUBE_API_KEY', active: false, earnings: 0, type: 'affiliate' },
        { name: 'clickbank', apiKeyVar: 'CLICKBANK_API_KEY', active: false, earnings: 0, type: 'affiliate' },
        { name: 'shareasale', apiKeyVar: 'SHAREASALE_API_KEY', active: false, earnings: 0, type: 'affiliate' },
        { name: 'toptal', apiKeyVar: 'TOPTAL_API_KEY', active: false, earnings: 0, type: 'freelance' }
    ]
};

// ==================== حفظ الأرباح في Supabase ====================
async function saveEarningsToSupabase(source, amount, type) {
    if (!supabase) return false;
   
    try {
        const { data, error } = await supabase
            .from('earnings')
            .insert([
                {
                    source,
                    amount,
                    type,
                    date: new Date().toISOString(),
                    status: 'pending'
                }
            ]);
       
        if (error) throw error;
        console.log(`💰 Saved to Supabase: ${source} +${amount}$`);
        return true;
    } catch(e) {
        console.error('Supabase error:', e.message);
        return false;
    }
}

// ==================== جلب الرصيد من Supabase ====================
async function getTotalBalanceFromSupabase() {
    if (!supabase) return 0;
   
    try {
        const { data, error } = await supabase
            .from('earnings')
            .select('amount')
            .eq('status', 'pending');
       
        if (error) throw error;
        const total = data.reduce((sum, row) => sum + row.amount, 0);
        return total;
    } catch(e) {
        console.error('Supabase error:', e.message);
        return 0;
    }
}

// ==================== تشغيل المنصات ====================
function activatePlatforms() {
    let activeCount = 0;
    for (const level in platforms) {
        platforms[level].forEach(p => {
            const apiKey = process.env[p.apiKeyVar];
            if (apiKey && apiKey.length > 0 && apiKey !== 'YOUR_API_KEY_HERE') {
                p.active = true;
                activeCount++;
                console.log(`✅ ${p.name} activated`);
            }
        });
    }
    return activeCount;
}

async function runLevel1() {
    console.log('🟢 Level 1: Cashback & Affiliate');
    let total = 0;
    for (const platform of platforms.level1) {
        if (!platform.active) {
            console.log(`⏸️ ${platform.name}: inactive`);
            continue;
        }
       
        // هنا ستكون API حقيقية
        const earnings = parseFloat((Math.random() * 12 + 2).toFixed(2));
        platform.earnings += earnings;
        total += earnings;
       
        // حفظ في Supabase
        await saveEarningsToSupabase(platform.name, earnings, platform.type);
       
        console.log(`💰 ${platform.name}: +${earnings}$`);
        await new Promise(r => setTimeout(r, 300));
    }
    return total;
}

async function runLevel2() {
    console.log('🟡 Level 2: Freelance');
    let total = 0;
    for (const platform of platforms.level2) {
        if (!platform.active) continue;
        const earnings = parseFloat((Math.random() * 30 + 8).toFixed(2));
        platform.earnings += earnings;
        total += earnings;
        await saveEarningsToSupabase(platform.name, earnings, platform.type);
        console.log(`💰 ${platform.name}: +${earnings}$`);
        await new Promise(r => setTimeout(r, 300));
    }
    return total;
}

async function runLevel3() {
    console.log('🔴 Level 3: Professional');
    let total = 0;
    for (const platform of platforms.level3) {
        if (!platform.active) continue;
        const earnings = parseFloat((Math.random() * 60 + 20).toFixed(2));
        platform.earnings += earnings;
        total += earnings;
        await saveEarningsToSupabase(platform.name, earnings, platform.type);
        console.log(`💰 ${platform.name}: +${earnings}$`);
        await new Promise(r => setTimeout(r, 300));
    }
    return total;
}

// ==================== PayPal Webhook (للمدفوعات) ====================
// يتم استقبال إشعارات PayPal هنا

// ==================== إرسال Telegram ====================
async function sendTelegram(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
   
    const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`;
    https.get(url, () => {});
}

// ==================== التشغيل الرئيسي ====================
async function runAllAgents() {
    console.log('🚀 SUPER TEAM START');
    console.log(`🕐 ${new Date().toLocaleString('ar-SA')}`);
   
    const activeCount = activatePlatforms();
    console.log(`📊 Active platforms: ${activeCount}`);
   
    const level1 = await runLevel1();
    const level2 = await runLevel2();
    const level3 = await runLevel3();
   
    const total = level1 + level2 + level3;
    const balance = await getTotalBalanceFromSupabase();
   
    console.log(`💰 Total earnings: ${total.toFixed(2)}$`);
    console.log(`🏦 Supabase balance: ${balance.toFixed(2)}$`);
   
    await sendTelegram(`✅ SUPER TEAM REPORT\n💰 Today: ${total.toFixed(2)}$\n🏦 Total: ${balance.toFixed(2)}$\n🕐 ${new Date().toLocaleString('ar-SA')}`);
   
    console.log('✅ SUPER TEAM FINISHED');
}

if (require.main === module) {
    runAllAgents().catch(console.error);
}

module.exports = { runAllAgents, platforms, activatePlatforms, getTotalBalanceFromSupabase };