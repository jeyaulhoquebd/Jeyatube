// Builds the static site into ./dist for Cloudflare Pages (or any static host).
//   Cloudflare Pages settings:  Build command = npm run build   ·   Output directory = dist
// Only public website files are copied — server code, scripts and secrets never reach the host.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const PUBLIC_DIRS = ['img', 'catalog'];
const PUBLIC_FILES = fs.readdirSync(root).filter(f => /\.(html|css)$/.test(f))
  .concat(['env.js', 'firebase-init.js', 'static-catalog.js', 'seed-data.js', 'data.js', 'index.js', 'watch.js', 'shorts.js', 'admin.js', 'channel.js',
    'channels.js', 'playlists.js', 'profile.js', 'group.js', 'developer.js', 'feedback.js', 'jask.js', '_headers']);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let files = 0, bytes = 0;

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) if (!f.startsWith('.')) copy(path.join(src, f), path.join(dst, f));
  } else { fs.copyFileSync(src, dst); files++; bytes += st.size; }
}

for (const f of new Set(PUBLIC_FILES)) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) { console.warn('missing (skipped):', f); continue; }
  copy(src, path.join(out, f));
}
for (const d of PUBLIC_DIRS) { const src = path.join(root, d); if (fs.existsSync(src)) copy(src, path.join(out, d)); }

// Tell the site it runs on a static host (no /api server): skips pointless /api probes
const envPath = path.join(out, 'env.js');
const envSrc = fs.readFileSync(envPath, 'utf8');
if (!/STATIC_HOST:\s*false/.test(envSrc)) throw new Error('env.js: STATIC_HOST flag not found');
fs.writeFileSync(envPath, envSrc.replace(/STATIC_HOST:\s*false/, 'STATIC_HOST: true'));

// Cloudflare Pages serves 404.html for unknown paths (instead of silently showing the home page)
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, '404.html'));

const hasCatalog = fs.existsSync(path.join(out, 'catalog', 'meta.json'));
console.log(`dist ready: ${files} files, ${(bytes / 1048576).toFixed(1)} MB${hasCatalog ? '' : '  ⚠ catalog/meta.json is missing — run the "Update video catalog" workflow'}`);
