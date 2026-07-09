// ELEKTRA — Proxy aman ke Gemini API (Vercel Serverless Function)
// API key TIDAK ditulis di sini. Set di Vercel: Settings → Environment Variables
//   Name : GEMINI_API_KEY
//   Value: <API key kamu dari Google AI Studio>

const MODEL = 'gemini-2.5-flash'; // ganti ke 'gemini-2.5-flash-lite' jika ingin lebih cepat/hemat kuota

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    puil: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING' },
        points: { type: 'ARRAY', items: { type: 'STRING' } },
        refs: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['summary', 'points', 'refs'],
    },
    iec: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING' },
        points: { type: 'ARRAY', items: { type: 'STRING' } },
        refs: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['summary', 'points', 'refs'],
    },
    nec: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING' },
        points: { type: 'ARRAY', items: { type: 'STRING' } },
        refs: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['summary', 'points', 'refs'],
    },
    verdict: { type: 'STRING' },
  },
  required: ['puil', 'iec', 'nec', 'verdict'],
};

function systemPrompt(lang) {
  const langLine =
    lang === 'en'
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

async function callGemini(key, lang, query) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
        contents: [{ role: 'user', parts: [{ text: query }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    }
  );
  return r;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'no_key' });
  }

  const { query, lang } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 2000) {
    return res.status(400).json({ error: 'invalid_query' });
  }

  try {
    let r = await callGemini(key, lang, query);

    // Retry once on 503 (model overloaded)
    if (r.status === 503) {
      await sleep(2500);
      r = await callGemini(key, lang, query);
    }

    if (r.status === 429) {
      return res.status(429).json({ error: 'quota_exceeded' });
    }
    if (r.status === 503) {
      return res.status(503).json({ error: 'model_busy' });
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Gemini error', r.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: 'empty_response' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('parse_error | finishReason:', data?.candidates?.[0]?.finishReason, '| textLen:', text.length);
      return res.status(502).json({ error: 'parse_error' });
    }

    // Cache identik query selama 1 jam di edge (hemat kuota)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error' });
  }
}
