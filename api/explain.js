// Vercel serverless function: tries several OpenAI-compatible providers in order until one works.
// Order: 1) AI_*  (e.g. Groq)  2) GEMINI_*  3) DEEPSEEK_*  -- any provider whose env vars are missing is skipped.
// Also supports optional Supabase explanation caching so questions are only generated once across all users.
export const config = { maxDuration: 60 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TEMP = [429, 500, 502, 503, 504];

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) return { url: url.replace(/\/+$/, ''), key };
  return null;
}

function providers() {
  const list = [];
  const e = process.env;
  if (e.AI_API_KEY && e.AI_BASE_URL && e.AI_MODEL)
    list.push({ name: 'primary', base: e.AI_BASE_URL, key: e.AI_API_KEY, model: e.AI_MODEL });
  if (e.GEMINI_API_KEY)
    list.push({ name: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: e.GEMINI_API_KEY, model: e.GEMINI_MODEL || 'gemini-3.8-flash' });
  if (e.DEEPSEEK_API_KEY)
    list.push({ name: 'deepseek', base: 'https://api.deepseek.com', key: e.DEEPSEEK_API_KEY, model: e.DEEPSEEK_MODEL || 'deepseek-chat' });
  return list.map(p => ({ ...p, base: p.base.replace(/\/+$/, '') }));
}

async function ask(p, system, user, maxTokens) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model, temperature: 0.4, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    const data = await r.json().catch(() => ({}));
    const err = Array.isArray(data) ? data[0]?.error?.message : data?.error?.message;
    return { ok: r.ok, status: r.status, text: data?.choices?.[0]?.message?.content || '', error: err || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: e.name === 'AbortError' ? 'timed out' : String(e) };
  } finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { stem, options, answer, mode, examId, qNum } = req.body || {};
  const detailed = mode === 'detailed';
  if (!stem || !options || !answer) return res.status(400).json({ error: 'Missing fields' });

  // 1. Optional Cloud Cache Check (Supabase)
  const sb = getSupabaseConfig();
  if (sb && examId && qNum != null) {
    try {
      const modeKey = detailed ? 'detailed' : 'short';
      const ctl = new AbortController();
      const ct = setTimeout(() => ctl.abort(), 3000);
      const resp = await fetch(
        `${sb.url}/rest/v1/explanations?exam_id=eq.${encodeURIComponent(examId)}&q_num=eq.${Number(qNum)}&mode=eq.${encodeURIComponent(modeKey)}&select=explanation`,
        {
          signal: ctl.signal,
          headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` }
        }
      );
      clearTimeout(ct);
      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length > 0 && rows[0].explanation) {
          return res.status(200).json({ explanation: rows[0].explanation, provider: 'cloud-cache' });
        }
      }
    } catch (_) {
      // Continue to AI providers on cache miss/error
    }
  }

  // 2. AI Providers
  const provs = providers();
  if (!provs.length) return res.status(500).json({ error: 'No AI provider configured. Set GEMINI_API_KEY (or AI_API_KEY) in Vercel env vars.' });

  const opts = Object.entries(options).map(([k, v]) => `${k}) ${v}`).join('\n');
  const system = 'You are a warm, patient tutor helping a student fully master the IT Passport exam (ITPEC / IPA Japan). Explain like the student is 5 years old: very simple words, short sentences, everyday examples (food, toys, school, games). Never assume prior knowledge. Do not use tables.';
  const userDetailed =
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

  const userShort =
    `The official answer key says the correct answer is "${answer}". Treat it as true; never contradict it.

Question:
${stem}

Options:
${opts}

Reply with EXACTLY these two sections and nothing else (no intro, no conclusion). Start each title with "## " on its own line. No other markdown.

## Why ${answer}) is correct
3 to 5 short numbered steps (1. 2. 3.) in very simple words. If there is a calculation, show the numbers.

## Why the others are wrong
One line per wrong option, in this form: "a) Name – one or two simple sentences: what it is, and why it does not fit this question."`;

  const user = detailed ? userDetailed : userShort;
  const maxTokens = detailed ? 3500 : 1500;

  const errors = [];
  for (const p of provs) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await ask(p, system, user, maxTokens);
      if (r.ok && r.text.trim()) {
        const text = r.text.trim();
        // Asynchronously save to cloud cache if Supabase configured
        if (sb && examId && qNum != null) {
          fetch(`${sb.url}/rest/v1/explanations`, {
            method: 'POST',
            headers: {
              apikey: sb.key,
              Authorization: `Bearer ${sb.key}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
              exam_id: examId,
              q_num: Number(qNum),
              mode: detailed ? 'detailed' : 'short',
              explanation: text,
              updated_at: new Date().toISOString()
            })
          }).catch(() => {});
        }
        return res.status(200).json({ explanation: text, provider: p.name });
      }
      const msg = r.ok ? 'empty response' : r.error;
      if (attempt === 1 || !(TEMP.includes(r.status) || r.status === 0 || r.ok)) { errors.push(`${p.name}: ${msg}`); break; }
      await sleep(800); // temporary problem: one quick retry, then move on to the next provider
    }
  }
  return res.status(502).json({ error: errors.join(' | ') });
}