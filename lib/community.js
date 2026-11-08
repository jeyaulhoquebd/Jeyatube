'use strict';
/**
 * JTube community: viewer accounts + the shared group chat.
 *
 * Security model
 * - Passwords: scrypt (same helpers as the admin login).
 * - Sessions: HMAC-signed, HttpOnly, SameSite=Strict cookie (30 days).
 * - Chat: only signed-in, non-banned users can post; per-user flood control,
 *   duplicate/spam detection, link limits, abuse filter, length limits,
 *   community reports that auto-hide a message, admin delete + ban.
 * - Privacy: e-mail addresses are never sent to other users.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('./security');

const COOKIE = 'jtube_user';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 1000;
const MAX_TEXT = 1000;
const REPORTS_TO_HIDE = 3;

const b64url = buf => Buffer.from(buf).toString('base64url');

function cleanText(str, max) {
  return String(str == null ? '' : str)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

function cleanName(str) {
  return cleanText(str, 40).replace(/\s+/g, ' ').replace(/[<>"'`]/g, '');
}

class Community {
  constructor({ dataDir, secret, log = console, isAbusive = () => false }) {
    this.dataDir = dataDir;
    this.secret = secret;
    this.log = log;
    this.isAbusive = isAbusive;
    this.users = new Map();       // id -> user
    this.byEmail = new Map();     // email -> id
    this.messages = [];           // newest last
    this.seq = 0;
    this.reports = [];
    this.lastSeen = new Map();    // uid -> ts
    this.flood = new Map();       // uid -> { last, window: [ts...], lastText, lastTextAt }
    this.loginFailures = new Map(); // ip -> { count, until }
    this.dirty = false;
    fs.mkdirSync(dataDir, { recursive: true });
    this._load();
    this.saveTimer = setInterval(() => this.save(), 15000);
    this.saveTimer.unref();
  }

  // ---------- persistence ----------
  _file(n) { return path.join(this.dataDir, n); }
  _read(n, fb) { try { return JSON.parse(fs.readFileSync(this._file(n), 'utf8')); } catch { return fb; } }
  _write(n, data) {
    const tmp = this._file(n + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, this._file(n));
  }
  _load() {
    (this._read('users.json', []) || []).forEach(u => { this.users.set(u.id, u); this.byEmail.set(u.email, u.id); });
    const g = this._read('group.json', {});
    this.messages = Array.isArray(g.messages) ? g.messages : [];
    this.reports = Array.isArray(g.reports) ? g.reports : [];
    this.seq = Math.max(g.seq || 0, ...this.messages.map(m => m.rev || 0), 0);
  }
  save() {
    if (!this.dirty) return;
    try {
      this._write('users.json', Array.from(this.users.values()));
      this._write('group.json', { seq: this.seq, messages: this.messages, reports: this.reports.slice(-500) });
      this.dirty = false;
    } catch (e) { this.log.warn('[Community] save failed:', e.message); }
  }

  // ---------- accounts ----------
  publicUser(u) {
    return u ? { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, banned: Boolean(u.banned) } : null;
  }

  register({ name, email, password }) {
    const n = cleanName(name);
    const e = String(email || '').trim().toLowerCase().slice(0, 150);
    const p = String(password || '');
    if (n.length < 2) throw Object.assign(new Error('Please enter a name (at least 2 characters).'), { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw Object.assign(new Error('Please enter a valid email address.'), { status: 400 });
    if (p.length < 8) throw Object.assign(new Error('Password must be at least 8 characters.'), { status: 400 });
    if (p.length > 200) throw Object.assign(new Error('Password is too long.'), { status: 400 });
    if (this.byEmail.has(e)) throw Object.assign(new Error('An account with this email already exists. Please sign in.'), { status: 409, code: 'auth/email-already-in-use' });
    const u = { id: 'u_' + crypto.randomBytes(9).toString('base64url'), name: n, email: e, hash: hashPassword(p), createdAt: Date.now(), banned: false };
    this.users.set(u.id, u);
    this.byEmail.set(e, u.id);
    this.dirty = true;
    this.save();
    return u;
  }

  lockedFor(ip) {
    const f = this.loginFailures.get(ip);
    return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
  }

  login(ip, email, password) {
    const e = String(email || '').trim().toLowerCase();
    const id = this.byEmail.get(e);
    const u = id ? this.users.get(id) : null;
    const ok = verifyPassword(String(password || ''), u ? u.hash : hashPassword('dummy-password'));
    if (u && ok) { this.loginFailures.delete(ip); return u; }
    const f = this.loginFailures.get(ip) || { count: 0, until: 0 };
    f.count++;
    if (f.count >= 8) f.until = Date.now() + Math.min(60, 2 ** (f.count - 8) * 5) * 60 * 1000;
    this.loginFailures.set(ip, f);
    return null;
  }

  issue(u) {
    const payload = b64url(JSON.stringify({ u: u.id, x: Date.now() + SESSION_TTL_MS, n: crypto.randomBytes(6).toString('hex') }));
    return `${payload}.${b64url(crypto.createHmac('sha256', this.secret).update('user:' + payload).digest())}`;
  }

  cookie(req, token, maxAgeMs = SESSION_TTL_MS) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`;
  }

  session(req) {
    const raw = String(req.headers.cookie || '');
    const c = raw.split(/;\s*/).find(x => x.startsWith(COOKIE + '='));
    if (!c) return null;
    const token = c.slice(COOKIE.length + 1);
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = b64url(crypto.createHmac('sha256', this.secret).update('user:' + payload).digest());
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!d.x || d.x < Date.now()) return null;
      const u = this.users.get(d.u);
      return u || null;
    } catch { return null; }
  }

  // ---------- chat ----------
  _bump(m) { m.rev = ++this.seq; this.dirty = true; }

  _view(m, viewer) {
    const author = this.users.get(m.uid);
    return {
      id: m.id,
      kind: m.kind,
      uid: m.kind === 'ai' ? 'ai' : m.uid,
      name: m.kind === 'ai' ? 'JAsk AI' : (author ? author.name : m.name),
      text: m.deleted || m.hidden ? '' : m.text,
      deleted: Boolean(m.deleted),
      hidden: Boolean(m.hidden && !m.deleted),
      ts: m.ts,
      rev: m.rev,
      likes: (m.likes || []).length,
      liked: Boolean(viewer && (m.likes || []).includes(viewer.id)),
      mine: Boolean(viewer && m.uid === viewer.id),
      replyTo: m.replyTo || null
    };
  }

  touch(u) { if (u) this.lastSeen.set(u.id, Date.now()); }

  onlineCount() {
    const cutoff = Date.now() - 90 * 1000;
    let n = 0;
    for (const ts of this.lastSeen.values()) if (ts > cutoff) n++;
    return n;
  }

  list(after, viewer) {
    const a = Math.max(0, parseInt(after, 10) || 0);
    const items = a
      ? this.messages.filter(m => m.rev > a)
      : this.messages.filter(m => !m.deleted).slice(-150);
    return { messages: items.map(m => this._view(m, viewer)), seq: this.seq, online: this.onlineCount() };
  }

  _checkFlood(u, text) {
    const now = Date.now();
    const f = this.flood.get(u.id) || { last: 0, window: [], lastText: '', lastTextAt: 0 };
    f.window = f.window.filter(t => now - t < 60 * 1000);
    if (now - f.last < 1500) throw Object.assign(new Error('You are sending messages too fast. Please slow down.'), { status: 429 });
    if (f.window.length >= 15) throw Object.assign(new Error('Message limit reached. Please wait a minute.'), { status: 429 });
    if (f.lastText === text.toLowerCase() && now - f.lastTextAt < 60 * 1000) throw Object.assign(new Error('You already sent that message.'), { status: 429 });
    f.last = now; f.window.push(now); f.lastText = text.toLowerCase(); f.lastTextAt = now;
    this.flood.set(u.id, f);
  }

  post(u, { text, replyTo }) {
    if (!u) throw Object.assign(new Error('Please sign in to chat.'), { status: 401 });
    if (u.banned) throw Object.assign(new Error('Your account has been suspended from the community chat.'), { status: 403 });
    const t = cleanText(text, MAX_TEXT);
    if (!t) throw Object.assign(new Error('Message is empty.'), { status: 400 });
    if ((t.match(/https?:\/\//g) || []).length > 3) throw Object.assign(new Error('Too many links in one message.'), { status: 400 });
    if (this.isAbusive(t)) throw Object.assign(new Error('Message blocked: please keep the chat respectful.'), { status: 400 });
    this._checkFlood(u, t);
    let reply = null;
    if (replyTo) {
      const r = this.messages.find(m => m.id === replyTo && !m.deleted && !m.hidden);
      if (r) reply = { id: r.id, name: r.kind === 'ai' ? 'JAsk AI' : (this.users.get(r.uid) || {}).name || r.name, text: r.text.slice(0, 140) };
    }
    const m = { id: 'm_' + crypto.randomBytes(8).toString('base64url'), kind: 'user', uid: u.id, name: u.name, text: t, ts: Date.now(), likes: [], replyTo: reply };
    this._bump(m);
    this.messages.push(m);
    this._trim();
    this.touch(u);
    return this._view(m, u);
  }

  postAI(text, replyTo) {
    const r = replyTo ? this.messages.find(m => m.id === replyTo) : null;
    const m = {
      id: 'm_' + crypto.randomBytes(8).toString('base64url'), kind: 'ai', uid: 'ai', name: 'JAsk AI',
      text: cleanText(text, 4000), ts: Date.now(), likes: [],
      replyTo: r ? { id: r.id, name: (this.users.get(r.uid) || {}).name || r.name, text: r.text.slice(0, 140) } : null
    };
    this._bump(m);
    this.messages.push(m);
    this._trim();
    return m;
  }

  _trim() {
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES);
  }

  _find(id) {
    const m = this.messages.find(x => x.id === id);
    if (!m) throw Object.assign(new Error('Message not found.'), { status: 404 });
    return m;
  }

  like(u, id) {
    if (!u) throw Object.assign(new Error('Please sign in.'), { status: 401 });
    const m = this._find(id);
    m.likes = m.likes || [];
    const i = m.likes.indexOf(u.id);
    if (i >= 0) m.likes.splice(i, 1); else m.likes.push(u.id);
    this._bump(m);
    return this._view(m, u);
  }

  remove(u, id, isAdmin) {
    const m = this._find(id);
    if (!isAdmin && (!u || m.uid !== u.id)) throw Object.assign(new Error('You can only delete your own messages.'), { status: 403 });
    m.deleted = true;
    m.text = '';
    m.replyTo = null;
    this._bump(m);
    return true;
  }

  report(u, id, reason) {
    if (!u) throw Object.assign(new Error('Please sign in.'), { status: 401 });
    const m = this._find(id);
    if (m.uid === u.id) throw Object.assign(new Error('You cannot report your own message.'), { status: 400 });
    if (this.reports.some(r => r.mid === id && r.by === u.id)) return { already: true };
    this.reports.push({ mid: id, by: u.id, reason: cleanText(reason, 200), ts: Date.now(), text: m.text.slice(0, 300), author: m.uid });
    const count = new Set(this.reports.filter(r => r.mid === id).map(r => r.by)).size;
    if (count >= REPORTS_TO_HIDE && !m.hidden) { m.hidden = true; this._bump(m); }
    this.dirty = true;
    return { reported: true, hidden: Boolean(m.hidden) };
  }

  members() {
    const counts = {};
    this.messages.forEach(m => { if (m.kind === 'user' && !m.deleted) counts[m.uid] = (counts[m.uid] || 0) + 1; });
    const cutoff = Date.now() - 90 * 1000;
    return Array.from(this.users.values())
      .filter(u => !u.banned)
      .map(u => ({ id: u.id, name: u.name, joined: u.createdAt, online: (this.lastSeen.get(u.id) || 0) > cutoff, messages: counts[u.id] || 0 }))
      .sort((a, b) => (b.online - a.online) || (b.messages - a.messages) || a.name.localeCompare(b.name));
  }

  // ---------- admin ----------
  adminOverview() {
    const users = Array.from(this.users.values()).map(u => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, banned: Boolean(u.banned), lastSeen: this.lastSeen.get(u.id) || 0 }));
    const reports = this.reports.slice(-200).reverse().map(r => ({ ...r, authorName: (this.users.get(r.author) || {}).name || '?' }));
    return { users, reports, messages: this.messages.length };
  }

  setBanned(uid, banned) {
    const u = this.users.get(uid);
    if (!u) throw Object.assign(new Error('User not found.'), { status: 404 });
    u.banned = Boolean(banned);
    if (u.banned) this.messages.forEach(m => { if (m.uid === uid && !m.deleted) { m.hidden = true; this._bump(m); } });
    this.dirty = true;
    this.save();
    return this.publicUser(u);
  }
}

module.exports = { Community, COOKIE };
