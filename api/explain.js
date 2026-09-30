// Vercel serverless function. Key stays on the server (GEMINI_API_KEY in Vercel env vars).
export const config = { maxDuration: 30 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGemini(model, key, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
  const { stem, options, answer } = req.body || {};
  if (!stem || !options || !answer) return res.status(400).json({ error: 'Missing fields' });

  const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallback = process.env.GEMINI_FALLBACK_MODEL; // optional
  const models = fallback && fallback !== primary ? [primary, primary, fallback, fallback] : [primary, primary, primary, primary];

  const opts = Object.entries(options).map(([k, v]) => `${k}) ${v}`).join('\n');
  const prompt =
    `You are a tutor for the IT Passport exam (ITPEC / IPA Japan).
The official answer key says the correct answer is "${answer}". Treat it as true; never contradict it.

Question:
${stem}

Options:
${opts}

Write a short explanation in plain text (no markdown, no asterisks):
1) Start with "Correct: ${answer})" and explain why it is right (show the calculation if there is one).
2) Then one short line for each wrong option explaining why it is wrong.
3) End with a one-line tip to remember the concept.
Keep it beginner-friendly.`;

  let last = { error: 'AI request failed' };
  for (let i = 0; i < models.length; i++) {
    try {
      const { ok, status, data } = await callGemini(models[i], key, prompt);
      if (ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        if (text.trim()) return res.status(200).json({ explanation: text.trim() });
        last = { error: 'Empty response from AI' };
      } else {
        last = { error: data?.error?.message || `AI error ${status}` };
        if (![429, 500, 502, 503, 504].includes(status)) break; // not temporary, stop retrying
      }
    } catch (e) {
      last = { error: String(e) };
    }
    if (i < models.length - 1) await sleep(700 * (i + 1));
  }
  return res.status(502).json(last);
}