import { randomUUID } from 'crypto';

let pool;
async function database() {
  if (!pool) {
    const { default: mysql } = await import('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'group11_lingo_studio',
      waitForConnections: true,
      connectionLimit: 5
    });
  }
  return pool;
}

function ownerFromRequest(req, res) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith('lingo_owner='));
  const value = cookie?.slice('lingo_owner='.length);
  if (value && /^[0-9a-f-]{36}$/.test(value)) return value;
  const owner = randomUUID();
  res.setHeader('Set-Cookie', `lingo_owner=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`);
  return owner;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function validHistory(items) {
  return Array.isArray(items) && items.length <= 50 && items.every(item =>
    item && typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item.id) &&
    typeof item.sourceLang === 'string' && item.sourceLang.length <= 12 &&
    typeof item.targetLang === 'string' && item.targetLang.length <= 12 &&
    typeof item.sourceText === 'string' && item.sourceText.length <= 5000 &&
    typeof item.targetText === 'string' && item.targetText.length <= 20000 &&
    typeof item.timestamp === 'number' && Number.isSafeInteger(item.timestamp) &&
    item.timestamp >= 0 && typeof item.starred === 'boolean'
  ) && new Set(items.map(x => x.id)).size === items.length;
}

export async function handleHistory(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
    sendJson(res, 403, { error: 'Forbidden origin' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PUT') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  const owner = ownerFromRequest(req, res);
  try {
    const db = await database();
    if (req.method === 'GET') {
      const [rows] = await db.execute(
        'SELECT id, source_lang, target_lang, source_text, target_text, starred, translated_at FROM translation_history WHERE owner_id = ? ORDER BY translated_at DESC LIMIT 50',
        [owner]
      );
      sendJson(res, 200, rows.map(row => ({
        id: row.id, sourceLang: row.source_lang, targetLang: row.target_lang,
        sourceText: row.source_text, targetText: row.target_text,
        starred: Boolean(row.starred), timestamp: Number(row.translated_at)
      })));
      return;
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1500000) {
        sendJson(res, 413, { error: 'History too large' });
        return;
      }
      chunks.push(chunk);
    }
    let items;
    try { items = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { items = null; }
    if (!validHistory(items)) {
      sendJson(res, 400, { error: 'Invalid history' });
      return;
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM translation_history WHERE owner_id = ?', [owner]);
      for (const item of items) {
        await connection.execute(
          'INSERT INTO translation_history (id, owner_id, source_lang, target_lang, source_text, target_text, starred, translated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [item.id, owner, item.sourceLang, item.targetLang, item.sourceText, item.targetText, item.starred, item.timestamp]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    sendJson(res, 200, { saved: items.length });
  } catch (error) {
    console.error('History database error:', error);
    sendJson(res, 503, { error: 'Database unavailable' });
  }
}
