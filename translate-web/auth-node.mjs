import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SESSION_COOKIE_NAME = 'lingo_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const OAUTH_STATE_COOKIE_NAME = 'lingo_oauth_state';
const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 minutes
const EPHEMERAL_SESSION_SECRET = randomBytes(32).toString('hex');

let pool;
let schemaReadyPromise = null;

export async function database() {
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

export function getGoogleClientId() {
  const value = (process.env.GOOGLE_CLIENT_ID || '').trim();
  return value || null;
}

export function getGoogleClientSecret() {
  const value = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  return value || null;
}

export function isGoogleOAuthReady() {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function getGoogleRedirectUri(req, pathnameHint = '') {
  const configured = (process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (configured) return configured;

  const proto = isHttpsRequest(req) ? 'https' : 'http';
  const host = (req.headers.host || 'localhost').trim() || 'localhost';
  let reqPath = pathnameHint;
  if (!reqPath) {
    try {
      reqPath = new URL(req.url, `${proto}://${host}`).pathname;
    } catch {
      reqPath = '';
    }
  }

  const callbackPath = reqPath.startsWith('/translate-web/')
    ? '/translate-web/api/auth/google-callback.php'
    : '/api/auth/google/callback';
  return `${proto}://${host}${callbackPath}`;
}

function getSessionSecret() {
  const configured = (process.env.SESSION_SECRET || '').trim();
  return configured || EPHEMERAL_SESSION_SECRET;
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieValue);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookieValue]);
  }
}

export function isHttpsRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return Boolean(req.socket?.encrypted || proto === 'https');
}

export function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host || '';
  return origin === `http://${host}` || origin === `https://${host}`;
}

export function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

export async function readJsonBody(req, maxBytes = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('Payload too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function signSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payloadB64, sigB64] = parts;
  const expectedSig = createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  const actualBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (
      !payload ||
      !Number.isSafeInteger(payload.uid) ||
      payload.uid <= 0 ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload.uid;
  } catch {
    return null;
  }
}

function setSessionCookie(req, res, token) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  );
}

function setOAuthStateCookie(req, res, state) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}${secure}`
  );
}

function clearOAuthStateCookie(req, res) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  appendSetCookie(
    res,
    `${OAUTH_STATE_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  );
}

function sendRedirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store'
  });
  res.end();
}

function getOAuthAppHome(pathname) {
  return pathname.startsWith('/translate-web/') ? '../../index.html' : '/';
}

function redirectOAuthError(res, appHome, errorCode) {
  const safeCode = String(errorCode || 'oauth_failed').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'oauth_failed';
  sendRedirect(res, `${appHome}?auth_error=${encodeURIComponent(safeCode)}`);
}

function formatUser(row) {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name || null,
    avatarUrl: row.avatar_url || null
  };
}

