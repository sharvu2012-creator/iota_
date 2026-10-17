const MODEL = 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

module.exports = async function handler(req, res) {
  try {
    const key = process.env.GEMINI_API_KEY;

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, keyPresent: Boolean(key) });
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Use POST' });
    }
    if (!key) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || !body.question) {
      return res.status(400).json({ error: 'Missing question' });
    }

    const context = body.results ? JSON.stringify(body.results).slice(0, 6000) : 'none';
    const payload = {
      systemInstruction: {
        parts: [{
          text: 'You are a friendly tutor for students and farmers learning about satellite data. ' +
                'Explain in plain language, mention uncertainty, never claim causes that satellite ' +
                'data cannot prove, and keep answers under 150 words.'
        }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: 'Results data: ' + context + '\n\nQuestion: ' + body.question }]
      }]
    };

    const callGemini = (model) => fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload)
    });

    let r = await callGemini(MODEL);

    // If the model name is unknown, find a current Flash model automatically
    if (r.status === 404) {
      const listRes = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
      const listData = await listRes.json();
      const found = (listData.models || []).find(m =>
        /flash/.test(m.name) &&
        !/lite|image|tts|live|exp/.test(m.name) &&
        (m.supportedGenerationMethods || []).includes('generateContent')
      );
      if (found) r = await callGemini(found.name.replace('models/', ''));
    }

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        error: (data && data.error && data.error.message) || 'Gemini request failed',
        status: r.status
      });
    }

    const parts = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts : [];
    const answer = (parts || []).map(p => p.text || '').join('').trim();
    return res.status(200).json({ answer: answer || 'No answer was returned.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
