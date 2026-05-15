import { kv } from '@vercel/kv';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const BANNED = [
  'viagra', 'cialis', 'casino', 'porn', 'crypto-bonus', 'forex-signal',
  'free-bitcoin', 'pharmacy', 'replica-watch', 'binary-option',
];
const URL_RE = /https?:\/\//gi;

function ipFrom(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || 'unknown';
}

function clean(s, max) {
  return String(s ?? '').trim().slice(0, max);
}

function looksSpammy(text) {
  const lower = text.toLowerCase();
  if (BANNED.some(w => lower.includes(w))) return true;
  const urls = (text.match(URL_RE) || []).length;
  if (urls > 2) return true;
  if (lower.length > 30 && lower === lower.toUpperCase()) return true;
  return false;
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method === 'GET') {
      const slug = req.query?.slug;
      if (!SLUG_RE.test(slug || '')) {
        return res.status(400).json({ error: 'invalid slug' });
      }
      const items = (await kv.lrange(`comments:${slug}`, 0, 199)) || [];
      const parsed = items
        .map(it => (typeof it === 'string' ? safeParse(it) : it))
        .filter(Boolean);
      return res.status(200).json({ comments: parsed });
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readBody(req); }
      catch { return res.status(400).json({ error: 'invalid json' }); }

      const slug = body.slug;
      const name = clean(body.name, 40);
      const text = clean(body.body, 2000);
      const hp = body.hp;

      if (hp && String(hp).length) {
        return res.status(200).json({ ok: true });
      }
      if (!SLUG_RE.test(slug || '')) {
        return res.status(400).json({ error: 'invalid slug' });
      }
      if (name.length < 1) return res.status(400).json({ error: 'name required' });
      if (text.length < 5) return res.status(400).json({ error: 'comment must be at least 5 characters' });
      if (looksSpammy(text)) {
        return res.status(200).json({ ok: true });
      }

      const ip = ipFrom(req);
      const rlKey = `rl:${ip}`;
      const exists = await kv.get(rlKey);
      if (exists) {
        return res.status(429).json({ error: 'easy there — wait a minute and try again' });
      }
      await kv.set(rlKey, 1, { ex: 60 });

      const comment = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name,
        body: text,
        ts: new Date().toISOString(),
      };

      await kv.lpush(`comments:${slug}`, JSON.stringify(comment));
      await kv.ltrim(`comments:${slug}`, 0, 999);

      return res.status(201).json({ comment });
    }

    if (req.method === 'DELETE') {
      const auth = req.headers.authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const slug = req.query?.slug;
      const id = req.query?.id;
      if (!SLUG_RE.test(slug || '') || !id) {
        return res.status(400).json({ error: 'missing slug or id' });
      }

      const items = (await kv.lrange(`comments:${slug}`, 0, 999)) || [];
      const target = items.find(it => {
        const c = typeof it === 'string' ? safeParse(it) : it;
        return c?.id === id;
      });
      if (!target) {
        return res.status(404).json({ error: 'not found' });
      }
      const raw = typeof target === 'string' ? target : JSON.stringify(target);
      await kv.lrem(`comments:${slug}`, 1, raw);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('comments handler error', err);
    return res.status(500).json({ error: 'server error' });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
