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
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  // samples are served as plain text whatever their extension
  '.md': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.jsx': 'text/plain; charset=utf-8',
};

// Only these folders are public. Source for the server, tests and tooling is not served.
const PUBLIC = ['web/', 'src/', 'samples/'];

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
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '').replace(/\/$/, '/index.html');
  if (!PUBLIC.some((p) => rel.startsWith(p))) return sendJSON(res, 404, { error: 'Not found' });
  const path = normalize(join(root, rel));
  if (!path.startsWith(root + sep)) return sendJSON(res, 403, { error: 'Forbidden' });
  try {
    if (!(await stat(path)).isFile()) throw new Error('not a file');
    const body = await readFile(path);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': TYPES[extname(path)] || 'application/octet-stream',
      'cache-control': production ? 'public, max-age=300, must-revalidate' : 'no-store',
    });
    res.end(body);
  } catch {
    sendJSON(res, 404, { error: 'Not found' });
  }
}

export function createApp({ root, production = process.env.NODE_ENV === 'production' } = {}) {
  const base = resolve(root || fileURLToPath(new URL('.', import.meta.url)));
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/api/analyze') return await analyzeHandler(req, res);
      if (pathname === '/api/fetch') return await fetchHandler(req, res);
      if (pathname === '/api/health') return healthHandler(req, res);
      if (pathname.startsWith('/api/')) return sendJSON(res, 404, { error: 'Unknown endpoint' });
      if (pathname === '/' || pathname === '/web') {
        res.writeHead(302, { location: '/web/' });
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

export function serve({ port = Number(process.env.PORT) || 4173, host = process.env.HOST || '127.0.0.1', root } = {}) {
  const server = createApp({ root });
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
