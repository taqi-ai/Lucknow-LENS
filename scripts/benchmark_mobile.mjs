import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 4174;

// 1. Boot production server on port 4174
const server = spawn(process.execPath, ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
  stdio: 'ignore',
});

// Wait for server ready
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Server did not start in time');
}

const CONFIGURATIONS = [
  {
    id: 'A',
    name: 'Compact Android (360x800, DPR 2.0, CPU 4x)',
    width: 360,
    height: 800,
    dpr: 2.0,
    ua: 'Mozilla/5.0 (Linux; Android 12; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'B',
    name: 'Mid-Range Android (390x844, DPR 2.75, CPU 4x)',
    width: 390,
    height: 844,
    dpr: 2.75,
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'C',
    name: 'Flagship Large Android (412x915, DPR 3.0, CPU 4x)',
    width: 412,
    height: 915,
    dpr: 3.0,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  },
];

async function runBenchmarkForConfig(browser, config) {
  console.log(`\n======================================================`);
  console.log(`BENCHMARK CONFIGURATION ${config.id}: ${config.name}`);
  console.log(`======================================================`);

  const page = await browser.newPage();
  await page.setViewport({
    width: config.width,
    height: config.height,
    deviceScaleFactor: config.dpr,
    isMobile: true,
    hasTouch: true,
  });
  await page.setUserAgent(config.ua);

  // Apply 4x CPU throttle
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  console.log(`Navigating to http://127.0.0.1:${PORT}/?benchmark ...`);
  await page.goto(`http://127.0.0.1:${PORT}/?benchmark`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForFunction(() => !!window.__LENS, { timeout: 30000 });

  console.log('Waiting for initial tiles to settle...');
  await page.evaluate(() => window.__LENS?.waitSettled ? window.__LENS.waitSettled(10000) : null);
  await new Promise((r) => setTimeout(r, 1500));

  // Measure Idle
  console.log('Measuring Idle performance (3 seconds)...');
  const idle = await page.evaluate(() => window.__LENS.measure(3000));
  console.log('Idle Result:', JSON.stringify(idle, null, 2));

  // Simulate active rotation
  console.log('Simulating 5 seconds of continuous touch rotation...');
  const interactionPromise = page.evaluate(() => {
    return new Promise((resolve) => {
      const canvas = document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.7;
      const startY = rect.top + rect.height * 0.5;

      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: startX,
        clientY: startY,
        pointerId: 1,
        pointerType: 'touch',
        bubbles: true,
        cancelable: true,
      }));

      let curX = startX;
      let frame = 0;
      const moveInterval = setInterval(() => {
        frame++;
        curX += (frame % 2 === 0 ? -14 : -10);
        if (curX < rect.left + 50) curX = startX;

        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: curX,
          clientY: startY,
          pointerId: 1,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
        }));

        if (frame > 160) {
          clearInterval(moveInterval);
          window.dispatchEvent(new PointerEvent('pointerup', {
            clientX: curX,
            clientY: startY,
            pointerId: 1,
            pointerType: 'touch',
            bubbles: true,
          }));
          resolve(true);
        }
      }, 16);
    });
  });

  const active = await page.evaluate(() => window.__LENS.measure(3500));
  await interactionPromise;
  console.log('Active Rotation Result:', JSON.stringify(active, null, 2));

  await page.close();
  return { config, idle, active };
}

try {
  await waitForServer();
  console.log(`Production server running on http://127.0.0.1:${PORT}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--use-angle=d3d11',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--no-sandbox',
    ],
  });

  const allResults = [];
  for (const cfg of CONFIGURATIONS) {
    const res = await runBenchmarkForConfig(browser, cfg);
    allResults.push(res);
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log('PHASE 3 MOBILE RENDERING BENCHMARK RESULTS (BROWSER EMULATION 4X CPU)');
  console.log('========================================================================');
  for (const r of allResults) {
    console.log(`\n--- Config ${r.config.id}: ${r.config.name} ---`);
    console.log(`  IDLE:   Avg FPS: ${r.idle.fps} | 1% Low: ${r.idle.fps1PercentLow} | p50: ${r.idle.frameMsP50}ms | p95: ${r.idle.frameMsP95}ms | >33ms: ${r.idle.framesOver33ms} | DrawCalls: ${r.idle.drawCalls} | Triangles: ${r.idle.triangles} | Heap: ${r.idle.jsHeapMB}MB`);
    console.log(`  ACTIVE: Avg FPS: ${r.active.fps} | 1% Low: ${r.active.fps1PercentLow} | p50: ${r.active.frameMsP50}ms | p95: ${r.active.frameMsP95}ms | >33ms: ${r.active.framesOver33ms} | DrawCalls: ${r.active.drawCalls} | Triangles: ${r.active.triangles} | Heap: ${r.active.jsHeapMB}MB`);
  }
  console.log('========================================================================\n');

} catch (err) {
  console.error('Benchmark failed:', err);
} finally {
  server.kill();
  process.exit(0);
}
