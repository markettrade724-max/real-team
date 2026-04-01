import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ قائمة النطاقات المسموح بها فقط
const allowedOrigins = [
    'https://markettrade724-max.github.io',
    'http://localhost:3000'  // للتطوير المحلي
];

app.use(cors({
    origin: function (origin, callback) {
        // السماح للطلبات بدون origin (مثل Postman، ولكن احذر)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ... باقي الـ endpoints ...

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
});
