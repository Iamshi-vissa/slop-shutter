// A small local server for the web interface. It serves the static files and offers one
// endpoint, /api/fetch, so the browser can scan live web pages without CORS getting in the
// way. It listens on 127.0.0.1 only; do not expose it to a network.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8', '.jsx': 'text/plain; charset=utf-8',
};
const FETCH_LIMIT = 3_000_000;

async function fetchPage(target, res) {
  let url;
  try { url = new URL(target); } catch { return send(res, 400, 'Not a valid URL'); }
  if (!/^https?:$/.test(url.protocol)) return send(res, 400, 'Only http and https URLs can be fetched');
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'slop-shutter/0.1', accept: 'text/html,text/plain,*/*' } });
    const text = await r.text();
    if (text.length > FETCH_LIMIT) return send(res, 413, 'Page is larger than 3 MB');
    res.writeHead(r.ok ? 200 : 502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ url: r.url, status: r.status, contentType: r.headers.get('content-type') || '', text }));
  } catch (e) {
    send(res, 502, `Could not fetch: ${e.message}`);
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

export function serve({ port = 4173, root }) {
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/fetch') return fetchPage(u.searchParams.get('url') || '', res);
    if (u.pathname === '/api/health') return send(res, 200, 'ok');
    if (u.pathname === '/' || u.pathname === '/web') { res.writeHead(302, { location: '/web/' }); return res.end(); }
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '').replace(/\/$/, '/index.html');
    const path = normalize(join(root, rel));
    if (!path.startsWith(root + sep)) return send(res, 403, 'Forbidden');
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      send(res, 404, 'Not found');
    }
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Slop Shutter is running at http://localhost:${port}/\n`);
  });
  return server;
}
