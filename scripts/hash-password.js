// Usage: npm run hash-password -- "your-strong-password"
// Prints a value for ADMIN_PASSWORD_HASH (scrypt). Put it in your server .env file.
const { hashPassword } = require('../lib/security');

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Please pass a password of at least 10 characters:  npm run hash-password -- "my-long-password"');
  process.exit(1);
}
console.log(hashPassword(pw));
