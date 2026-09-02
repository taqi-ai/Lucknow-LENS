// Minimal production smoke check: boot the built server, hit /api/health and
// /api/version, and fail the CI step if either does not respond correctly.
// There is no application test suite, so this is the floor: if this fails,
// the build is not deployable.
import { spawn } from 'node:child_process';

const PORT = 4173;
const child = spawn(process.execPath, ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
  stdio: 'inherit',
});

const timeout = setTimeout(() => {
  console.error('Smoke test timed out waiting for the server to respond.');
  child.kill();
  process.exit(1);
}, 20_000);

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return res.json();
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server never became healthy');
}

try {
  const health = await waitForHealth();
  if (health.status !== 'ok') throw new Error(`Unexpected health status: ${JSON.stringify(health)}`);

  const versionRes = await fetch(`http://localhost:${PORT}/api/version`);
  if (!versionRes.ok) throw new Error(`/api/version returned HTTP ${versionRes.status}`);

  const rootRes = await fetch(`http://localhost:${PORT}/`);
  if (!rootRes.ok) throw new Error(`/ returned HTTP ${rootRes.status}`);

  console.log('Smoke test passed:', JSON.stringify(health));
  clearTimeout(timeout);
  child.kill();
  process.exit(0);
} catch (err) {
  console.error('Smoke test failed:', err);
  clearTimeout(timeout);
  child.kill();
  process.exit(1);
}
