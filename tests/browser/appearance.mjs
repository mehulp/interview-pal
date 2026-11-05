// Colour themes (UX redesign Step 2): every theme on every screen, persistence, bad preferences, blocked
// storage, keyboard, phone width, 200% zoom, contrast of what is really drawn, and no camera/microphone use.
// Screenshots go to SHOTS_DIR (default: a temporary folder), one montage per theme.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, newPage, ready, startAnswer, finish, next, check, done, vis, text, stats, AUDIT, overflow } from './lib.mjs';

const OUT = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), 'interviewpal-themes-'));
mkdirSync(OUT, { recursive: true });
const THEMES = [
  { id: 'sage', name: 'Sage & Forest', page: 'rgb(246, 247, 242)', accent: 'rgb(53, 99, 77)' },
  { id: 'teal', name: 'Warm Teal', page: 'rgb(245, 247, 247)', accent: 'rgb(23, 107, 112)' },
  { id: 'plum', name: 'Muted Plum', page: 'rgb(247, 245, 248)', accent: 'rgb(113, 81, 133)' },
  { id: 'blue', name: 'Classic Blue', page: 'rgb(246, 247, 251)', accent: 'rgb(59, 91, 219)' },
];
const b = await launch();

// ---- in-page helpers: AUDIT and overflow come from lib.mjs ----
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);
const settingsOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.settings') || '{}'));
const dataTheme = (p) => p.evaluate(() => document.documentElement.getAttribute('data-theme'));
const css = (p, sel, prop) => p.evaluate(([s, pr]) => getComputedStyle(document.querySelector(s))[pr], [sel, prop]);
const pickTheme = (p, id) => p.click(`.theme-card[data-theme-preview="${id}"]`);
const COACH_KEY = () => localStorage.setItem('interviewpal.apiKey', 'sk-ant-test-not-real');

