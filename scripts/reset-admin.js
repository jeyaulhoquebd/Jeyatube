// Forgot the admin login? Run on the server:
//   npm run reset-admin                      -> new random password for the current admin e-mail
//   npm run reset-admin -- you@example.com   -> also change the admin e-mail
// Writes DATA_DIR/admin.json. If ADMIN_EMAIL / ADMIN_PASSWORD(_HASH) are set in .env,
// those take priority — change them there instead.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('../lib/security');

const root = path.join(__dirname, '..');
try {
  fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch { /* no .env */ }

const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
const file = path.join(dataDir, 'admin.json');
let current = 'admin@jtube.com';
try { current = JSON.parse(fs.readFileSync(file, 'utf8'))[0].email || current; } catch { /* none yet */ }

const email = (process.argv[2] || current).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('Invalid e-mail address.'); process.exit(1); }
const password = crypto.randomBytes(12).toString('base64url');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(file, JSON.stringify([{ email, hash: hashPassword(password) }]), { mode: 0o600 });

console.log('\nJTube admin login reset');
console.log('  Email:    ' + email);
console.log('  Password: ' + password);
console.log('\nRestart the server, then sign in at /admin.html and keep this password safe.');
if (process.env.ADMIN_EMAIL && (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH)) {
  console.log('\n⚠ ADMIN_EMAIL and ADMIN_PASSWORD(_HASH) are set in .env — they override this file.');
  console.log('  Remove them from .env, or set a new hash with: npm run hash-password -- "new-password"');
}
