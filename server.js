import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// تمكين CORS لجميع الطلبات
app.use(cors({ origin: '*' }));
app.use(express.json());

// نقطة اختبار بسيطة
app.get('/api/test', (req, res) => {
    res.json({ message: '✅ Server is working!', time: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
