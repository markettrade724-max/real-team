import express from 'express';

const app = express();
const PORT = 3000;

app.get('/api/test', (req, res) => {
  res.json({ message: '✅ Server is working!', time: new Date().toISOString() });
});

app.get('/api/earnings', (req, res) => {
  res.json({ success: true, data: [] });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Test: http://localhost:${PORT}/api/test`);
});
