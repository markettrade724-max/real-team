async function gemini(prompt, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      
      // إذا كان الموديل مزدحماً، انتظر ثم حاول مرة أخرى
      if (data.error && data.error.message.includes("high demand")) {
        console.warn(`⚠️ High demand, retrying in 10s... (Attempt ${i+1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      if (data.error) throw new Error(data.error.message);
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
