const http = require('http');
const fs = require('fs');
const path = require('path');

// ===== Load .env file (if present) =====
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const env = {};
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = val;
    }
    console.log('✅ Loaded .env file');
  } catch {
    console.log('ℹ️  No .env file found — using browser-stored API key');
  }
  return env;
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Reload env on each request so changes to .env are picked up without restart
  const env = loadEnv();

  // CORS headers (useful if you open from file://)
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ===== API: serve config to frontend =====
  if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Check process.env first (Cloud Run), then .env file
    const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || null;
    res.end(JSON.stringify({ apiKey }));
    return;
  }

  // ===== Static files =====
  let urlPath = req.url.split('?')[0]; // strip query params
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  // Security: don't serve files outside project dir
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎨 Sketch to Masterpiece`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`\n💡 API Key options:`);
  console.log(`   1. Add to .env file:   GEMINI_API_KEY=your_key_here`);
  console.log(`   2. Enter in the app:   Click "API Key" button in the UI`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