export async function ensureSchema(db) {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    let hasUsersTable = false;
    try {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          google_sub VARCHAR(191) NULL UNIQUE,
          email VARCHAR(191) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NULL,
          display_name VARCHAR(255) NULL,
          avatar_url TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
      hasUsersTable = true;
    } catch (err) {
      console.error('Schema ensure users error:', err);
      try {
        const [rows] = await db.query("SHOW TABLES LIKE 'users'");
        hasUsersTable = Array.isArray(rows) && rows.length > 0;
      } catch {
        hasUsersTable = false;
      }
    }

    if (hasUsersTable) {
      try {
        const [googleSubCols] = await db.query("SHOW COLUMNS FROM users LIKE 'google_sub'");
        if (Array.isArray(googleSubCols) && googleSubCols[0] && String(googleSubCols[0].Null || '').toUpperCase() !== 'YES') {
          await db.execute('ALTER TABLE users MODIFY COLUMN google_sub VARCHAR(191) NULL');
        }
      } catch (err) {
        console.error('Schema alter google_sub nullable error:', err);
      }

      try {
        const [pwCols] = await db.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
        if (!Array.isArray(pwCols) || pwCols.length === 0) {
          await db.execute('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
        }
      } catch (err) {
        console.error('Schema alter password_hash error:', err);
      }

      try {
        const [idxRows] = await db.query("SHOW INDEX FROM users WHERE Column_name = 'email' AND Non_unique = 0");
        if (!Array.isArray(idxRows) || idxRows.length === 0) {
          try {
            await db.execute('ALTER TABLE users MODIFY COLUMN email VARCHAR(191) NOT NULL');
          } catch (emailLenErr) {
            console.error('Schema alter email length error:', emailLenErr);
          }
          try {
            await db.execute('ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)');
          } catch (emailIdxErr) {
            console.error('Schema alter unique email index error:', emailIdxErr);
          }
        }
      } catch (err) {
        console.error('Schema check email unique index error:', err);
      }
    }

    try {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS translation_history (
          id VARCHAR(64) NOT NULL,
          owner_id CHAR(36) NOT NULL,
          user_id INT NULL,
          source_lang VARCHAR(12) NOT NULL,
          target_lang VARCHAR(12) NOT NULL,
          source_text TEXT NOT NULL,
          target_text TEXT NOT NULL,
          starred TINYINT(1) NOT NULL DEFAULT 0,
          translated_at BIGINT UNSIGNED NOT NULL,
          PRIMARY KEY (id),
          KEY idx_history_owner_time (owner_id, translated_at),
          KEY idx_history_user_time (user_id, translated_at)
        ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
    } catch (err) {
      console.error('Schema ensure translation_history error:', err);
    }
  })().catch((err) => {
    schemaReadyPromise = null;
    throw err;
  });

  return schemaReadyPromise;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !parts[2]) {
    return false;
  }
  try {
    const expectedBuf = Buffer.from(parts[2], 'hex');
    const derivedBuf = scryptSync(password, parts[1], 64);
    if (expectedBuf.length === 0 || expectedBuf.length !== derivedBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, derivedBuf);
  } catch {
    return false;
  }
}

async function migrateOwnerHistory(executor, req, userId) {
  const cookies = parseCookies(req);
  const owner = cookies.lingo_owner;
  if (owner && /^[0-9a-f-]{36}$/.test(owner)) {
    try {
      await executor.execute(
        'UPDATE translation_history SET user_id = ? WHERE owner_id = ? AND user_id IS NULL',
        [userId, owner]
      );
    } catch (err) {
      console.warn('Auth history migration warning:', err);
    }
  }
}

async function parseAuthPostBody(req, res) {
  if (!isAllowedOrigin(req)) {
    sendJson(res, 403, { error: 'Forbidden origin' });
    return null;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return null;
  }

  try {
    const body = await readJsonBody(req, 32768);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return null;
    }
    return body;
  } catch (err) {
    const status = err?.statusCode === 413 ? 413 : 400;
    sendJson(res, status, { error: status === 413 ? 'Payload too large' : 'Invalid JSON body' });
    return null;
  }
}

export async function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const userId = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
  if (!userId) return null;

  const db = await database();
  await ensureSchema(db);
  const [rows] = await db.execute(
    'SELECT id, email, display_name, avatar_url FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!rows || rows.length === 0) return null;
  return formatUser(rows[0]);
}

export async function handleAuthMe(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const googleClientId = getGoogleClientId();
  let user = null;
  try {
    user = await getAuthenticatedUser(req);
  } catch (error) {
    console.error('Auth session lookup error:', error);
    user = null;
  }

  sendJson(res, 200, {
    authenticated: Boolean(user),
    user,
    googleClientId,
    googleOAuthReady: isGoogleOAuthReady(),
    googleRedirectUri: getGoogleRedirectUri(req)
  });
}

async function verifyGoogleIdToken(credential, expectedClientId) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    return null;
  }
  const info = await response.json();
  if (!info || typeof info !== 'object') return null;

  const emailVerified = info.email_verified === true || info.email_verified === 'true';
  const expValid = !info.exp || Number(info.exp) * 1000 > Date.now();
  if (
    info.aud !== expectedClientId ||
    !emailVerified ||
    !expValid ||
    typeof info.sub !== 'string' || !info.sub ||
    typeof info.email !== 'string' || !info.email
  ) {
    return null;
  }

  return {
    sub: info.sub,
    email: info.email,
    displayName: typeof info.name === 'string' && info.name.trim()
      ? info.name.trim()
      : info.email.split('@')[0],
    avatarUrl: typeof info.picture === 'string' && info.picture.trim()
      ? info.picture.trim()
      : null
  };
}

