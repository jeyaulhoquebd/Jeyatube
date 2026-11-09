'use strict';
/**
 * Minimal Firestore REST client for Node (no dependencies).
 * Auth: Google service-account JSON (FIREBASE_SERVICE_ACCOUNT) → OAuth access token.
 * Emulator: set FIRESTORE_EMULATOR_HOST=localhost:8080 (no credentials needed).
 */
const crypto = require('crypto');

class FirestoreRest {
  constructor({ projectId, serviceAccount }) {
    this.projectId = projectId;
    this.sa = serviceAccount || null;
    this.emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
    this.base = this.emulator
      ? `http://${this.emulator}/v1/projects/${projectId}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    this.token = null;
    this.tokenExp = 0;
    this.writes = 0;
    this.reads = 0;
  }

  async accessToken() {
    if (this.emulator) return 'owner';
    if (this.token && Date.now() < this.tokenExp - 60000) return this.token;
    if (!this.sa || !this.sa.private_key || !this.sa.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or invalid');
    const now = Math.floor(Date.now() / 1000);
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: this.sa.client_email, sub: this.sa.client_email,
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/datastore'
    })}`;
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` })
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Service account login failed: ' + (data.error_description || data.error || res.status));
    this.token = data.access_token;
    this.tokenExp = Date.now() + data.expires_in * 1000;
    return this.token;
  }

  async request(method, url, body) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60000)
      });
      if (res.status === 404 && method === 'GET') return null;
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if ([429, 500, 503].includes(res.status) && attempt < 3) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue; }
      throw new Error(`Firestore ${method} failed (${res.status}): ${(data.error && data.error.message) || ''}`);
    }
  }

  // ---------- value encoding ----------
  static encode(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(FirestoreRest.encode) } };
    if (typeof v === 'object') return { mapValue: { fields: FirestoreRest.fields(v) } };
    return { stringValue: String(v) };
  }
  static fields(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = FirestoreRest.encode(v);
    return out;
  }
  static decode(val) {
    if (!val) return null;
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('stringValue' in val) return val.stringValue;
    if ('timestampValue' in val) return Date.parse(val.timestampValue);
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(FirestoreRest.decode);
    if ('mapValue' in val) return FirestoreRest.decodeFields(val.mapValue.fields || {});
    return null;
  }
  static decodeFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) out[k] = FirestoreRest.decode(v);
    return out;
  }

  docName(path) { return `projects/${this.projectId}/databases/(default)/documents/${path}`; }

  // ---------- operations ----------
  async get(path) {
    this.reads++;
    const d = await this.request('GET', `${this.base}/${path}`);
    return d ? FirestoreRest.decodeFields(d.fields) : null;
  }

  /** Writes [{ path, data }] (full replace) or [{ path, delete: true }] in batches of 400. */
  async commit(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const writes = ops.slice(i, i + 400).map(op => op.delete
        ? { delete: this.docName(op.path) }
        : { update: { name: this.docName(op.path), fields: FirestoreRest.fields(op.data) } });
      await this.request('POST', `${this.base}:commit`, { writes });
      this.writes += writes.length;
    }
  }

  async set(path, data) { return this.commit([{ path, data }]); }

  /** Lists all document ids of a (small) collection. */
  async listIds(collection) {
    const ids = [];
    let pageToken = '';
    do {
      const d = await this.request('GET', `${this.base}/${collection}?pageSize=300&mask.fieldPaths=__name__${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`);
      (d && d.documents || []).forEach(doc => ids.push(doc.name.split('/').pop()));
      this.reads += (d && d.documents || []).length || 1;
      pageToken = d && d.nextPageToken;
    } while (pageToken);
    return ids;
  }

  /** Returns ids among `ids` that exist in `collection` (batched reads, field mask = none). */
  async existing(collection, ids) {
    const found = new Set();
    for (let i = 0; i < ids.length; i += 100) {
      const res = await this.request('POST', `${this.base}:batchGet`, {
        documents: ids.slice(i, i + 100).map(id => this.docName(`${collection}/${id}`)),
        mask: { fieldPaths: ['id'] }
      });
      (res || []).forEach(r => { if (r.found) found.add(r.found.name.split('/').pop()); });
      this.reads += Math.min(100, ids.length - i);
    }
    return found;
  }

  /** count(*) with optional equality filters: [[field, value], ...] */
  async count(collection, filters = []) {
    const where = filters.length === 0 ? undefined : (filters.length === 1
      ? { fieldFilter: { field: { fieldPath: filters[0][0] }, op: 'EQUAL', value: FirestoreRest.encode(filters[0][1]) } }
      : { compositeFilter: { op: 'AND', filters: filters.map(([f, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: FirestoreRest.encode(v) } })) } });
    const res = await this.request('POST', `${this.base}:runAggregationQuery`, {
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: collection }], ...(where ? { where } : {}) },
        aggregations: [{ alias: 'n', count: {} }]
      }
    });
    this.reads++;
    const r = (res || []).find(x => x.result);
    return r ? Number(r.result.aggregateFields.n.integerValue || 0) : 0;
  }

  /** Ids of documents where field == value (used to delete a removed channel's videos). */
  async idsWhere(collection, field, value, limit = 500) {
    const res = await this.request('POST', `${this.base}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: FirestoreRest.encode(value) } },
        select: { fields: [{ fieldPath: '__name__' }] },
        limit
      }
    });
    const ids = (res || []).filter(r => r.document).map(r => r.document.name.split('/').pop());
    this.reads += ids.length || 1;
    return ids;
  }
}

module.exports = { FirestoreRest };
