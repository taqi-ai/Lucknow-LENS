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

try {
  await waitForServer();
  console.log(`Production server running on http://127.0.0.1:${PORT}`);

  // 2. Launch Puppeteer with Android mobile emulation
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

  const page = await browser.newPage();

  // Emulate mid-range Android phone (Samsung Galaxy A54 / Pixel 7a style)
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2.75, // typical high DPR on mobile
    isMobile: true,
    hasTouch: true,
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  );

  // Apply 4x CPU slowdown to simulate mid-range mobile processor
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  console.log('Loading Lucknow Lens with mobile emulation (DPR 2.75, 4x CPU throttle)...');
  await page.goto(`http://127.0.0.1:${PORT}/?benchmark`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 60000 });

  // Wait for __LENS to be mounted
  await page.waitForFunction(() => !!window.__LENS, { timeout: 30000 });

  // Allow initial tile loading to settle
  console.log('Waiting for initial tiles to settle...');
  await page.evaluate(() => window.__LENS?.waitSettled ? window.__LENS.waitSettled(10000) : null);
  await new Promise((r) => setTimeout(r, 2000));

  // Measure baseline idle stats
  console.log('Measuring idle stats for 3 seconds...');
  const idleStats = await page.evaluate(() => window.__LENS.measure(3000));
  console.log('Idle Baseline:', JSON.stringify(idleStats, null, 2));

  // Simulate active map rotation interaction (continuous touch drag across screen)
  console.log('Simulating 5 seconds of active continuous rotation/interaction...');
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
        curX += (frame % 2 === 0 ? -12 : -8);
        if (curX < rect.left + 50) curX = startX;

        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: curX,
          clientY: startY,
          pointerId: 1,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
        }));

        if (frame > 120) {
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

  // Measure performance DURING interaction
  const interactionStats = await page.evaluate(() => window.__LENS.measure(4000));
  await interactionPromise;
  console.log('Active Rotation Baseline:', JSON.stringify(interactionStats, null, 2));

  await browser.close();
} catch (err) {
  console.error('Benchmark failed:', err);
} finally {
  server.kill();
  process.exit(0);
}