async function upsertGoogleUser(db, req, profile) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO users (google_sub, email, display_name, avatar_url)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         google_sub = COALESCE(google_sub, VALUES(google_sub)),
         display_name = COALESCE(NULLIF(VALUES(display_name), ''), display_name),
         avatar_url = COALESCE(VALUES(avatar_url), avatar_url)`,
      [profile.sub, profile.email, profile.displayName, profile.avatarUrl]
    );

    const [rows] = await connection.execute(
      'SELECT id, email, display_name, avatar_url FROM users WHERE google_sub = ? OR LOWER(email) = LOWER(?) LIMIT 1',
      [profile.sub, profile.email]
    );
    if (!rows || rows.length === 0) {
      throw new Error('User upsert failed');
    }
    const user = formatUser(rows[0]);
    await migrateOwnerHistory(connection, req, user.id);
    await connection.commit();
    return user;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function handleAuthGoogle(req, res) {
  if (!isAllowedOrigin(req)) {
    sendJson(res, 403, { error: 'Forbidden origin' });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const googleClientId = getGoogleClientId();
  if (!googleClientId) {
    sendJson(res, 503, { error: 'Google Sign-In is not configured on the server' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, 32768);
  } catch (err) {
    const status = err?.statusCode === 413 ? 413 : 400;
    sendJson(res, status, { error: status === 413 ? 'Payload too large' : 'Invalid JSON body' });
    return;
  }

  const credential = typeof body?.credential === 'string' ? body.credential.trim() : '';
  if (!credential || credential.length > 8192) {
    sendJson(res, 400, { error: 'Missing Google credential' });
    return;
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(credential, googleClientId);
  } catch (error) {
    console.error('Google token verification error:', error);
    sendJson(res, 502, { error: 'Failed to verify Google token' });
    return;
  }

  if (!profile) {
    sendJson(res, 401, { error: 'Invalid Google credential' });
    return;
  }

  try {
    const db = await database();
    await ensureSchema(db);
    const user = await upsertGoogleUser(db, req, profile);

    setSessionCookie(req, res, signSessionToken(user.id));
    sendJson(res, 200, { authenticated: true, user });
  } catch (error) {
    console.error('Auth database error:', error);
    sendJson(res, 503, { error: 'Database unavailable' });
  }
}

export async function handleAuthGoogleStart(req, res, parsedUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const urlObj = parsedUrl || new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const appHome = getOAuthAppHome(pathname);

  const googleClientId = getGoogleClientId();
  const googleClientSecret = getGoogleClientSecret();
  if (!googleClientId || !googleClientSecret) {
    redirectOAuthError(res, appHome, 'google_not_configured');
    return;
  }

  const state = randomBytes(16).toString('hex');
  setOAuthStateCookie(req, res, state);

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: getGoogleRedirectUri(req, pathname),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });

  sendRedirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function handleAuthGoogleCallback(req, res, parsedUrl) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const urlObj = parsedUrl || new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const appHome = getOAuthAppHome(pathname);

  const cookies = parseCookies(req);
  const expectedState = typeof cookies[OAUTH_STATE_COOKIE_NAME] === 'string'
    ? cookies[OAUTH_STATE_COOKIE_NAME]
    : '';
  clearOAuthStateCookie(req, res);

  const oauthError = (urlObj.searchParams.get('error') || '').trim();
  if (oauthError) {
    redirectOAuthError(res, appHome, oauthError);
    return;
  }

  const state = urlObj.searchParams.get('state') || '';
  const expectedBuf = Buffer.from(expectedState, 'utf8');
  const actualBuf = Buffer.from(state, 'utf8');
  if (
    !expectedState ||
    !state ||
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    redirectOAuthError(res, appHome, 'invalid_state');
    return;
  }

  const code = (urlObj.searchParams.get('code') || '').trim();
  if (!code) {
    redirectOAuthError(res, appHome, 'missing_code');
    return;
  }

  const googleClientId = getGoogleClientId();
  const googleClientSecret = getGoogleClientSecret();
  if (!googleClientId || !googleClientSecret) {
    redirectOAuthError(res, appHome, 'google_not_configured');
    return;
  }

  let idToken = '';
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: getGoogleRedirectUri(req, pathname),
        grant_type: 'authorization_code'
      }),
      signal: AbortSignal.timeout(10000)
    });

    const tokenData = await tokenRes.json().catch(() => null);
    idToken = typeof tokenData?.id_token === 'string' ? tokenData.id_token.trim() : '';
    if (!tokenRes.ok || !idToken) {
      console.error('Google OAuth token exchange failed with HTTP', tokenRes.status);
      redirectOAuthError(res, appHome, 'token_exchange_failed');
      return;
    }
  } catch (error) {
    console.error('Google OAuth token exchange error:', error);
    redirectOAuthError(res, appHome, 'token_exchange_failed');
    return;
  }

  let profile = null;
  try {
    profile = await verifyGoogleIdToken(idToken, googleClientId);
  } catch (error) {
    console.error('Google OAuth tokeninfo verification error:', error);
    profile = null;
  }
  if (!profile) {
    redirectOAuthError(res, appHome, 'invalid_token');
    return;
  }

  try {
    const db = await database();
    await ensureSchema(db);
    const user = await upsertGoogleUser(db, req, profile);
    setSessionCookie(req, res, signSessionToken(user.id));
    sendRedirect(res, appHome);
  } catch (error) {
    console.error('Google OAuth callback DB error:', error);
    redirectOAuthError(res, appHome, 'database_error');
  }
}

export async function handleAuthRegister(req, res) {
  const body = await parseAuthPostBody(req, res);
  if (!body) return;

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendJson(res, 400, { error: 'Email không hợp lệ.' });
    return;
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (Array.from(password).length < 6) {
    sendJson(res, 400, { error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    return;
  }
  if (Buffer.byteLength(password, 'utf8') > 1024) {
    sendJson(res, 400, { error: 'Mật khẩu quá dài.' });
    return;
  }

  const rawDisplayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const displayName = rawDisplayName ? Array.from(rawDisplayName).slice(0, 100).join('') : null;

  try {
    const db = await database();
    await ensureSchema(db);

    const [existing] = await db.execute(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );
    if (Array.isArray(existing) && existing.length > 0) {
      sendJson(res, 409, { error: 'Email đã được đăng ký.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const connection = await db.getConnection();
    let user;
    try {
      await connection.beginTransaction();
      const [insertResult] = await connection.execute(
        `INSERT INTO users (google_sub, email, password_hash, display_name, avatar_url)
         VALUES (NULL, ?, ?, ?, NULL)`,
        [email, passwordHash, displayName]
      );
      const userId = Number(insertResult.insertId);
      const [rows] = await connection.execute(
        'SELECT id, email, display_name, avatar_url FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      if (!rows || rows.length === 0) {
        throw new Error('User creation failed');
      }
      user = formatUser(rows[0]);
      await migrateOwnerHistory(connection, req, user.id);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        sendJson(res, 409, { error: 'Email đã được đăng ký.' });
        return;
      }
      throw err;
    } finally {
      connection.release();
    }

    setSessionCookie(req, res, signSessionToken(user.id));
    sendJson(res, 201, { authenticated: true, user });
  } catch (error) {
    console.error('Auth register error:', error);
    sendJson(res, 503, { error: 'Database unavailable' });
  }
}

export async function handleAuthLogin(req, res) {
  const body = await parseAuthPostBody(req, res);
  if (!body) return;

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    sendJson(res, 400, { error: 'Vui lòng nhập email và mật khẩu.' });
    return;
  }
  if (email.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Buffer.byteLength(password, 'utf8') > 1024) {
    sendJson(res, 401, { error: 'Email hoặc mật khẩu không đúng.' });
    return;
  }

  try {
    const db = await database();
    await ensureSchema(db);
    const [rows] = await db.execute(
      'SELECT id, email, password_hash, display_name, avatar_url FROM users WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row || !verifyPassword(password, row.password_hash)) {
      sendJson(res, 401, { error: 'Email hoặc mật khẩu không đúng.' });
      return;
    }

    const user = formatUser(row);
    await migrateOwnerHistory(db, req, user.id);

    setSessionCookie(req, res, signSessionToken(user.id));
    sendJson(res, 200, { authenticated: true, user });
  } catch (error) {
    console.error('Auth login error:', error);
    sendJson(res, 503, { error: 'Database unavailable' });
  }
}

export async function handleAuthLogout(req, res) {
  if (!isAllowedOrigin(req)) {
    sendJson(res, 403, { error: 'Forbidden origin' });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  clearSessionCookie(req, res);
  sendJson(res, 200, { authenticated: false });
}
