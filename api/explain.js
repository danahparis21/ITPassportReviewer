// Vercel serverless function. Key stays on the server (set GEMINI_API_KEY in Vercel env vars).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
  const { stem, options, answer } = req.body || {};
  if (!stem || !options || !answer) return res.status(400).json({ error: 'Missing fields' });
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
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
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'AI request failed' });
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    return res.status(200).json({ explanation: text.trim() });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
