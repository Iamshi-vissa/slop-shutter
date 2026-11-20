// Fetch a public web page without letting the server be used to reach private networks.
//
// A deployed /api/fetch accepts any URL from anyone, so it must not become a way into the
// machine it runs on or the network around it (server-side request forgery). Every address a
// host name resolves to is checked when the connection is made, not before, so a DNS answer
// cannot change between the check and the connection. Redirects are followed by hand and each
// hop is checked again. Only ports 80 and 443 are allowed, and size and time are capped.

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';

export const LIMITS = { bytes: 3_000_000, redirects: 5, timeoutMs: 12_000 };

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
  ['100::', 64], ['2002::', 16], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
]) blocked.addSubnet(addr, prefix, 'ipv6');

/** True for loopback, private, link-local, multicast, reserved and documentation addresses. */
export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const v4 = address.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4) return blocked.check(v4[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true; // not an IP address at all
}

export class FetchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Check a URL's shape before any network activity. Returns a URL object. */
export function checkUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new FetchError('Not a valid URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('Only http and https addresses can be fetched');
  if (url.username || url.password) throw new FetchError('Addresses with credentials are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchError('Only the standard web ports (80 and 443) are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i.test(host)) {
    throw new FetchError('Local and internal addresses are not allowed');
  }
  if (net.isIP(host) && isBlockedAddress(host)) throw new FetchError('Private and reserved addresses are not allowed');
  return url;
}

// Resolver used for every connection: refuse if any answer is a blocked address.
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length) return callback(new FetchError('Host has no address', 502));
    const bad = addresses.find((a) => isBlockedAddress(a.address));
    if (bad) return callback(new FetchError('That host resolves to a private or reserved address', 400));
    if (options && options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

/**
 * Turn a response body into text. Some servers compress even when asked not to, so gzip,
 * deflate and Brotli are decompressed, capped so a small body cannot expand past the limit.
 */
export function decodeBody(body, headers = {}) {
  const encoding = String(headers['content-encoding'] || '').trim().toLowerCase();
  const opts = { maxOutputLength: LIMITS.bytes };
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') body = zlib.gunzipSync(body, opts);
    else if (encoding === 'deflate') body = zlib.inflateSync(body, opts);
    else if (encoding === 'br') body = zlib.brotliDecompressSync(body, opts);
  } catch {
    throw new FetchError('Page is larger than 3 MB or its compression is invalid', 413);
  }
  if (encoding && !['gzip', 'x-gzip', 'deflate', 'br', 'identity'].includes(encoding)) {
    throw new FetchError(`Unsupported content encoding (${encoding})`, 415);
  }
  const charset = (String(headers['content-type'] || '').match(/charset=([\w-]+)/i) || [])[1] || 'utf-8';
  let decoder;
  try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder('utf-8'); }
  return decoder.decode(body);
}

function request(url) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      lookup: guardedLookup,
      timeout: LIMITS.timeoutMs,
      headers: {
        'user-agent': 'SlopShutter/1.0 (+content analysis)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'accept-encoding': 'identity',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url) });
      }
      const type = String(res.headers['content-type'] || '');
      if (type && !/^(?:text\/|application\/(?:xhtml\+xml|xml|json|javascript|ld\+json))/i.test(type)) {
        res.destroy();
        return reject(new FetchError(`Not a text page (${type.split(';')[0]})`, 415));
      }
      const declared = Number(res.headers['content-length'] || 0);
      if (declared > LIMITS.bytes) {
        res.destroy();
        return reject(new FetchError('Page is larger than 3 MB', 413));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > LIMITS.bytes) { res.destroy(); reject(new FetchError('Page is larger than 3 MB', 413)); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, contentType: type, text: decodeBody(Buffer.concat(chunks), res.headers) });
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new FetchError('The page took too long to respond', 504)));
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(`Could not fetch: ${e.code || e.message}`, 502)));
    req.end();
  });
}

/** Fetch a public text page. Resolves { url, status, contentType, text }. */
export async function safeFetch(input) {
  let url = checkUrl(input);
  for (let hop = 0; hop <= LIMITS.redirects; hop++) {
    const res = await request(url);
    if (!res.redirect) return { url: url.href, ...res };
    url = checkUrl(res.redirect.href);
  }
  throw new FetchError('Too many redirects', 508);
}
