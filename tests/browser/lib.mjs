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
  // Setup keeps uncommon options in a More options disclosure. Most checks just need its controls, so open it
  // (setup.mjs sets window.__keepMoreClosed to test the real disclosure).
  document.addEventListener('DOMContentLoaded', () => { const d = document.getElementById('more-options'); if (d && !window.__keepMoreClosed) d.open = true; });
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
  await p.setChecked('#opt-show-answer', false); await p.check('#fbk-none'); // a new installation starts on Guided rehearsal: say what these checks want
  await p.click('#start-btn');
  await ready(p); // the first question has been asked; Start answer has not been pressed
}
// The question has been asked and Start answer is ready (the "Ready" phase).
export const ready = (p) => p.waitForSelector('#primary-btn[data-kind="start"]:not([disabled])', { timeout: 30000 });
// Press Start answer and wait until the answer is under way.
export async function startAnswer(p) { await ready(p); await p.click('#primary-btn'); await p.waitForSelector('#primary-btn[data-kind="finish"]', { timeout: 10000 }); }
// Ready -> Start answer (the "answering" state every older check meant by `answering`)
export const answering = startAnswer;
// Press Finish answer and wait for the review to open.
export async function finish(p) { await p.click('#primary-btn'); await p.waitForSelector('#review:not([hidden])', { timeout: 15000 }); }
// Press Next question / Finish session (from the review).
export async function next(p) { await p.waitForSelector('#primary-btn[data-kind="next"]:not([disabled])', { timeout: 15000 }); await p.click('#primary-btn'); }
// Answer a question completely by typing, then move on. Returns after the next question is ready (or the summary shows).
export async function typeAndNext(p, words = 'I would listen first, then act.') {
  await startAnswer(p); await p.fill('#answer', words); await finish(p); await next(p);
}
export const attempts = (p) => p.evaluate(`(async () => { const s = await import('/src/recordstore.js'); return await s.listAttempts(); })()`);
export const stats = (p) => p.evaluate(() => ({ gum: window.__stats.gum, live: window.__stats.tracks.filter((t) => t.readyState === 'live').length, created: window.__stats.created, revoked: window.__stats.revoked, liveUrls: window.__stats.liveUrls.size }));
export const vis = (p, sel) => p.locator(sel).isVisible();
export const text = (p, sel) => p.locator(sel).innerText();

// Every visible piece of text on screen: is it readable against what is really behind it? (runs inside the page)
export const AUDIT = () => {
  const rgba = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
    const s = c.match(/color\(srgb ([^)]+)\)/); if (s) { const p = s[1].split(/[\s/]+/).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 }; }
    return null;
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const backdrop = (el) => { // what is behind the text: walk up, blending translucent layers
    const chain = [];
    for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { chain.push(c); if (c.a > 0.99) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of chain.reverse()) base = over(layer, base);
    return base;
  };
  const skip = (el) => {
    if (el.closest('.stage, .video-face, .photo-face, video, audio, option, [hidden]')) return true;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 1) return true;
      if (n.matches?.('button:disabled, input:disabled, select:disabled, fieldset:disabled, label:has(input:disabled)')) return true;
    }
    return false;
  };
  const failures = [];
  let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const words = node.textContent.trim();
    const el = node.parentElement;
    if (!words || !el || ['SCRIPT', 'STYLE', 'TITLE'].includes(el.tagName) || skip(el) || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    const fgRaw = el instanceof SVGElement ? cs.fill : cs.color;
    const fg = rgba(fgRaw); if (!fg) continue;
    const bg = backdrop(el);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const r = ratio(over(fg, bg), bg);
    checked++;
    if (r < need) failures.push(`${r.toFixed(2)} < ${need}: "${words.slice(0, 40)}" (${el.tagName.toLowerCase()}.${el.className?.baseVal ?? el.className}) ${fgRaw} on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`);
  }
  return { checked, failures };
};
export const overflow = () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth });
