// /api/explain.js — Vercel Serverless Function
// Proxies requests to Google Gemini API so the API key never reaches the browser.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY missing.' });
  }

  let body;
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const question = body && body.question ? String(body.question).trim() : '';
  if (!question) {
    return res.status(400).json({ error: 'Question is required.' });
  }

  // Build system prompt
  const systemPrompt = `You are an AI tutor helping students understand satellite imagery and Earth observation data.

Rules:
- Answer in plain language a high-school student can understand.
- Explain satellite imagery concepts simply (NDVI, NDVI bands, true color, false color, etc.).
- Never claim certainty about causes that satellite imagery alone cannot prove (e.g., "this deforestation was caused by logging" — say "could indicate" instead).
- Keep answers under 150 words.
- If unsure, say so clearly.
- Be encouraging and educational.

User question: ${question}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: systemPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', r.status, errText);
      return res.status(502).json({ error: 'AI service unavailable. Please try again later.' });
    }

    const data = await res.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts[0].text
      : 'I could not generate a response. Please try again.';

    return res.status(200).json({ reply: text.trim() });
  } catch (err) {
    console.error('Gemini fetch error:', err);
    return res.status(500).json({ error: 'Network error contacting AI service. Please try again.' });
  }
}
