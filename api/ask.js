// ELEKTRA — Proxy ke Olagon AI Gateway (Anthropic-compatible)
// API key TIDAK ditulis di sini. Set di Vercel: Settings → Environment Variables
//   Name : API_KEY
//   Value: rk_live_...

const MODEL = 'claude-haiku-4-5';
const BASE_URL = 'https://gateway.olagon.site/anthropic/v1/messages';


function systemPrompt(lang) {
  const langLine = lang === 'en' ? 'Answer entirely in English.' : 'Jawab sepenuhnya dalam Bahasa Indonesia.';
  return `You are an electrical standards reference assistant for MEP engineers in Indonesia. ${langLine}

Respond with ONLY a raw JSON object — no markdown, no explanation, no code fences. Schema:
{"puil":{"summary":"string","points":["string"],"refs":["string"]},"iec":{"summary":"string","points":["string"],"refs":["string"]},"nec":{"summary":"string","points":["string"],"refs":["string"]},"verdict":"string"}

Rules:
- summary: 2-3 concise sentences per standard.
- points: 2-3 short practical field notes.
- refs: only codes you are confident about (e.g. "SNI 0225:2011", "IEC 60364-5-52", "NFPA 70 250.53"). NEVER invent clause numbers.
- verdict: 1-2 sentence practical conclusion for field work in Indonesia.`;
}

async function callClaude(key, lang, query) {
  return fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt(lang),
      messages: [{ role: 'user', content: query }],
    }),
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = process.env.API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'no_key' });
  }

  const { query, lang } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 2000) {
    return res.status(400).json({ error: 'invalid_query' });
  }

  try {
    let r = await callClaude(key, lang, query);

    // Retry once on 529/503 (overloaded)
    if (r.status === 529 || r.status === 503) {
      await sleep(2500);
      r = await callClaude(key, lang, query);
    }

    if (r.status === 429) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    if (r.status === 529 || r.status === 503) {
      return res.status(503).json({ error: 'model_busy' });
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('API error', r.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data = await r.json();

    const text = data?.content?.[0]?.text?.trim();
    if (!text) {
      console.error('Empty response', JSON.stringify(data).slice(0, 200));
      return res.status(502).json({ error: 'empty_response' });
    }

    let parsed;
    try {
      // Strip accidental markdown fences if present
      const clean = text.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'');
      parsed = JSON.parse(clean);
    } catch {
      console.error('parse_error | text:', text.slice(0, 150));
      return res.status(502).json({ error: 'parse_error' });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error' });
  }
}
