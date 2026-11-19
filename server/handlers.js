// HTTP handlers shared by the Node server (server.js) and serverless functions (api/).
// They use only the plain Node request and response objects, so they run on any host.
//
//   POST /api/analyze   score text: JSON { text, filename?, kind?, context?, findings? } or a raw body
//   GET  /api/fetch     fetch a public page for the web app: ?url=https://…
//   GET  /api/health    liveness check

import { analyze, toJSON } from '../src/index.js';
import { safeFetch, FetchError } from './safe-fetch.js';

export const VERSION = '1.2.0';
const MAX_BODY = 1_000_000; // characters of text accepted by /api/analyze
const KINDS = new Set(['prose', 'html', 'code']);
const CONTEXTS = new Set(['auto', 'technical', 'general']);

// ── Rate limiting: fixed one-minute windows per client address, per route ─────
const LIMITS = {
  analyze: Number(process.env.RATE_LIMIT_ANALYZE || 120),
  fetch: Number(process.env.RATE_LIMIT_FETCH || 20),
};
const windows = new Map();
function clientAddress(req) {
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.VERCEL;
  const forwarded = trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}
export function rateLimited(req, res, route) {
  const limit = LIMITS[route];
  if (!limit) return false;
  const now = Date.now();
  const key = `${route}:${clientAddress(req)}`;
  let w = windows.get(key);
  if (!w || now >= w.reset) { w = { count: 0, reset: now + 60_000 }; windows.set(key, w); }
  w.count++;
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - w.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil((w.reset - now) / 1000)));
  if (w.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil((w.reset - now) / 1000)));
    sendJSON(res, 429, { error: 'Too many requests; try again in a minute.' });
    return true;
  }
  if (windows.size > 10_000) for (const [k, v] of windows) if (now >= v.reset) windows.delete(k);
  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function sendJSON(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function cors(req, res) {
  // The analysis API is meant to be called from other apps; allow it cross-origin.
  res.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-max-age', '86400');
}

async function readBody(req) {
  // Serverless platforms may have parsed the body already.
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : req.body;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY * 4) throw Object.assign(new Error('Request body is too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ── Handlers ──────────────────────────────────────────────────────────────────
export async function analyzeHandler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Use POST with a JSON body: { "text": "…" }' });
  if (rateLimited(req, res, 'analyze')) return;

  let body;
  try { body = await readBody(req); } catch (e) { return sendJSON(res, e.status || 400, { error: e.message }); }
  const type = String(req.headers['content-type'] || '');
  let input = {};
  if (typeof body === 'object') input = body;
  else if (/json/i.test(type) || /^\s*\{/.test(body)) {
    try { input = JSON.parse(body || '{}'); } catch { return sendJSON(res, 400, { error: 'Body is not valid JSON' }); }
  } else input = { text: body };

  const { text, filename = '', kind, context = 'auto', findings = true } = input || {};
  if (typeof text !== 'string' || !text.trim()) return sendJSON(res, 400, { error: '"text" must be a non-empty string' });
  if (text.length > MAX_BODY) return sendJSON(res, 413, { error: `"text" is longer than ${MAX_BODY.toLocaleString('en')} characters` });
  if (typeof filename !== 'string' || filename.length > 260) return sendJSON(res, 400, { error: '"filename" must be a short string' });
  if (kind !== undefined && !KINDS.has(kind)) return sendJSON(res, 400, { error: '"kind" must be prose, html or code' });
  if (!CONTEXTS.has(context)) return sendJSON(res, 400, { error: '"context" must be auto, technical or general' });

  const started = performance.now();
  const result = toJSON(analyze(text, { filename, kind, context }));
  if (findings === false) delete result.findings;
  return sendJSON(res, 200, { ...result, elapsedMs: Math.round((performance.now() - started) * 10) / 10 });
}

export async function fetchHandler(req, res) {
  if (req.method !== 'GET') return sendJSON(res, 405, { error: 'Use GET ?url=…' });
  if (process.env.DISABLE_FETCH === '1') return sendJSON(res, 404, { error: 'Page fetching is turned off on this server' });
  if (rateLimited(req, res, 'fetch')) return;
  const target = new URL(req.url, 'http://local').searchParams.get('url') || '';
  try {
    const page = await safeFetch(target);
    return sendJSON(res, 200, page);
  } catch (e) {
    const status = e instanceof FetchError ? e.status : 502;
    return sendJSON(res, status, { error: e.message });
  }
}

export function healthHandler(req, res) {
  return sendJSON(res, 200, { ok: true, version: VERSION, fetch: process.env.DISABLE_FETCH !== '1' });
}
