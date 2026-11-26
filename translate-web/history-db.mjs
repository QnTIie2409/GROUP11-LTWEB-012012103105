import { randomBytes, randomUUID } from 'crypto';
import {
  appendSetCookie,
  database,
  ensureSchema,
  getAuthenticatedUser,
  isAllowedOrigin,
  isHttpsRequest,
  parseCookies,
  readJsonBody
} from './auth-node.mjs';

const ANON_PLACEHOLDER_OWNER = '00000000-0000-0000-0000-000000000000';

function sendHistoryJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache'
  });
  res.end(JSON.stringify(data));
}

function readOwnerCookie(req) {
  const value = parseCookies(req).lingo_owner;
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : null;
}

function ownerFromRequest(req, res) {
  const existing = readOwnerCookie(req);
  if (existing) return existing;
  const owner = randomUUID();
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `lingo_owner=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`
  );
  return owner;
}

function validHistoryId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function validHistoryItem(item) {
  return Boolean(
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    validHistoryId(item.id) &&
    typeof item.sourceLang === 'string' && item.sourceLang.length <= 12 &&
    typeof item.targetLang === 'string' && item.targetLang.length <= 12 &&
    typeof item.sourceText === 'string' && item.sourceText.length <= 5000 &&
    Buffer.byteLength(item.sourceText, 'utf8') <= 65535 &&
    typeof item.targetText === 'string' && item.targetText.length <= 20000 &&
    Buffer.byteLength(item.targetText, 'utf8') <= 65535 &&
    typeof item.timestamp === 'number' && Number.isSafeInteger(item.timestamp) &&
    item.timestamp >= 0 && typeof item.starred === 'boolean'
  );
}

function validHistory(items) {
  return Array.isArray(items) &&
    items.length <= 50 &&
    items.every(validHistoryItem) &&
    new Set(items.map(x => x.id)).size === items.length;
}

function getHistoryScope(user, owner) {
  if (user) {
    return {
      where: 'user_id = ?',
      params: [user.id],
      userIdValue: user.id
    };
  }
  return {
    where: 'owner_id = ? AND user_id IS NULL',
    params: [owner],
    userIdValue: null
  };
}

function isDuplicateKeyError(err) {
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

async function insertHistoryRow(connection, owner, userIdValue, item) {
  let insertId = item.id;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await connection.execute(
        'INSERT INTO translation_history (id, owner_id, user_id, source_lang, target_lang, source_text, target_text, starred, translated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          insertId,
          owner,
          userIdValue,
          item.sourceLang,
          item.targetLang,
          item.sourceText,
          item.targetText,
          item.starred ? 1 : 0,
          item.timestamp
        ]
      );
      return { ...item, id: insertId };
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt === 2) {
        throw err;
      }
      const suffix = `_${randomBytes(4).toString('hex')}`;
      insertId = `${item.id.slice(0, 64 - suffix.length)}${suffix}`;
    }
  }
  return item;
}

async function upsertHistoryItem(connection, scope, owner, item, preserveNewerTimestamp = false) {
  const [rows] = await connection.execute(
    `SELECT id, source_text, starred, translated_at FROM translation_history WHERE ${scope.where} AND (id = ? OR (source_lang = ? AND target_lang = ? AND source_text = ?))`,
    [...scope.params, item.id, item.sourceLang, item.targetLang, item.sourceText]
  );

  let existingStarred = false;
  let maxTimestamp = item.timestamp;
  const idsToDelete = [];

  for (const row of rows) {
    if (row.id === item.id || row.source_text === item.sourceText) {
      idsToDelete.push(row.id);
      if (row.starred) {
        existingStarred = true;
      }
      if (preserveNewerTimestamp) {
        const rowTime = Number(row.translated_at);
        if (Number.isFinite(rowTime) && rowTime > maxTimestamp) {
          maxTimestamp = rowTime;
        }
      }
    }
  }

  if (idsToDelete.length > 0) {
    const placeholders = idsToDelete.map(() => '?').join(', ');
    await connection.execute(
      `DELETE FROM translation_history WHERE ${scope.where} AND id IN (${placeholders})`,
      [...scope.params, ...idsToDelete]
    );
  }

  const normalizedItem = {
    id: item.id,
    sourceLang: item.sourceLang,
    targetLang: item.targetLang,
    sourceText: item.sourceText,
    targetText: item.targetText,
    starred: Boolean(item.starred || existingStarred),
    timestamp: maxTimestamp
  };

  return insertHistoryRow(connection, owner, scope.userIdValue, normalizedItem);
}

async function pruneHistory(connection, scope, maxRows = 50) {
  const [rows] = await connection.execute(
    `SELECT id FROM translation_history WHERE ${scope.where} ORDER BY translated_at DESC, id DESC`,
    scope.params
  );

  if (rows.length <= maxRows) return;

  const excessIds = rows.slice(maxRows).map(row => row.id);
  for (let i = 0; i < excessIds.length; i += 100) {
    const chunk = excessIds.slice(i, i + 100);
    const placeholders = chunk.map(() => '?').join(', ');
    await connection.execute(
      `DELETE FROM translation_history WHERE ${scope.where} AND id IN (${placeholders})`,
      [...scope.params, ...chunk]
    );
  }
}