/* ===== 1. Default and the picker ===== */
{
  const p = await newPage(b);
  check('no saved choice: the default theme is Sage & Forest', (await dataTheme(p)) === 'sage' && (await css(p, 'body', 'backgroundColor')) === THEMES[0].page);
  await tab(p, 'settings');
  const cards = await p.evaluate(() => [...document.querySelectorAll('.theme-card')].map((c) => ({ id: c.dataset.themePreview, name: c.querySelector('.theme-name').textContent, checked: c.querySelector('input').checked, type: c.querySelector('input').type, group: c.querySelector('input').name })));
  check('Settings shows four theme cards: native radios in one group, names shown', cards.length === 4 && cards.every((c) => c.type === 'radio' && c.group === 'theme') && cards.map((c) => c.name).join('|') === THEMES.map((t) => t.name).join('|'), JSON.stringify(cards));
  check('Sage & Forest is the one selected', cards.filter((c) => c.checked).map((c) => c.id).join() === 'sage');
  check('the fieldset has a legend', (await text(p, '.theme-picker legend')) === 'Colour theme');
  const sw = await p.evaluate(() => [...document.querySelectorAll('.theme-card')].map((c) => getComputedStyle(c.querySelector('.sw-accent')).backgroundColor));
  check('each card previews its own accent colour', sw.join('|') === THEMES.map((t) => t.accent).join('|'), sw.join('|'));
  check('the selected card says "Selected" in words; the others do not show it', await p.evaluate(() => [...document.querySelectorAll('.theme-card')].map((c) => getComputedStyle(c.querySelector('.theme-selected')).visibility).join()) === 'visible,hidden,hidden,hidden');
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 2. Choosing a theme: immediate, saved as one valid ID, nothing else touched, no media requests ===== */
{
  const p = await newPage(b);
  await p.evaluate(() => localStorage.setItem('interviewpal.settings', JSON.stringify({ mode: 'practice', practiceCount: 7, micDeviceId: 'mic-xyz', coachSpeak: false, onDeviceSpeech: true, voiceLang: 'en-GB', activeSetId: 'some-set' })));
  await p.reload(); await tab(p, 'settings');
  const before = await settingsOf(p);
  for (const [i, t] of THEMES.entries()) {
    await pickTheme(p, t.id);
    const after = await settingsOf(p);
    const { theme, ...rest } = after; const { theme: _old, ...restBefore } = before;
    check(`${t.name}: applies at once (page colour and data-theme)`, (await dataTheme(p)) === t.id && (await css(p, 'body', 'backgroundColor')) === t.page, `${await dataTheme(p)} ${await css(p, 'body', 'backgroundColor')}`);
    check(`${t.name}: saved as that one ID, every other setting untouched`, theme === t.id && JSON.stringify(rest) === JSON.stringify(restBefore), JSON.stringify(after));
    check(`${t.name}: the white header, subtle border and accent tab`, (await css(p, '.app-header', 'backgroundColor')) === 'rgb(255, 255, 255)' && (await css(p, '.app-header', 'borderBottomWidth')) === '1px' && (await css(p, '.tabs button[aria-pressed="true"]', 'color')) === t.accent, await css(p, '.tabs button[aria-pressed="true"]', 'color'));
    if (i > 0) check(`${t.name}: the status line says it is remembered`, (await text(p, '#theme-status')).includes(`${t.name} is on`)); // the first is already selected: choosing it again is not a change
  }
  const s = await stats(p);
  check('changing themes never asked for the camera or microphone', s.gum === 0, JSON.stringify(s));
  check('and made no network request', p.external.length === 0, p.external.join());
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 3. Reload: the saved theme is back, before any module runs (no flash) ===== */
{
  const p = await newPage(b);
  await tab(p, 'settings'); await pickTheme(p, 'plum');
  await p.route('**/src/ui.js', (route) => route.abort()); // the app never loads: only the head script can set the theme
  await p.reload();
  check('the head script alone restores the saved theme', (await dataTheme(p)) === 'plum' && (await css(p, 'body', 'backgroundColor')) === 'rgb(247, 245, 248)', `${await dataTheme(p)} ${await css(p, 'body', 'backgroundColor')}`);
  await p.unroute('**/src/ui.js');
  await p.reload(); await tab(p, 'settings');
  check('after a normal reload the matching card is selected', await p.evaluate(() => document.querySelector('.theme-card input:checked').value) === 'plum');
  await p.context().close();
}

/* ===== 4. Unknown, missing and damaged preferences ===== */
for (const [label, stored] of [
  ['an unknown theme name', JSON.stringify({ mode: 'practice', theme: 'dark' })],
  ['a wrong type', JSON.stringify({ theme: 7 })],
  ['an array', JSON.stringify({ theme: ['plum'] })],
  ['no theme key', JSON.stringify({ mode: 'coach' })],
  ['damaged settings text', '{not json'],
]) {
  const p = await newPage(b, { init: (() => { /* set below */ }) });
  await p.evaluate((v) => localStorage.setItem('interviewpal.settings', v), stored);
  await p.reload();
  check(`${label}: the app falls back to Sage & Forest and loads`, (await dataTheme(p)) === 'sage' && (await css(p, 'body', 'backgroundColor')) === THEMES[0].page && (await vis(p, '.tabs')), await dataTheme(p));
  await tab(p, 'settings');
  check(`${label}: the Sage & Forest card is the selected one`, await p.evaluate(() => document.querySelector('.theme-card input:checked').value) === 'sage');
  await pickTheme(p, 'teal');
  const saved = await settingsOf(p);
  check(`${label}: choosing a theme then stores one valid ID`, saved.theme === 'teal');
  check(`${label}: no page errors`, p.errors.length === 0, p.errors.join());
  await p.context().close();
}
{
  const p = await newPage(b);
  const stored = await p.evaluate(`(async () => { const s = await import('/src/storage.js'); s.saveSettings({ theme: 'evil', practiceCount: 3 }); return JSON.parse(localStorage.getItem('interviewpal.settings')); })()`);
  check('an invalid theme is never saved; the other setting still is', stored.theme === 'sage' && stored.practiceCount === 3, JSON.stringify(stored));
  await p.context().close();
}

/* ===== 5. Storage that will not store ===== */
{
  const p = await newPage(b, { init: () => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'interviewpal.settings') throw new DOMException('blocked', 'QuotaExceededError'); return set.call(this, k, v); };
  } });
  await tab(p, 'settings'); await pickTheme(p, 'blue');
  check('blocked storage: the theme still applies for this visit', (await dataTheme(p)) === 'blue' && (await css(p, 'body', 'backgroundColor')) === THEMES[3].page);
  check('and the screen says it will not be remembered', (await text(p, '#theme-status')).includes('not be remembered'), await text(p, '#theme-status'));
  await p.reload();
  check('after a reload it is the default, with no error', (await dataTheme(p)) === 'sage' && p.errors.length === 0, p.errors.join());
  await p.context().close();
}
{
  const p = await newPage(b, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); } });
  check('storage that throws on every access: the page still loads in the default theme', (await dataTheme(p)) === 'sage' && (await vis(p, '.tabs')));
  await p.context().close();
}

