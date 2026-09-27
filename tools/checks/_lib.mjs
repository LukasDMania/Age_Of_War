/**
 * Shared bits of the browser checks in tools/checks (2026-09-28). They drive
 * the dev server (`npm run dev`) through Playwright and the dev-only debug
 * handle (`window.__aow`, src/utils/debug.ts).
 *
 * Playwright: installed in the project, or PLAYWRIGHT_MODULE (path to its
 * index.mjs), or the copy the cloud sandbox ships. CHROMIUM_PATH picks a
 * browser. AOW_URL is the dev server (default http://localhost:5173).
 * Screenshots go to tools/checks/out/ (ignored by git).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright/index.mjs';

export const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright').catch(() =>
  import(SANDBOX_PLAYWRIGHT).catch(() => {
    console.error('Playwright not found: npm i -D playwright, or set PLAYWRIGHT_MODULE.');
    process.exit(1);
  }),
);

export const BASE = process.env.AOW_URL ?? 'http://localhost:5173';
export const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
/** Prints OK / FAIL for a check; the exit code is 1 if any failed. */
export function check(name, ok, extra = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
}

/** Opens the game with `query` (default: no AI, straight into a match) and waits for play. */
export async function openGame(query = '?ai=off', viewport = { width: 1280, height: 720 }) {
  const browser = await pw.chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport });
  await page.route('**/__playtest-log', (r) => r.fulfill({ status: 200, body: 'x' }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.goto(`${BASE}/${query}`);
  if (!query.includes('artlab')) {
    await page.waitForFunction(() => window.__aow && window.__aow.snapshot().phase === 'playing', null, { timeout: 60000 });
  }
  return { browser, page, errors };
}

/** Ends a check script: page errors count as a failure. */
export async function finish(browser, errors) {
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
}
