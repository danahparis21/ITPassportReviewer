// Vercel serverless function: Sync session state with Supabase (optional cloud sync).
// If SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are set in Vercel env vars,
// sessions are synced to the cloud. If not, the frontend gracefully uses browser localStorage.

export const config = { maxDuration: 15 };

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    return { url: url.replace(/\/+$/, ''), key };
  }
  return null;
}

export default async function handler(req, res) {
  const sb = getSupabaseConfig();

  // If Supabase is not configured, inform client to stay local
  if (!sb) {
    return res.status(200).json({ cloud: false, message: 'Local storage mode' });
  }

  const headers = {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const key = String(req.query.key || '').trim().toLowerCase();
      if (!key) return res.status(400).json({ error: 'Missing session key' });

      const resp = await fetch(
        `${sb.url}/rest/v1/sessions?key=eq.${encodeURIComponent(key)}&select=data,updated_at`,
        { headers }
      );
      if (!resp.ok) {
        return res.status(resp.status).json({ error: 'Supabase query failed', cloud: true });
      }
      const rows = await resp.json();
      if (rows && rows.length > 0) {
        return res.status(200).json({ cloud: true, found: true, data: rows[0].data, updatedAt: rows[0].updated_at });
      }
      return res.status(200).json({ cloud: true, found: false });
    }

    if (req.method === 'POST') {
      const { key, data } = req.body || {};
      const cleanKey = String(key || '').trim().toLowerCase();
      if (!cleanKey || !data) {
        return res.status(400).json({ error: 'Missing key or data' });
      }

      const resp = await fetch(`${sb.url}/rest/v1/sessions`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          key: cleanKey,
          data,
          updated_at: new Date().toISOString()
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(resp.status).json({ error: errText || 'Failed to save to Supabase', cloud: true });
      }

      return res.status(200).json({ cloud: true, saved: true });
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error', cloud: true });
  }
}
