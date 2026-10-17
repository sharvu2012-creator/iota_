// /api/explain.js — Vercel Serverless Function (CommonJS)
// Proxies questions to the Google Gemini API so the API key never reaches the browser.
//
// Design notes:
// - No external packages. The Gemini REST API is called with Node's built-in
//   global fetch (Node 18+), so nothing has to be installed or bundled.
// - CommonJS on purpose: package.json has no "type": "module", so a .js file is
//   CommonJS by default. Using ESM syntax here throws a SyntaxError at load time,
//   which is what surfaces as FUNCTION_INVOCATION_FAILED.
// - Every failure path returns JSON, and the whole handler is wrapped in a
//   try/catch so an unexpected error can never take the function down.

'use strict';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

// Current, generally-available Gemini Flash model.
// Verified against Google's model list: https://ai.google.dev/gemini-api/docs/models
const GEMINI_MODEL = 'gemini-3.8-flash';

// Gemini REST endpoint (Interactions API, beta version namespace).
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const MAX_OUTPUT_TOKENS = 1024;
const MAX_QUESTION_CHARS = 2000;
const MAX_ERROR_CHARS = 600;

const SYSTEM_PROMPT =
  'You are an AI tutor helping students understand satellite imagery and Earth observation data.\n' +
  '\n' +
  'Rules:\n' +
  '- Answer in plain language a high-school student can understand.\n' +
  '- Explain satellite imagery concepts simply (NDVI, spectral bands, true colour, false colour, etc.).\n' +
  '- Never claim certainty about causes that satellite imagery alone cannot prove (e.g. "this deforestation was caused by logging" - say "could indicate" instead).\n' +
  '- Keep answers under 150 words.\n' +
  '- If you are unsure, say so clearly.\n' +
  '- Be encouraging and educational.';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

// Allow the endpoint to be called from the browser even when the page and the
// API are served from different origins during development.
function applyCors(res) {
  try {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  } catch (err) {
    // Headers are a nicety - never let them break the request.
  }
}

// Vercel usually parses JSON bodies for us, but be defensive about every shape.
// Returns { body } or { error }.
function parseBody(raw) {
  if (raw === undefined) return { error: 'Missing body' };

  var body = raw;

  if (typeof body === 'string') {
    if (body.trim() === '') return { error: 'Missing body' };
    try {
      body = JSON.parse(body);
    } catch (err) {
      return { error: 'Invalid JSON body' };
    }
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString('utf8'));
    } catch (err) {
      return { error: 'Invalid JSON body' };
    }
  }

  if (!body || typeof body !== 'object') return { error: 'Missing body' };

  return { body: body };
}

// Pull a human-readable message out of an upstream error response.
async function readErrorDetail(response) {
  var text = '';
  try {
    text = await response.text();
  } catch (err) {
    text = '';
  }

  if (!text) return 'No message was provided by the upstream service.';

  try {
    var parsed = JSON.parse(text);
    if (parsed && parsed.error && parsed.error.message) return String(parsed.error.message);
    if (parsed && Array.isArray(parsed.errors) && parsed.errors[0] && parsed.errors[0].message) {
      return String(parsed.errors[0].message);
    }
  } catch (err) {
    // Not JSON - fall through and use the raw text.
  }

  return text.slice(0, MAX_ERROR_CHARS);
}

// Extract the model's text from a Gemini response. Tolerant by design so it
// keeps working if the response envelope changes.
function extractText(data) {
  if (!data || typeof data !== 'object') return '';

  // Current Interactions API: steps[].content[].text
  if (Array.isArray(data.steps)) {
    var chunks = [];
    data.steps.forEach(function (step) {
      if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) return;
      step.content.forEach(function (part) {
        if (part && part.type === 'text' && typeof part.text === 'string' && part.text) {
          chunks.push(part.text);
        }
      });
    });
    if (chunks.length) return chunks.join('');
  }

  // Some responses expose a ready-made convenience field.
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;

  // Legacy generateContent shape, kept as a fallback.
  var candidate = Array.isArray(data.candidates) ? data.candidates[0] : null;
  if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
    var parts = [];
    candidate.content.parts.forEach(function (part) {
      if (part && typeof part.text === 'string' && part.text) parts.push(part.text);
    });
    if (parts.length) return parts.join('');
  }

  return '';
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

module.exports = async function handler(req, res) {
  try {
    applyCors(res);

    var method = (req && req.method) || 'GET';

    if (method === 'OPTIONS') {
      return res.status(204).end();
    }

    // Health/diagnostics - never exposes the key itself, only whether it is set.
    if (method === 'GET') {
      return res.status(200).json({
        ok: true,
        keyPresent: Boolean(process.env.GEMINI_API_KEY)
      });
    }

    if (method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    var apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });
    }

    var parsed = parseBody(req && req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    var question = typeof parsed.body.question === 'string' ? parsed.body.question.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    var upstream = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: question.slice(0, MAX_QUESTION_CHARS),
        system_instruction: SYSTEM_PROMPT,
        // Gemini 3.6+ ignores temperature/top_p/top_k, so we do not send them.
        generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS }
      })
    });

    if (!upstream.ok) {
      var detail = await readErrorDetail(upstream);
      console.error('Gemini API error:', upstream.status, detail);
      return res.status(upstream.status).json({
        error: 'Gemini API error (' + upstream.status + '): ' + detail,
        status: upstream.status,
        detail: detail
      });
    }

    var data;
    try {
      data = await upstream.json();
    } catch (err) {
      console.error('Gemini returned invalid JSON:', err);
      return res.status(502).json({ error: 'The AI service returned an unreadable response. Please try again.' });
    }

    if (data && data.status === 'failed') {
      var message = 'The AI service could not complete this request.';
      if (Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
        message = String(data.errors[0].message);
      }
      console.error('Gemini interaction failed:', message);
      return res.status(502).json({ error: message });
    }

    var text = extractText(data);
    if (!text) {
      return res.status(502).json({ error: 'The AI service returned an empty response. Please try again.' });
    }

    return res.status(200).json({ reply: text.trim() });
  } catch (err) {
    console.error('explain handler error:', err);
    try {
      return res.status(500).json({ error: String((err && err.message) || err) });
    } catch (innerErr) {
      // Nothing left to do - the response object itself is unusable.
      return;
    }
  }
};
