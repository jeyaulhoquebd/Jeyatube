'use strict';
/**
 * JTube server security helpers:
 * - admin credentials (scrypt hashed), HMAC-signed HttpOnly session cookie
 * - login brute-force lockout, generic per-IP rate limiting
 * - security headers + Content Security Policy
 * - same-origin check for state-changing requests (CSRF defence)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOKIE = 'jtube_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

class AdminAuth {
  constructor({ dataDir, log = console }) {
    this.log = log;
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.secret = this._loadSecret();
    this.admins = this._loadAdmins();
    this.failures = new Map(); // ip -> {count, until}
  }

  _loadSecret() {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return process.env.SESSION_SECRET;
    const file = path.join(this.dataDir, 'session.secret');
    try { return fs.readFileSync(file, 'utf8').trim(); } catch { /* create */ }
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }

  /**
   * Admin accounts come from (in order):
   *   ADMIN_EMAIL + ADMIN_PASSWORD_HASH   (recommended; create with `npm run hash-password`)
   *   ADMIN_EMAIL + ADMIN_PASSWORD        (plain text env var, hashed in memory)
   *   data/admin.json                     (auto-created on first run with a random password)
   */
  _loadAdmins() {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (email && process.env.ADMIN_PASSWORD_HASH) return [{ email, hash: process.env.ADMIN_PASSWORD_HASH }];
    if (email && process.env.ADMIN_PASSWORD) {
      if (process.env.ADMIN_PASSWORD.length < 10) this.log.warn('[Security] ADMIN_PASSWORD is shorter than 10 characters — please use a stronger password.');
      return [{ email, hash: hashPassword(process.env.ADMIN_PASSWORD) }];
    }
    const file = path.join(this.dataDir, 'admin.json');
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* create below */ }
    const password = crypto.randomBytes(12).toString('base64url');
    const admins = [{ email: email || 'admin@jtube.com', hash: hashPassword(password) }];
    fs.writeFileSync(file, JSON.stringify(admins), { mode: 0o600 });
    this.log.warn('==================================================================');
    this.log.warn('[Security] No ADMIN_EMAIL / ADMIN_PASSWORD_HASH configured.');
    this.log.warn(`[Security] Generated a one-time admin login: ${admins[0].email} / ${password}`);
    this.log.warn('[Security] Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in the environment to replace it.');
    this.log.warn('==================================================================');
    return admins;
  }

  _ip(req) { return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'; }

  lockedFor(req) {
    const f = this.failures.get(this._ip(req));
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  }

  login(req, email, password) {
    const ip = this._ip(req);
    const e = String(email || '').trim().toLowerCase();
    const admin = this.admins.find(a => a.email === e);
    // Always run scrypt so response time doesn't reveal whether the email exists
    const ok = verifyPassword(String(password || ''), admin ? admin.hash : hashPassword('dummy-password'));
    if (admin && ok) { this.failures.delete(ip); return this._issue(admin.email); }
    const f = this.failures.get(ip) || { count: 0, until: 0 };
    f.count++;
    if (f.count >= 5) { f.until = Date.now() + Math.min(60, 2 ** (f.count - 5) * 5) * 60 * 1000; }
    this.failures.set(ip, f);
    return null;
  }

  _issue(email) {
    const payload = b64url(JSON.stringify({ e: email, x: Date.now() + SESSION_TTL_MS, n: crypto.randomBytes(8).toString('hex') }));
    const sig = b64url(crypto.createHmac('sha256', this.secret).update(payload).digest());
    return `${payload}.${sig}`;
  }

  verify(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = b64url(crypto.createHmac('sha256', this.secret).update(payload).digest());
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!data.x || data.x < Date.now()) return null;
      if (!this.admins.some(a => a.email === data.e)) return null;
      return { email: data.e, expires: data.x };
    } catch { return null; }
  }

  cookie(req, token, maxAgeMs = SESSION_TTL_MS) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`;
  }

  session(req) {
    const raw = String(req.headers.cookie || '');
    const m = raw.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
    return m ? this.verify(m.slice(COOKIE.length + 1)) : null;
  }

  requireAdmin() {
    return (req, res, next) => {
      const s = this.session(req);
      if (!s) return res.status(401).json({ error: 'Admin login required' });
      req.admin = s;
      next();
    };
  }
}

/** Simple sliding-window per-IP limiter. */
function rateLimit({ windowMs, max, message = 'Too many requests, please slow down.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count++;
    if (h.count > max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

/** Reject cross-site state-changing requests (CSRF). */
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next(); // non-browser clients (curl, WebSub hub)
  try {
    const host = new URL(origin).host;
    const expected = req.headers['x-forwarded-host'] || req.headers.host;
    if (host === expected) return next();
  } catch { /* fall through */ }
  return res.status(403).json({ error: 'Cross-origin request blocked' });
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://www.gstatic.com https://www.youtube.com https://s.ytimg.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https: blob:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self' https://noembed.com https://api.country.is",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  "frame-ancestors 'self'"
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = { AdminAuth, rateLimit, sameOrigin, securityHeaders, hashPassword, verifyPassword, COOKIE };
