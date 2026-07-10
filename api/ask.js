// ELEKTRA — Edge Function (runs at CDN closest to user, e.g. Singapore for Indonesia)
// API key set di Vercel: Settings → Environment Variables → API_KEY

export const config = { runtime: 'edge' };

const MODEL = 'claude-3-5-haiku';
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

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const key = process.env.API_KEY;
  if (!key) return json({ error: 'no_key' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid_query' }, 400); }

  const { query, lang } = body;
  if (!query || typeof query !== 'string' || query.length > 2000) {
    return json({ error: 'invalid_query' }, 400);
  }

  try {
    let r = await callClaude(key, lang, query);

    if (r.status === 529 || r.status === 503) {
      await sleep(2500);
      r = await callClaude(key, lang, query);
    }

    if (r.status === 429) return json({ error: 'rate_limited' }, 429);
    if (r.status === 529 || r.status === 503) return json({ error: 'model_busy' }, 503);
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('API error', r.status, detail.slice(0, 200));
      return json({ error: 'upstream_error' }, 502);
    }

    const data = await r.json();
    const text = data?.content?.find(b => b.type === 'text')?.text?.trim();
    if (!text) return json({ error: 'empty_response' }, 502);

    let parsed;
    try {
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      parsed = JSON.parse(clean);
    } catch {
      return json({ error: 'parse_error' }, 502);
    }

    return json(parsed, 200, { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' });
  } catch (err) {
    console.error(err);
    return json({ error: 'server_error' }, 500);
  }
}
