// Slop Shutter server: serves the web app and the HTTP API.
//
//   node bin/slop-shutter.js serve              http://localhost:4173 (local only)
//   HOST=0.0.0.0 PORT=8080 node server.js       for containers and hosting platforms
//
// The API lives in server/handlers.js and is shared with the serverless functions in api/.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHandler, fetchHandler, healthHandler, sendJSON } from './server/handlers.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

// Only the built web app (dist/, from `npm run build`) is public.

export const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};

async function serveStatic(root, pathname, res, production) {
  let rel;
  try { rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { return sendJSON(res, 400, { error: 'Bad path' }); }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const path = normalize(join(root, rel));
  if (!path.startsWith(root + sep)) return sendJSON(res, 403, { error: 'Forbidden' });
  try {
    if (!(await stat(path)).isFile()) throw new Error('not a file');
    const body = await readFile(path);
    const hashed = rel.startsWith('assets/');
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': TYPES[extname(path)] || 'application/octet-stream',
      'cache-control': !production ? 'no-store' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate',
    });
    res.end(body);
  } catch {
    if (rel === 'index.html') {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('The web app has not been built. Run "npm run build", then start the server again.');
    }
    sendJSON(res, 404, { error: 'Not found' });
  }
}

export function createApp({ root, staticDir, production = process.env.NODE_ENV === 'production' } = {}) {
  const base = resolve(staticDir || join(root || fileURLToPath(new URL('.', import.meta.url)), 'dist'));
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/api/analyze') return await analyzeHandler(req, res);
      if (pathname === '/api/fetch') return await fetchHandler(req, res);
      if (pathname === '/api/health') return healthHandler(req, res);
      if (pathname.startsWith('/api/')) return sendJSON(res, 404, { error: 'Unknown endpoint' });
      if (pathname === '/web' || pathname.startsWith('/web/')) {
        res.writeHead(301, { location: '/' });
        return res.end();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJSON(res, 405, { error: 'Method not allowed' });
      return await serveStatic(base, pathname, res, production);
    } catch (e) {
      if (!res.headersSent) sendJSON(res, 500, { error: 'Internal error' });
      process.stderr.write(`${e.stack || e}\n`);
    }
  });
}

export function serve({ port = Number(process.env.PORT) || 4173, host = process.env.HOST || '127.0.0.1', root, staticDir } = {}) {
  const server = createApp({ root, staticDir });
  server.listen(port, host, () => {
    const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
    process.stdout.write(`Slop Shutter is running at http://${shown}:${port}/\n`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return server;
}

// Default export: a plain request handler, so platforms that load this file as a function
// (Vercel's Node.js preset, for example) can serve the whole app through it.
let app;
export default function handler(req, res) {
  app ??= createApp();
  app.emit('request', req, res);
}

// Run directly: node server.js
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
