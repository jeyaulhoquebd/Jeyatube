// Syntax-checks every JavaScript file in the project (used by `npm run lint`).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  ...fs.readdirSync(root).filter(f => f.endsWith('.js')),
  ...fs.readdirSync(path.join(root, 'lib')).filter(f => f.endsWith('.js')).map(f => path.join('lib', f)),
  ...fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).map(f => path.join('scripts', f))
];
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); }
  catch (e) { failed++; console.error(`✗ ${f}\n${e.stderr.toString()}`); }
}
console.log(failed ? `${failed} file(s) failed` : `✓ ${files.length} files OK`);
process.exit(failed ? 1 : 0);
