// Vercel serverless function using DeepSeek (OpenAI-compatible API).
// Env vars: DEEPSEEK_API_KEY (required), DEEPSEEK_MODEL (optional, default deepseek-chat)
export const config = { maxDuration: 60 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not set' });
  const { stem, options, answer } = req.body || {};
  if (!stem || !options || !answer) return res.status(400).json({ error: 'Missing fields' });

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const opts = Object.entries(options).map(([k, v]) => `${k}) ${v}`).join('\n');
  const system = 'You are a warm, patient tutor helping a student fully master the IT Passport exam (ITPEC / IPA Japan). Explain like the student is 5 years old: very simple words, short sentences, everyday examples (food, toys, school, games). Never assume prior knowledge. Do not use tables.';
  const user =
    `The official answer key says the correct answer is "${answer}". Treat it as true; never contradict it.

Question:
${stem}

Options:
${opts}

Write a detailed explanation using EXACTLY these sections. Start each section title with "## " on its own line. You may use **bold** for key terms. No other markdown.

## The simple idea
Explain the concept behind the question in plain words, as if to a 5-year-old, with a real-life analogy.

## Key words explained
Every technical term or acronym in the question or options, each with a one-sentence kid-friendly meaning (and the full name of any acronym).

## Why ${answer}) is correct
Go step by step. If the question needs a calculation, show every step slowly with the numbers.

## Why the others are wrong
One clear paragraph per wrong option: what that option actually is or means, and why it does not fit this question.

## Remember it like this
A short memorable trick, rhyme or mini-story, plus one similar exam-style tip.`;

  let last = { error: 'AI request failed' };
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 1600,
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
    if (i < 1) await sleep(800 * (i + 1));
  }
  return res.status(502).json(last);
}