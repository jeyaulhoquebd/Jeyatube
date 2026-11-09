'use strict';
/**
 * Verifies Firebase Authentication ID tokens on the server without extra dependencies.
 * Follows Firebase's documented rules: RS256 signature by one of Google's current
 * securetoken certificates, aud = project id, iss = https://securetoken.google.com/<project>,
 * valid exp/iat/auth_time, non-empty sub (= the user's UID).
 */
const crypto = require('crypto');

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

class FirebaseTokenVerifier {
  constructor({ projectId, fetchCerts }) {
    this.projectId = projectId;
    this.cache = { certs: null, expires: 0 };
    this.fetchCerts = fetchCerts || (async () => {
      const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('Could not download Google signing certificates');
      const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
      return { certs: await res.json(), maxAge: m ? parseInt(m[1], 10) : 3600 };
    });
  }

  async certs() {
    if (this.cache.certs && Date.now() < this.cache.expires) return this.cache.certs;
    const { certs, maxAge } = await this.fetchCerts();
    this.cache = { certs, expires: Date.now() + Math.max(60, maxAge) * 1000 };
    return certs;
  }

  /** Returns the decoded claims, or throws an Error explaining why the token is invalid. */
  async verify(idToken) {
    if (typeof idToken !== 'string' || idToken.length > 4096) throw new Error('Missing token');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    let header, claims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch { throw new Error('Malformed token'); }
    if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm');

    let certs = await this.certs();
    if (!certs[header.kid]) {
      this.cache.expires = 0; // keys may have rotated
      certs = await this.certs();
    }
    const pem = certs[header.kid];
    if (!pem) throw new Error('Unknown signing key');
    const ok = crypto.createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(pem, Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new Error('Invalid token signature');

    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    if (claims.aud !== this.projectId) throw new Error('Token is for a different Firebase project');
    if (claims.iss !== `https://securetoken.google.com/${this.projectId}`) throw new Error('Unexpected token issuer');
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('Token has no user');
    if (!(claims.exp > now - skew)) throw new Error('Token expired');
    if (!(claims.iat <= now + skew)) throw new Error('Token issued in the future');
    if (claims.auth_time && !(claims.auth_time <= now + skew)) throw new Error('Invalid auth time');
    return { ...claims, uid: claims.sub };
  }
}

module.exports = { FirebaseTokenVerifier };
