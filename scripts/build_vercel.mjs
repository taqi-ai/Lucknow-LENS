// Builds Vercel output (Build Output API v3) in two parts so redeploys are fast:
//   node scripts/build_vercel.mjs data                      -> deploy-data/.vercel/output  (map data, ~700 MB, deploy rarely)
//   node scripts/build_vercel.mjs app <origin> <data origin> -> .vercel/output             (site + API, ~25 MB, deploy every time)
// The app proxies /overture_tiles_full, /overture and /hlod to the data project, so no code changes are needed.
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [mode, originArg, dataArg] = process.argv.slice(2);
if (!existsSync('dist/index.html')) throw new Error('run npm run build first');
const DATA_DIRS = ['overture_tiles_full', 'overture', 'hlod'];
const immutable = { 'cache-control': 'public, max-age=604800, immutable' };

if (mode === 'data') {
  const out = 'deploy-data/.vercel/output';
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out + '/static', { recursive: true });
  for (const d of DATA_DIRS) cpSync(`dist/${d}`, `${out}/static/${d}`, { recursive: true });
  writeFileSync(out + '/config.json', JSON.stringify({
    version: 3,
    routes: [{ src: '/(.*)', headers: { ...immutable, 'access-control-allow-origin': '*' }, continue: true }, { handle: 'filesystem' }],
  }));
  console.log('data output ready');
} else if (mode === 'app') {
  const origin = (originArg || '').replace(/\/+$/, '');
  const dataOrigin = (dataArg || '').replace(/\/+$/, '');
  if (!origin || !dataOrigin) throw new Error('usage: app <origin> <data origin>');
  const out = '.vercel/output';
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out + '/static', { recursive: true });
  mkdirSync(out + '/functions/api.func', { recursive: true });

  cpSync('dist', out + '/static', { recursive: true, filter: (p) => !/dist[\\/](lucknow_tiles|overture_tiles_test|server\.cjs|overture_tiles_full|overture|hlod)([\\/]|$)/.test(p) });
  writeFileSync(out + '/static/index.html', readFileSync(out + '/static/index.html', 'utf8').split('%ORIGIN%').join(origin));

  execSync(`npx esbuild server/vercel-entry.ts --bundle --platform=node --format=cjs --target=node20 --outfile=${out}/functions/api.func/index.js`, { stdio: 'inherit' });
  writeFileSync(out + '/functions/api.func/.vc-config.json', JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', maxDuration: 30 }));

  writeFileSync(out + '/config.json', JSON.stringify({
    version: 3,
    routes: [
      { src: '/api/(.*)', dest: '/api' },
      { src: '/(overture_tiles_full|overture|hlod)/(.*)', dest: `${dataOrigin}/$1/$2` },
      { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '/lucknow/(.*)', headers: { 'cache-control': 'public, max-age=604800' }, continue: true },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  }));
  console.log('app output ready for', origin);
} else throw new Error('mode must be data or app');