/* ===== 6. Keyboard ===== */
{
  const p = await newPage(b);
  await tab(p, 'settings');
  await p.focus('.theme-card input[value="sage"]');
  await p.keyboard.press('ArrowRight');
  check('the arrow key moves the choice to the next theme and applies it', (await dataTheme(p)) === 'teal' && (await settingsOf(p)).theme === 'teal');
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  check('arrows reach the last theme', (await dataTheme(p)) === 'blue');
  await p.keyboard.press('ArrowLeft');
  check('and go back', (await dataTheme(p)) === 'plum');
  const ring = await p.evaluate(() => { const c = document.querySelector('.theme-card:focus-within'); const cs = getComputedStyle(c); return { w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor }; });
  check('the focused card has a visible focus ring', ring.style === 'solid' && ring.w === '3px', JSON.stringify(ring));
  await p.keyboard.press('Tab');
  check('Tab leaves the group in one step (a normal radio group)', !(await p.evaluate(() => document.activeElement.matches('.theme-card input'))));
  // focus rings elsewhere use the theme's focus colour
  await tab(p, 'practice'); await p.focus('body'); await p.keyboard.press('Tab');
  const focus = await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { tag: e.tagName, w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, expected: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim() }; });
  check('a keyboard focus ring (3px, solid) is drawn on the first control', focus.style === 'solid' && focus.w === '3px', JSON.stringify(focus));
  await p.context().close();
}

/* ===== 7. Every screen, every theme: text contrast, no overflow, screenshots ===== */
async function walk(theme) {
  const p = await newPage(b, { init: [COACH_KEY] });
  const shots = {}; const problems = [];
  await p.route('https://api.anthropic.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ score: 7, covered: ['Clear outcomes', 'Check-ins'], missed: ['Recognition'], tip: 'Name one example.', spoken_feedback: 'Good.' }) }] }) }));
  const state = async (name) => {
    const a = await p.evaluate(AUDIT); const o = await p.evaluate(overflow);
    if (a.failures.length) problems.push(`${name}: ${a.failures.slice(0, 4).join(' | ')}`);
    if (o.sw > o.cw) problems.push(`${name}: sideways scroll ${o.sw} > ${o.cw}`);
    shots[name] = (await p.screenshot({ fullPage: true })).toString('base64');
    return a.checked;
  };
  await tab(p, 'settings'); await pickTheme(p, theme.id);
  check(`${theme.name}: the theme is on across the app after choosing it`, (await dataTheme(p)) === theme.id);
  let n = await state('settings');
  await tab(p, 'questions'); await p.click('#demo-btn'); n += await state('questions');
  await tab(p, 'practice');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.selectOption('#opt-order', 'serial'); await p.fill('#opt-count', '2'); await p.check('#fbk-self'); await p.check('#opt-show-answer');
  n += await state('setup');
  await p.click('#start-btn'); await ready(p);
  await p.check('#rec-mode-audio'); await startAnswer(p);
  await p.fill('#answer', 'I would agree the outcome, delegate the task and check in weekly.');
  n += await state('interview');                    // the reference answer is showing
  await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1500);
  const micBeforeReload = (await stats(p)).gum; // the one recording this test makes itself
  n += await state('recording');                    // recording in progress
  await p.click('#rec-stop'); await p.waitForSelector('#rec-dock:not([hidden])'); await p.waitForTimeout(500);
  n += await state('review');                       // the unsaved recording
  await p.click('#rec-discard');
  await finish(p);
  n += await state('marking');                      // the review with self-marking
  await p.click('[data-mark="partly"]'); await next(p); await ready(p); await startAnswer(p);
  await p.fill('#answer', 'Second answer.'); await finish(p); await p.click('[data-mark="got"]'); await next(p);
  await p.waitForSelector('#finished:not([hidden])'); await p.waitForTimeout(300);
  await p.click('.sum-questions summary');
  n += await state('summary');
  await tab(p, 'history');
  await p.evaluate(() => {   // sample sessions, so the Progress view has something to draw
    const key = 'interviewpal.history'; const list = JSON.parse(localStorage.getItem(key) || '[]'); const day = 86400000; const now = Date.now();
    const mk = (d, mode, marks, scores) => ({ id: `s${d}${mode}`, startedAt: now - d * day - 3600000, endedAt: now - d * day, durationSec: 600, completed: true, mode, difficulty: 'medium', order: 'serial', level: 'all', total: 5, sets: ['Demo'], results: ['Motivation', 'Delegation', 'Feedback', 'Conflict', 'Hiring'].map((t, i) => ({ question: `Sample ${i + 1}`, topic: t, level: '', set: 'Demo', answer: 'x', skipped: false, timedOut: false, seconds: 40, delivery: null, mark: marks ? marks[i] : '', score: scores ? scores[i] : null, covered: [], missed: [], tip: '', noAnswer: false, noReference: false, feedbackSkipped: false, incomplete: false, answerShown: false })) });
    localStorage.setItem(key, JSON.stringify([...list, mk(6, 'practice', ['missed', 'partly', 'partly', 'got', 'missed']), mk(4, 'coach', null, [4, 6, 5, 7, 3]), mk(2, 'coach', null, [6, 7, 8, 7, 5]), mk(1, 'practice', ['got', 'partly', 'got', 'got', 'missed'])].sort((a, b) => b.startedAt - a.startedAt)));
  });
  await p.reload(); await tab(p, 'history'); await p.waitForSelector('.history-row');
  check(`${theme.name}: the theme survives a reload on the History tab`, (await dataTheme(p)) === theme.id);
  n += await state('history');
  await p.click('.history-row'); n += await state('history-detail');
  await tab(p, 'practice');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.check('#fbk-coach'); await p.fill('#opt-count', '1');
  await p.click('#start-btn'); await ready(p); await startAnswer(p);
  await p.fill('#answer', 'I delegate with clear outcomes and weekly check-ins.'); await finish(p);
  await p.waitForSelector('#fb-result:not([hidden])');
  n += await state('feedback');
  check(`${theme.name}: the only microphone request was the recording the test made itself; showing every screen asked for no camera or microphone`, micBeforeReload === 1 && (await stats(p)).gum === 0, `${micBeforeReload} then ${JSON.stringify(await stats(p))}`);
  check(`${theme.name}: ${n} pieces of text on 11 screens and states are readable (4.5:1, or 3:1 for large text), and nothing scrolls sideways`, problems.length === 0, problems.join('\n   '));
  check(`${theme.name}: no page errors`, p.errors.length === 0, p.errors.join());
  await p.context().close();
  return shots;
}

