// Vercel serverless function using DeepSeek (OpenAI-compatible API).
// Env vars: DEEPSEEK_API_KEY (required), DEEPSEEK_MODEL (optional, default deepseek-chat)
export const config = { maxDuration: 30 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not set' });
  const { stem, options, answer } = req.body || {};
  if (!stem || !options || !answer) return res.status(400).json({ error: 'Missing fields' });

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const opts = Object.entries(options).map(([k, v]) => `${k}) ${v}`).join('\n');
  const system = 'You are a beginner-friendly tutor for the IT Passport exam (ITPEC / IPA Japan). Reply in plain text only: no markdown, no asterisks.';
  const user =
    `The official answer key says the correct answer is "${answer}". Treat it as true; never contradict it.

Question:
${stem}

Options:
${opts}

Write a short explanation:
1) Start with "Correct: ${answer})" and explain why it is right (show the calculation if there is one).
2) Then one short line for each wrong option explaining why it is wrong.
3) End with a one-line tip to remember the concept.`;

  let last = { error: 'AI request failed' };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
        })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = data?.choices?.[0]?.message?.content || '';
        if (text.trim()) return res.status(200).json({ explanation: text.trim() });
        last = { error: 'Empty response from AI' };
      } else {
        last = { error: data?.error?.message || `AI error ${r.status}` };
        if (![429, 500, 502, 503, 504].includes(r.status)) break; // not temporary
      }
    } catch (e) {
      last = { error: String(e) };
    }
    if (i < 2) await sleep(800 * (i + 1));
  }
  return res.status(502).json(last);
}