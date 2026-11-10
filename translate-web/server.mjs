import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-load Lens from chrome-lens-ocr
let lensInstance = null;
async function getLens() {
  if (!lensInstance) {
    const { default: Lens } = await import('chrome-lens-ocr');
    lensInstance = new Lens();
  }
  return lensInstance;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const PORT = parseInt(process.env.PORT, 10) || 8080;

/**
 * Handles static file serving
 */
function serveStaticFile(req, res, pathname) {
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

/**
 * Handles direct image buffer OCR (from paste or upload)
 */
function handleBufferOcr(req, res) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Dữ liệu ảnh rỗng' }));
        return;
      }

      const lens = await getLens();
      const result = await lens.scanByBuffer(buffer);
      const text = result.segments.map(s => s.text).join('\n').trim();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, text }));
    } catch (ocrErr) {
      console.error('Buffer OCR error:', ocrErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: ocrErr.message || 'Lỗi nhận diện OCR' }));
    }
  });
}

/**
 * Handles Google Translate TTS audio proxy
 */
function handleTtsProxy(req, res, parsedUrl) {
  const tl = parsedUrl.searchParams.get('tl') || 'vi';
  const q = parsedUrl.searchParams.get('q') || '';
  if (!q) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Thiếu tham số q' }));
    return;
  }

  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q.slice(0, 200))}`;
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://translate.google.com/'
    }
  };

  https.get(googleTtsUrl, options, (googleRes) => {
    if (googleRes.statusCode !== 200) {
      res.writeHead(googleRes.statusCode || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Google TTS error ${googleRes.statusCode}` }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': googleRes.headers['content-type'] || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    googleRes.pipe(res);
  }).on('error', (err) => {
    console.error('TTS Proxy error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message || 'Lỗi phát âm thanh TTS' }));
  });
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'POST' && pathname === '/api/ocr') {
    handleBufferOcr(req, res);
  } else if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/tts') {
    handleTtsProxy(req, res, parsedUrl);
  } else if (req.method === 'GET' && pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ocr: 'chrome-lens-ocr' }));
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStaticFile(req, res, pathname);
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }
});

// Start server if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Google Translate Web Server running at http://localhost:${PORT}`);
    console.log(`- Static files served from ${__dirname}`);
    console.log(`- POST /api/ocr (buffer upload/paste + chrome-lens-ocr)`);
    console.log(`- GET /api/tts?tl=...&q=... (Google Translate TTS proxy)`);
  });
}

export { server, getLens };