const montages = [];
for (const theme of THEMES) montages.push([theme, await walk(theme)]);

// One picture per theme: the screens side by side
{
  const ctx = await b.newContext({ viewport: { width: 2000, height: 1200 } });
  const page = await ctx.newPage();
  for (const [theme, shots] of montages) {
    const names = ['settings', 'setup', 'interview', 'recording', 'review', 'marking', 'summary', 'feedback', 'questions', 'history'];
    const cells = names.map((n) => `<figure><figcaption>${n}</figcaption><img src="data:image/png;base64,${shots[n]}"></figure>`).join('');
    await page.setContent(`<style>body{margin:12px;font:14px system-ui;background:#888}div{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;align-items:start}figure{margin:0;background:#fff}figcaption{font-weight:700;padding:3px 6px;background:#222;color:#fff}img{width:100%;display:block}</style><h2 style="color:#fff;margin:0 0 8px">${theme.name}</h2><div>${cells}</div>`);
    await page.waitForTimeout(300);
    const file = join(OUT, `theme-${theme.id}.jpg`);
    writeFileSync(file, await page.screenshot({ fullPage: true, type: 'jpeg', quality: 72 }));
  }
  await ctx.close();
  console.log(`Montages written to ${OUT}`);
}

/* ===== 8. Phone width and 200% zoom (a 640px-wide window at double scale is what 200% zoom of a 1280px window looks like) ===== */
for (const [label, viewport, dsf] of [['phone (390px)', { width: 390, height: 800 }, 2], ['200% zoom (640px)', { width: 640, height: 450 }, 2]]) {
  for (const theme of THEMES) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: dsf, permissions: ['microphone', 'camera'] });
    const p = await ctx.newPage();
    await p.goto(process.env.BASE_URL || 'http://localhost:8804/');
    await p.evaluate((id) => localStorage.setItem('interviewpal.settings', JSON.stringify({ theme: id })), theme.id);
    await p.reload();
    const bad = [];
    for (const screen of ['practice', 'questions', 'history', 'settings']) {
      await tab(p, screen);
      const o = await p.evaluate(overflow); const a = await p.evaluate(AUDIT);
      if (o.sw > o.cw) bad.push(`${screen}: sideways scroll ${o.sw}>${o.cw}`);
      if (a.failures.length) bad.push(`${screen}: ${a.failures[0]}`);
    }
    const headerFits = await p.evaluate(() => { const t = document.querySelector('.tabs').getBoundingClientRect(); return t.right <= innerWidth + 1 && t.left >= -1; });
    check(`${theme.name} at ${label}: all four screens fit, text readable, tabs not clipped`, bad.length === 0 && headerFits, bad.join(' | ') + ` header:${headerFits}`);
    await ctx.close();
  }
}
await b.close();
process.exit(done() ? 1 : 0);
