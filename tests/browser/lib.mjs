// Shared helpers for the scripted browser checks in this folder. See README.md for what they need.
import { pathToFileURL } from 'node:url';

// Playwright is NOT a project dependency. Either install `playwright-core` somewhere Node can find it, or
// point PLAYWRIGHT_CORE at an existing copy (the folder, or its index.mjs).
async function loadPlaywright() {
  const where = process.env.PLAYWRIGHT_CORE;
  try {
    if (where) return await import(pathToFileURL(where.endsWith('.mjs') || where.endsWith('.js') ? where : `${where.replace(/\/$/, '')}/index.mjs`).href);
    return await import('playwright-core');
  } catch (err) {
    console.error('These checks need the playwright-core package, which is not part of this project.\n'
      + 'Install it (for example `npm install --no-save playwright-core`) or set PLAYWRIGHT_CORE to an existing copy.\n'
      + 'See tests/browser/README.md.');
    throw err;
  }
}
const { chromium } = await loadPlaywright();

export const BASE = process.env.BASE_URL || 'http://localhost:8804/';
const ORIGIN = new URL(BASE).origin;
let failures = 0;
export const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : String(extra)); if (!ok) failures++; };
export const done = () => { console.log(failures ? `${failures} FAILED` : 'ALL PASSED'); return failures; };
// A fake camera and microphone, so recording and permission code can run without hardware.
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use an installed Chrome or Chromium instead of Playwright's own.
export const launch = () => chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

// Stand-ins: speech (a headless browser has none), and hooks that count microphone requests and object URLs.
export const INIT = () => {
  const synth = { getVoices() { return []; }, addEventListener() {}, cancel() {}, speak(u) { setTimeout(() => u.onend?.(new Event('end')), 150); } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechRecognition = window.webkitSpeechRecognition = undefined;
  window.__stats = { gum: 0, tracks: [], created: 0, revoked: 0, liveUrls: new Set(), constraints: [] };
  const realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    window.__stats.gum++; window.__stats.constraints.push(JSON.stringify(c));
    const stream = window.__gum ? await window.__gum(c, realGum) : await realGum(c);
    stream.getTracks().forEach((t) => window.__stats.tracks.push(t));
    return stream;
  };
  const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (b) => { const u = create(b); window.__stats.created++; window.__stats.liveUrls.add(u); return u; };
  URL.revokeObjectURL = (u) => { if (window.__stats.liveUrls.delete(u)) window.__stats.revoked++; revoke(u); };
  window.__downloads = [];
  document.addEventListener('click', (e) => { const a = e.target.closest?.('a[download]'); if (a) { window.__downloads.push(a.download); e.preventDefault(); } }, true);
};

export async function newPage(browser, { viewport = { width: 1200, height: 1000 }, init, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone', 'camera'], reducedMotion: reducedMotion || 'no-preference' });
  const p = await ctx.newPage();
  await p.addInitScript(INIT);
  for (const fn of [].concat(init || [])) await p.addInitScript(fn);
  p.errors = []; p.external = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(ORIGIN)) p.external.push(u); });
  await p.goto(BASE);
  return p;
}

// Load the demo set, tick it, and start a Practice session.
export async function startSession(p, { count = 3, difficulty = 'medium' } = {}) {
  await p.click('.tabs button[data-screen="questions"]');
  if (await p.locator('#demo-btn').isVisible()) await p.click('#demo-btn');
  await p.click('.tabs button[data-screen="practice"]');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.selectOption('#opt-order', 'serial'); await p.selectOption('#opt-difficulty', difficulty); await p.fill('#opt-count', String(count));
  await p.click('#start-btn');
  await answering(p);
}
export const answering = (p) => p.waitForSelector('#next-btn:not([disabled])', { timeout: 30000 });
export const attempts = (p) => p.evaluate(`(async () => { const s = await import('/src/recordstore.js'); return await s.listAttempts(); })()`);
export const stats = (p) => p.evaluate(() => ({ gum: window.__stats.gum, live: window.__stats.tracks.filter((t) => t.readyState === 'live').length, created: window.__stats.created, revoked: window.__stats.revoked, liveUrls: window.__stats.liveUrls.size }));
export const vis = (p, sel) => p.locator(sel).isVisible();
export const text = (p, sel) => p.locator(sel).innerText();
