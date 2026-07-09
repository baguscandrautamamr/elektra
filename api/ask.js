// ELEKTRA — Proxy ke Olagon AI Gateway (Anthropic-compatible)
// API key TIDAK ditulis di sini. Set di Vercel: Settings → Environment Variables
//   Name : API_KEY
//   Value: rk_live_...

const MODEL = 'claude-sonnet-4-6';
const BASE_URL = 'https://gateway.olagon.site/anthropic/v1/messages';

const TOOL = {
  name: 'electrical_reference',
  description: 'Return structured electrical standards comparison for PUIL/SNI, IEC, and NEC/NFPA.',
  input_schema: {
    type: 'object',
    properties: {
      puil: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          points:  { type: 'array', items: { type: 'string' } },
          refs:    { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'points', 'refs'],
      },
      iec: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          points:  { type: 'array', items: { type: 'string' } },
          refs:    { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'points', 'refs'],
      },
      nec: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          points:  { type: 'array', items: { type: 'string' } },
          refs:    { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'points', 'refs'],
      },
      verdict: { type: 'string' },
    },
    required: ['puil', 'iec', 'nec', 'verdict'],
  },
};

function systemPrompt(lang) {
  const langLine = lang === 'en'
    ? 'Answer entirely in English.'
    : 'Jawab sepenuhnya dalam Bahasa Indonesia.';
  return `You are an electrical standards reference assistant for MEP engineers in Indonesia.
For the user's electrical question, compare how it is addressed by three bodies of standards:
1. "puil"  = PUIL 2011 / SNI (Indonesian national standards)
2. "iec"   = IEC international standards
3. "nec"   = NEC / NFPA (United States)

Rules:
- ${langLine}
- "summary": 2-3 concise sentences on how that standard treats the topic.
- "points": 2-4 short practical field notes (each one sentence).
- "refs": specific article/clause codes you are confident about (e.g. "SNI 0225:2011", "IEC 60364-5-52", "NFPA 70 250.53"). If unsure of an exact clause number, give only the standard code without the clause. NEVER invent clause numbers.
- "verdict": one short practical conclusion for field work in Indonesia (2-3 sentences).
- If the question is NOT about electrical/MEP topics, still fill the schema but state in each summary that the topic is outside electrical standards scope.
- Be conservative: if standards differ, say so explicitly rather than forcing agreement.`;
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
      max_tokens: 4096,
      system: systemPrompt(lang),
      messages: [{ role: 'user', content: query }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'electrical_reference' },
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

    // Extract tool_use result (structured output)
    const toolBlock = data?.content?.find(b => b.type === 'tool_use');
    if (!toolBlock?.input) {
      console.error('No tool_use block in response', JSON.stringify(data).slice(0, 200));
      return res.status(502).json({ error: 'empty_response' });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(toolBlock.input);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error' });
  }
}
