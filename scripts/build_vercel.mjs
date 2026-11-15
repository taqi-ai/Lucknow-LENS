// Assembles .vercel/output (Build Output API v3) from dist/: the static site (minus map data the app
// never reads) and the Express API bundled into one serverless function.
// Usage: node scripts/build_vercel.mjs <public origin, e.g. https://terralyt.vercel.app>
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const origin = (process.argv[2] || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
if (!origin) throw new Error('pass the public origin as the first argument');
if (!existsSync('dist/index.html')) throw new Error('run npm run build first');

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/static', { recursive: true });
mkdirSync(out + '/functions/api.func', { recursive: true });

// 1. static site. These folders are in public/ but nothing in src/ reads them.
cpSync('dist', out + '/static', { recursive: true, filter: (p) => !/dist[\\/](lucknow_tiles|overture_tiles_test|server\.cjs)/.test(p) });
const html = readFileSync(out + '/static/index.html', 'utf8').split('%ORIGIN%').join(origin);
writeFileSync(out + '/static/index.html', html);

// 2. the API as one self-contained function
execSync(`npx esbuild server/vercel-entry.ts --bundle --platform=node --format=cjs --target=node20 --outfile=${out}/functions/api.func/index.js`, { stdio: 'inherit' });
writeFileSync(out + '/functions/api.func/.vc-config.json', JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', maxDuration: 30 }));

// 3. routing and cache headers
const immutable = { 'cache-control': 'public, max-age=604800, immutable' };
writeFileSync(out + '/config.json', JSON.stringify({
  version: 3,
  routes: [
    { src: '/api/(.*)', dest: '/api' },
    { src: '/(overture_tiles_full|overture)/(.*)', headers: immutable, continue: true },
    { src: '/hlod/s_(.*)', headers: immutable, continue: true },
    { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}));
console.log('Vercel output ready for', origin);