export async function handleHistory(req, res) {
  if (!isAllowedOrigin(req)) {
    sendHistoryJson(res, 403, { error: 'Forbidden origin' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, PUT, POST');
    sendHistoryJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  try {
    let putItems = null;
    let postPayload = null;

    if (req.method === 'PUT' || req.method === 'POST') {
      let decoded = null;
      try {
        decoded = await readJsonBody(req, 1500000);
      } catch (err) {
        if (err?.statusCode === 413) {
          sendHistoryJson(res, 413, { error: 'History too large' });
          return;
        }
        sendHistoryJson(res, 400, { error: req.method === 'PUT' ? 'Invalid history' : 'Invalid JSON body' });
        return;
      }

      if (req.method === 'PUT') {
        putItems = decoded;
        if (!validHistory(putItems)) {
          sendHistoryJson(res, 400, { error: 'Invalid history' });
          return;
        }
      } else {
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
          sendHistoryJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
        const { action } = decoded;
        if (typeof action !== 'string') {
          sendHistoryJson(res, 400, { error: 'Invalid action' });
          return;
        }

        if (action === 'upsert') {
          if (!validHistoryItem(decoded.item)) {
            sendHistoryJson(res, 400, { error: 'Invalid history item' });
            return;
          }
        } else if (action === 'star') {
          if (!validHistoryId(decoded.id) || typeof decoded.starred !== 'boolean') {
            sendHistoryJson(res, 400, { error: 'Invalid star payload' });
            return;
          }
        } else if (action === 'delete') {
          if (!validHistoryId(decoded.id)) {
            sendHistoryJson(res, 400, { error: 'Invalid delete payload' });
            return;
          }
        } else if (action === 'clear') {
          // No additional fields required
        } else if (action === 'merge') {
          if (!Array.isArray(decoded.items) || decoded.items.length > 100 || !decoded.items.every(validHistoryItem)) {
            sendHistoryJson(res, 400, { error: 'Invalid merge items' });
            return;
          }
        } else {
          sendHistoryJson(res, 400, { error: 'Invalid action' });
          return;
        }

        postPayload = decoded;
      }
    }

    const user = await getAuthenticatedUser(req);
    const owner = user ? (readOwnerCookie(req) || ANON_PLACEHOLDER_OWNER) : ownerFromRequest(req, res);
    const db = await database();
    await ensureSchema(db);
    const scope = getHistoryScope(user, owner);

    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT id, source_lang, target_lang, source_text, target_text, starred, translated_at FROM translation_history WHERE ${scope.where} ORDER BY translated_at DESC LIMIT 50`,
        scope.params
      );

      sendHistoryJson(res, 200, rows.map(row => ({
        id: row.id,
        sourceLang: row.source_lang,
        targetLang: row.target_lang,
        sourceText: row.source_text,
        targetText: row.target_text,
        starred: Boolean(row.starred),
        timestamp: Number(row.translated_at)
      })));
      return;
    }

    if (req.method === 'PUT') {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(`DELETE FROM translation_history WHERE ${scope.where}`, scope.params);

        for (const item of putItems) {
          await insertHistoryRow(connection, owner, scope.userIdValue, item);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      sendHistoryJson(res, 200, { saved: putItems.length });
      return;
    }

    const { action } = postPayload;

    if (action === 'upsert') {
      const connection = await db.getConnection();
      let savedItem;
      try {
        await connection.beginTransaction();
        savedItem = await upsertHistoryItem(connection, scope, owner, postPayload.item, false);
        await pruneHistory(connection, scope, 50);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      sendHistoryJson(res, 200, { ok: true, item: savedItem });
      return;
    }

    if (action === 'star') {
      await db.execute(
        `UPDATE translation_history SET starred = ? WHERE id = ? AND ${scope.where}`,
        [postPayload.starred ? 1 : 0, postPayload.id, ...scope.params]
      );
      sendHistoryJson(res, 200, { ok: true });
      return;
    }

    if (action === 'delete') {
      await db.execute(
        `DELETE FROM translation_history WHERE id = ? AND ${scope.where}`,
        [postPayload.id, ...scope.params]
      );
      sendHistoryJson(res, 200, { ok: true });
      return;
    }

    if (action === 'clear') {
      await db.execute(
        `DELETE FROM translation_history WHERE ${scope.where}`,
        scope.params
      );
      sendHistoryJson(res, 200, { ok: true });
      return;
    }

    if (action === 'merge') {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        for (const mergeItem of postPayload.items) {
          await upsertHistoryItem(connection, scope, owner, mergeItem, true);
        }
        await pruneHistory(connection, scope, 50);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      sendHistoryJson(res, 200, { ok: true, saved: postPayload.items.length });
      return;
    }
  } catch (error) {
    console.error('History database error:', error);
    sendHistoryJson(res, 503, { error: 'Database unavailable' });
  }
}
