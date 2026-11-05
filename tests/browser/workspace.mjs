// The interview workspace and recording review (UX redesign Step 3): layout at several sizes, the reference and
// response panels, what counts as "viewed", self-marking and Coach feedback, recording in progress and pending,
// one camera picture and one set of players, the header indicator, the full-width summary, and reachability on
// small screens. Screenshots go to SHOTS_DIR (default: a temporary folder).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, newPage, ready, startAnswer, finish, next, check, done, vis, text, stats, AUDIT, overflow } from './lib.mjs';

const OUT = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), 'interviewpal-workspace-'));
mkdirSync(OUT, { recursive: true });
const shot = async (p, name, opts = {}) => writeFileSync(join(OUT, `${name}.png`), await p.screenshot(opts));
const b = await launch();

const LONG_Q = 'You have joined a team that has missed three releases in a row, two of your strongest engineers are talking about leaving, the product manager and the tech lead no longer agree on priorities, and your own manager wants a plan within a week. How do you decide what to do first, who you talk to, and how you will know it is working?';
const LONG_A = Array.from({ length: 9 }, (_, i) => `Point ${i + 1}: I would start by listening to each person separately, write down what I heard, and check it against the facts before deciding anything. Then I would agree one small, visible goal for the next two weeks with the team, name an owner for each part, and check in briefly every day so problems surface early instead of at the end.`).join('\n\n');
const SETS = { sets: [{ id: 'ws1', name: 'Workspace set', questions: [
  { id: 'q1', question: LONG_Q, answer: LONG_A, topic: 'Leadership', level: '' },
  { id: 'q2', question: 'How do you give feedback?', answer: 'Early, specific and kind, and I ask for their view.', topic: 'Feedback', level: '' },
  { id: 'q3', question: 'Tell me about a mistake.', answer: '', topic: 'Reflection', level: '' },
] }] };
// A normal-length set, for the pictures
const SHORT = { sets: [{ id: 'ws1', name: 'Workspace set', questions: [
  { id: 's1', question: 'Why did you move into engineering management?', answer: 'I enjoyed seeing a whole team succeed more than my own output. I started by mentoring and running projects, saw that I could have more impact by helping others do their best work, and I took on management with support and training. I still stay close enough to the technical work to make good decisions.', topic: 'Motivation', level: 'easy' },
  { id: 's2', question: 'How do you run an effective one-to-one?', answer: 'It is the report\'s meeting, not mine: they bring the agenda, and we cover how they are, their work, their growth and feedback in both directions.', topic: 'People', level: '' },
] }] };
const history = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.history') || '[]'));
const settings = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.settings') || '{}'));
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);
const box = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const COACH_KEY = () => localStorage.setItem('interviewpal.apiKey', 'sk-ant-test-not-real');

async function begin(p, { count = 2, showAnswer = false, selfMark = false, coach = false, selfView = false, difficulty = 'medium', sets = SETS } = {}) {
  await p.evaluate((s) => { localStorage.setItem('interviewpal.sets', JSON.stringify(s)); }, sets);
  await p.reload();
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Workspace set'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.evaluate(() => { const d = document.getElementById('more-options'); if (d) d.open = true; }); // contexts made without newPage() do not open it for us
  await p.selectOption('#opt-order', 'serial'); await p.selectOption('#opt-difficulty', difficulty); await p.fill('#opt-count', String(count));
  await p.setChecked('#opt-show-answer', showAnswer); // (a new installation starts on Guided: say what we want)
  await p.check(coach ? '#fbk-coach' : selfMark ? '#fbk-self' : '#fbk-none');
  if (selfView) await p.check('#opt-selfview');
  await p.click('#start-btn'); await ready(p); // asked, and waiting for Start answer
}
// Give a typed answer to the question on screen and open its review
const answerQ = async (p, words) => { await startAnswer(p); await p.fill('#answer', words); await finish(p); };
const DESKTOP = { width: 1366, height: 800 };
const MOBILE = { width: 390, height: 800 };

/* ===== 1. Desktop layout ===== */
{
  const p = await newPage(b, { viewport: DESKTOP });
  const setupBox = await box(p, '#setup');
  await begin(p, { showAnswer: true });
  const main = await box(p, '#screen-practice');
  const col = await box(p, '.interviewer-col'); const ws = await box(p, '.workspace'); const stage = await box(p, '.stage');
  const q = await box(p, '#question-text'); const ref = await box(p, '#model-answer'); const resp = await box(p, '#answer');
  check('the live interview uses a wider container (up to about 1280px)', main.w > 1200 && main.w <= 1280, main.w);
  check('two columns: portrait on the left, answer workspace on the right', col.x < ws.x && col.r <= ws.x + 1 && Math.abs(col.y - ws.y) < 40, JSON.stringify({ col, ws }));
  check('the interviewer column is roughly 340–440px (about 35–40%) and the portrait is substantial', col.w >= 340 && col.w <= 441 && stage.w >= 330, JSON.stringify({ col: col.w, stage: stage.w }));
  check('the question is a prominent heading at the top of the workspace', q.y < ws.y + 140 && (await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('question-text')).fontSize))) >= 22 && (await p.evaluate(() => document.getElementById('question-text').tagName)) === 'H2');
  check('progress and the countdown are in view above the question', (await vis(p, '#progress')) && (await vis(p, '#timer')) && (await box(p, '#progress')).y < q.y);
  check('the reference sits beside the portrait near the top, not below both columns', ref.x >= col.r && ref.y < 400 && ref.y < col.b, JSON.stringify({ ref, col }));
  check('with room, Reference answer and Your response are both on screen (stacked, no tabs)', !(await vis(p, '#reply-tabs')) && (await vis(p, '#model-answer')) && (await vis(p, '#answer')) && resp.y > ref.b - 1);
  check('both panels are labelled', (await text(p, '#model-answer .panel-title')) === 'Reference answer' && (await text(p, '#response-title')) === 'Your response');
  check('setup keeps its own, narrower width', setupBox.w <= 900, setupBox.w);
  const quiet = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('voice-note')).fontSize));
  check('voice and device notes are quiet supporting text', quiet <= 14.5, quiet);
  check('the Self-view button is with the portrait, End session is apart from the routine buttons',
    (await box(p, '#selfview-btn')).x < col.r && (await box(p, '#end-btn')).y > (await box(p, '#primary-btn')).b + 40 && (await p.evaluate(() => !!document.querySelector('.session-end #end-btn'))));
  check('one main button (Start answer); Listen again, Repeat, Skip and Show/Hide are quieter secondary buttons', await p.evaluate(() => document.querySelector('.primary-actions #primary-btn').classList.contains('big') && [...document.querySelectorAll('.primary-actions button:not(#primary-btn), .secondary-actions button')].every((x) => x.classList.contains('small'))));
  check('the other screens keep their width', await (async () => { const w = []; for (const s of ['questions', 'history', 'settings']) { await tab(p, s); w.push((await box(p, `#screen-${s}`)).w); } return w.every((x) => x <= 900); })());
  await p.context().close();
}

/* ===== 1b. The picture: a live interview with the reference showing ===== */
{
  const p = await newPage(b, { viewport: DESKTOP });
  await begin(p, { showAnswer: true, sets: SHORT });
  await p.fill('#answer', 'I would agree one visible goal with the team and check in every day.');
  await shot(p, 'desktop-live-reference');
  await p.context().close();
}

/* ===== 2. A roomy window: wide screen, and the portrait stays in view ===== */
{
  const p = await newPage(b, { viewport: { width: 1920, height: 1000 } });
  await begin(p, { showAnswer: true });
  check('on a wide screen the interview stops at about 1280px, centred', (await box(p, '#screen-practice')).w <= 1280 && (await box(p, '#screen-practice')).x > 100);
  const refText = await p.evaluate(() => { const e = document.getElementById('model-answer-text'); const cs = getComputedStyle(e); return { size: parseFloat(cs.fontSize), line: parseFloat(cs.lineHeight), over: e.scrollHeight > e.clientHeight, ch: e.clientHeight, vh: innerHeight, tabindex: e.getAttribute('tabindex'), role: e.getAttribute('role'), name: e.getAttribute('aria-label'), overflowY: cs.overflowY }; });
  check('reference text is about 18px with comfortable line spacing', refText.size >= 17.5 && refText.line / refText.size >= 1.5, JSON.stringify(refText));
  check('a long reference scrolls inside its own panel on a roomy desktop', refText.over && refText.overflowY === 'auto' && refText.ch <= refText.vh * 0.46, JSON.stringify(refText));
  check('that panel is a named region reachable by keyboard', refText.tabindex === '0' && refText.role === 'region' && refText.name === 'Reference answer text');
  await p.focus('#model-answer-text'); const before = await p.evaluate(() => document.getElementById('model-answer-text').scrollTop); await p.keyboard.press('PageDown'); await p.waitForTimeout(500);
  check('keyboard scrolls it (focus, then Page Down)', (await p.evaluate(() => document.getElementById('model-answer-text').scrollTop)) > before);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  check('when the page is scrolled, the portrait stays in view beside the workspace', await p.evaluate(() => { const r = document.querySelector('.interviewer-col').getBoundingClientRect(); return r.top >= -1 && r.top < 100; }) || (await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight)));
  await p.context().close();
}

/* ===== 3. Short laptop window ===== */
{
  const p = await newPage(b, { viewport: { width: 1280, height: 560 } });
  await begin(p, { showAnswer: true });
  const refText = await p.evaluate(() => { const e = document.getElementById('model-answer-text'); return { capped: getComputedStyle(e).maxHeight, over: e.scrollHeight > e.clientHeight }; });
  check('short screen: still two columns, the reference is not clipped (the page scrolls instead)', refText.capped === 'none' && !refText.over && (await box(p, '.interviewer-col')).x < (await box(p, '.workspace')).x, JSON.stringify(refText));
  await p.locator('#end-btn').scrollIntoViewIfNeeded();
  check('End session and Next are reachable by scrolling', (await vis(p, '#end-btn')) && (await p.locator('#primary-btn').isEnabled()));
  const o = await p.evaluate(overflow);
  check('no sideways scroll', o.sw <= o.cw, JSON.stringify(o));
  await p.context().close();
}

/* ===== 4. Narrow screens: stacked, with tabs ===== */
{
  const p = await newPage(b, { viewport: MOBILE });
  await begin(p, { showAnswer: true });
  const col = await box(p, '.interviewer-col'); const ws = await box(p, '.workspace'); const q = await box(p, '#question-text'); const stage = await box(p, '.stage');
  check('stacked: a compact portrait, then the question, then the answer', col.y < ws.y && stage.w <= 301 && q.y > col.y && (await box(p, '#answer-area')).y > q.y, JSON.stringify({ col, stage }));
  const o = await p.evaluate(overflow);
  check('no sideways scroll at 390px', o.sw <= o.cw, JSON.stringify(o));
  check('tabs appear instead of two stacked panels', (await vis(p, '#reply-tabs')) && (await vis(p, '#model-answer')) && !(await vis(p, '#answer')));
  check('Reference answer is the selected tab first', (await p.getAttribute('#tab-reference', 'aria-selected')) === 'true' && (await p.getAttribute('#tab-reference', 'tabindex')) === '0' && (await p.getAttribute('#tab-response', 'tabindex')) === '-1');
  check('tabs and panels are connected for assistive technology', await p.evaluate(() => document.getElementById('tab-reference').getAttribute('aria-controls') === 'model-answer' && document.getElementById('model-answer').getAttribute('role') === 'tabpanel' && document.getElementById('model-answer').getAttribute('aria-labelledby') === 'tab-reference' && document.getElementById('tab-response').getAttribute('aria-controls') === 'response-panel'));
  await p.click('#tab-response');
  check('Your response tab shows the box and hides the reference', (await vis(p, '#answer')) && !(await vis(p, '#model-answer')));
  check('choosing a tab does not move focus into the box', (await p.evaluate(() => document.activeElement.id)) === 'tab-response');
  await p.fill('#answer', 'My draft answer, typed before I look at the reference.');
  await p.click('#tab-reference');
  check('the word count is on the tab while the reference is open', (await text(p, '#tab-response')).includes('10 words'), await text(p, '#tab-response'));
  await p.click('#tab-response');
  check('switching tabs back and forth keeps the draft exactly', (await p.inputValue('#answer')) === 'My draft answer, typed before I look at the reference.');
  await p.focus('#tab-response'); await p.keyboard.press('ArrowLeft');
  check('arrow keys move between the tabs (and focus follows)', (await p.getAttribute('#tab-reference', 'aria-selected')) === 'true' && (await p.evaluate(() => document.activeElement.id)) === 'tab-reference');
  await p.keyboard.press('End');
  check('End selects the last tab, Home the first', (await p.getAttribute('#tab-response', 'aria-selected')) === 'true');
  await p.keyboard.press('Home');
  check('Home goes back to the reference', (await p.getAttribute('#tab-reference', 'aria-selected')) === 'true');
  // the draft survives the window being resized across the breakpoint
  await p.setViewportSize({ width: 1366, height: 800 }); await p.waitForTimeout(300);
  check('growing the window shows both panels, the draft intact', !(await vis(p, '#reply-tabs')) && (await p.inputValue('#answer')).startsWith('My draft') && (await vis(p, '#answer')) && (await vis(p, '#model-answer')));
  await p.setViewportSize(MOBILE); await p.waitForTimeout(300);
  check('shrinking it again brings the tabs back, the draft intact', (await vis(p, '#reply-tabs')) && (await p.inputValue('#answer')).startsWith('My draft'));
  // nothing is fixed to the screen, so nothing can sit on top of the answer box when the keyboard is up
  const fixed = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position) && e.getClientRects().length).map((e) => e.className || e.id));
  check('no bars are fixed or sticky on a phone (actions stay reachable with the keyboard open)', fixed.length === 0, fixed.join());
  await p.setViewportSize({ width: 390, height: 380 }); // roughly what is left with the software keyboard open
  await p.click('#tab-response'); await p.focus('#answer');
  await p.locator('#primary-btn').scrollIntoViewIfNeeded();
  const nb = await box(p, '#primary-btn');
  check('with the keyboard open, Start answer and the answer box can still be reached by scrolling', nb.y >= 0 && nb.b <= 380 + 1 && (await p.locator('#primary-btn').isEnabled()), JSON.stringify(nb));
  await p.context().close();
}

/* ===== 5. Zoom: a 640px window at double scale is what 200% zoom of a 1280px window looks like (device-scale emulation, not real zoom) ===== */
{
  const ctx = await b.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  await p.goto(process.env.BASE_URL || 'http://localhost:8804/');
  await begin(p, { showAnswer: true });
  const o = await p.evaluate(overflow);
  check('at 640px (200%-zoom layout) nothing scrolls sideways and the long question wraps', o.sw <= o.cw && (await box(p, '#question-text')).r <= 640, JSON.stringify(o));
  const a = await p.evaluate(AUDIT);
  check(`text stays readable (${a.checked} pieces checked)`, a.failures.length === 0, a.failures.slice(0, 3).join(' | '));
  const clipped = await p.evaluate(() => [...document.querySelectorAll('.workspace, .workspace-body, .interviewer-col, .avatar-panel, #answer-area, #model-answer')].filter((e) => e.scrollHeight > e.clientHeight + 2 && getComputedStyle(e).overflowY !== 'visible').map((e) => e.id || e.className));
  check('no container clips its content at that size', clipped.length === 0, clipped.join());
  await p.locator('#end-btn').scrollIntoViewIfNeeded();
  check('End session is reachable', await vis(p, '#end-btn'));
  await ctx.close();
}

/* ===== 6. Reference shown or hidden, and what History says ===== */
async function answerShownAfter(label, steps, viewport = DESKTOP) {
  const p = await newPage(b, { viewport });
  await steps(p);
  await p.waitForSelector('#finished:not([hidden])');
  const h = (await history(p))[0];
  const note = (await text(p, '#finished-body')).includes('model answer was visible');
  await p.context().close();
  return { flags: h.results.map((r) => r.answerShown), session: h.answersVisible, note };
}
{
  const finishTwo = async (p) => { await answerQ(p, 'one'); await next(p); await ready(p); await answerQ(p, 'two'); await next(p); };
  let r = await answerShownAfter('off', async (p) => { await begin(p); check('with the reference off: no panels, no tabs, the response box only', !(await vis(p, '#model-answer')) && !(await vis(p, '#reply-tabs')) && (await vis(p, '#answer'))); await finishTwo(p); });
  check('never shown: History says no, in the data and on the summary', r.flags.join() === 'false,false' && r.session === false && r.note === false, JSON.stringify(r));
  r = await answerShownAfter('on', async (p) => { await begin(p, { showAnswer: true }); await finishTwo(p); });
  check('reference on from the start: shown for both questions, and History says so', r.flags.join() === 'true,true' && r.session === true && r.note === true, JSON.stringify(r));
  r = await answerShownAfter('button', async (p) => {
    await begin(p, { count: 3 });
    check('the Show answer button still toggles it, and its labels are unchanged', (await text(p, '#answer-toggle')) === 'Show answer');
    await p.click('#answer-toggle');
    check('(after the click) it says Hide answer, the panel is up, and the saved setting is untouched', (await text(p, '#answer-toggle')) === 'Hide answer' && (await vis(p, '#model-answer')) && (await settings(p)).showModelAnswer === false);
    await answerQ(p, 'one'); await next(p); await ready(p);
    check('the choice carries on: question 2 opens with the reference still showing', await vis(p, '#model-answer'));
    await p.click('#answer-toggle'); // hidden during question 2
    await answerQ(p, 'two'); await next(p); await ready(p);
    check('hiding it keeps it hidden on the next question', !(await vis(p, '#model-answer')));
    await answerQ(p, 'three'); await next(p);
  });
  check('shown for questions 1 and 2 (it was on screen when they opened), never for question 3', r.flags.join() === 'true,true,false' && r.session === true, JSON.stringify(r));
  r = await answerShownAfter('self-mark', async (p) => {
    await begin(p, { selfMark: true });
    await answerQ(p, 'one');
    check('self-marking: the question stays on screen above the reference and the buttons', (await vis(p, '#question-text')) && (await vis(p, '#reference')) && (await p.locator('#review [data-mark]').count()) === 3);
    await p.click('[data-mark="got"]'); await next(p); await ready(p); await answerQ(p, 'two'); await p.click('[data-mark="partly"]'); await next(p);
  });
  check('seeing the reference only while self-marking does NOT count as having seen it while answering', r.flags.join() === 'false,false' && r.session === false && r.note === false, JSON.stringify(r));
  // narrow screen: shown in its tab counts; a draft survives
  r = await answerShownAfter('mobile', async (p) => { await begin(p, { showAnswer: true }); await p.click('#tab-response'); await finishTwo(p); }, MOBILE);
  check('narrow screen: question 1 showed the reference first (so it counts even after switching tabs); question 2 stayed on the response tab, so the reference was available but never displayed: not counted', r.flags.join() === 'true,false' && r.session === true, JSON.stringify(r));
}

/* ===== 7. Long question, self-marking and Coach feedback keep the question on screen ===== */
{
  const p = await newPage(b, { viewport: DESKTOP, init: [COACH_KEY] });
  await p.route('https://api.anthropic.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ score: 7, covered: ['Clear first step'], missed: ['Recognition'], tip: 'Name one example.', spoken_feedback: 'Good.' }) }] }) }));
  await begin(p, { coach: true, count: 1, showAnswer: true });
  const qh = await box(p, '#question-text');
  check('a very long question wraps inside the workspace without overflow', qh.r <= (await box(p, '.workspace')).r && qh.h > 60 && (await p.evaluate(overflow)).sw <= 1366);
  await answerQ(p, 'I would listen first and agree one visible goal.');
  await p.waitForSelector('#fb-result:not([hidden])');
  check('Coach feedback: the question stays on screen above it', (await vis(p, '#question-text')) && (await text(p, '#question-text')).startsWith('You have joined'));
  check('Coach feedback: the single End session button is still reachable', await vis(p, '#end-btn'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 8. Recording: in progress, pending audio and video, an earlier question's recording ===== */
{
  const p = await newPage(b, { viewport: DESKTOP });
  await begin(p, { count: 3, selfView: true });
  await p.waitForFunction(() => document.getElementById('self-view').srcObject !== null);
  const dupes = await p.evaluate(() => { const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; }); return Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k); });
  check('no id is used twice in the page', dupes.length === 0, dupes.join());
  // video recording, with self-view on
  await p.check('#rec-mode-video'); await startAnswer(p);
  await p.waitForSelector('#rec-preview-box:not([hidden])'); await p.waitForFunction(() => document.getElementById('rec-preview').videoWidth > 0);
  const live = await p.evaluate(() => {
    const shown = [...document.querySelectorAll('video')].filter((v) => v.srcObject && v.getClientRects().length && getComputedStyle(v).display !== 'none' && getComputedStyle(v).visibility !== 'hidden');
    const pv = document.getElementById('rec-preview'); const sv = document.getElementById('self-view');
    return { shown: shown.map((v) => v.id), previewTracks: pv.srcObject.getTracks().map((t) => t.kind).sort().join(), selfViewDisplay: getComputedStyle(sv).display, sameStream: pv.srcObject === sv.srcObject, selfTrackLive: sv.srcObject.getVideoTracks()[0].readyState, pvTrackId: pv.srcObject.getVideoTracks()[0].id, svTrackId: sv.srcObject.getVideoTracks()[0].id };
  });
  check('one live camera picture at a time: only the recording preview shows', live.shown.join() === 'rec-preview', JSON.stringify(live));
  check('the preview is the stream being recorded (camera and microphone), a copy of self-view\'s track, not self-view\'s own stream', live.previewTracks === 'audio,video' && !live.sameStream && live.pvTrackId !== live.svTrackId, JSON.stringify(live));
  check('self-view is hidden meanwhile but its camera is still on and its button state unchanged', live.selfViewDisplay === 'none' && live.selfTrackLive === 'live' && (await p.getAttribute('#selfview-btn', 'aria-pressed')) === 'true');
  check('an explicit "Recording video" line is shown', (await text(p, '#rec-live-text')).includes('Recording video'));
  await shot(p, 'desktop-video-recording');
  await p.click('#rec-preview-toggle');
  check('Hide preview hides only the picture; the Recording video line stays, and self-view stays hidden', !(await vis(p, '#rec-preview-box')) && (await vis(p, '#rec-live')) && (await text(p, '#rec-live-text')).includes('Recording video') && (await p.evaluate(() => getComputedStyle(document.getElementById('self-view')).display)) === 'none' && (await text(p, '#rec-preview-toggle')) === 'Show preview');
  await p.click('#rec-preview-toggle');
  check('Show preview brings the same picture back', await vis(p, '#rec-preview-box'));
  await p.waitForTimeout(1200);
  await p.click('#rec-stop'); await p.waitForSelector('#rec-dock:not([hidden])');
  const after = await p.evaluate(() => ({ dockIn: document.getElementById('rec-dock').parentElement.id, selfShown: getComputedStyle(document.getElementById('self-view')).display, selfLive: document.getElementById('self-view').srcObject?.getVideoTracks()[0].readyState, tracks: window.__stats.tracks.map((t) => t.readyState) }));
  check('the review panel is inside the answer workspace', after.dockIn === 'rec-review-slot');
  check('after stopping: the recording\'s own tracks are released; self-view\'s camera is still live and its picture is back', after.selfShown !== 'none' && after.selfLive === 'live' && after.tracks.filter((s) => s === 'live').length === 1, JSON.stringify(after));
  check('no live preview or Recording line remains', !(await vis(p, '#rec-preview-box')) && !(await vis(p, '#rec-live')));
  check('the video review has Download and Discard, no Save, and one video player', (await vis(p, '#rec-download')) && !(await vis(p, '#rec-save')) && (await p.locator('#rec-video-player').count()) === 1 && (await p.locator('audio#rec-audio').count()) === 1);
  check('the review does not hide the controls: Finish answer and the question are still there', (await vis(p, '#primary-btn')) && (await vis(p, '#question-text')));
  // an earlier question's pending recording, shown while on the next question
  p.once('dialog', (d) => d.accept()); // an undownloaded video asks before it is discarded
  await p.click('#rec-discard');
  await p.waitForTimeout(300);
  await p.fill('#answer', 'video answer'); await finish(p); await next(p); await ready(p);
  await p.check('#rec-mode-audio'); // the second question is recorded as audio
  await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1500);
  const q1 = (await text(p, '#question-text')).trim();
  await p.fill('#answer', 'first answer'); await finish(p);
  await p.waitForSelector('#rec-dock:not([hidden])'); await next(p); await ready(p);
  check('on the next question the review is labelled as an earlier question, with that question\'s words', (await text(p, '#rec-dock h2')).includes('earlier question') && (await text(p, '#rec-dock-question')).includes(q1.slice(0, 60)) && (await text(p, '#rec-dock-meta')).includes('not the question on screen now'), await text(p, '#rec-dock h2'));
  check('it is not displayed as belonging to the current question, and there is no Retry', !(await text(p, '#rec-dock-question')).includes((await text(p, '#question-text')).trim().slice(0, 25)) && !(await vis(p, '#rec-retry')));
  check('it stays reachable, with Save audio and Discard', (await vis(p, '#rec-save')) && (await vis(p, '#rec-discard')));
  await p.click('#rec-save'); await p.waitForFunction(() => document.getElementById('rec-dock-status').textContent.startsWith('Saved'));
  const saved = await p.evaluate(`(async () => (await (await import('/src/recordstore.js')).listAttempts()).map((a) => a.questionText.slice(0, 40)))()`);
  check('saving it files it under the ORIGINAL question', saved.length === 1 && saved[0] === q1.slice(0, 40), JSON.stringify(saved));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 9. Pending audio while self-marking; a recording that finishes in the background ===== */
{
  const p = await newPage(b, { viewport: DESKTOP, init: [() => { const real = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => real(fn, ms === 600000 ? 3500 : ms, ...a); }] });
  await begin(p, { selfMark: true, showAnswer: true });
  await p.check('#rec-mode-audio'); await startAnswer(p);
  await p.fill('#answer', 'typing while the recording finishes by itself');
  await p.waitForSelector('#rec-stop:not([hidden])');
  await p.focus('#answer');
  await p.evaluate(() => window.scrollTo(0, 120));
  const y0 = await p.evaluate(() => scrollY);
  await p.waitForSelector('#rec-dock:not([hidden])', { timeout: 10000 }); // the audio limit (shortened here) ends it
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({ y: scrollY, focus: document.activeElement.id, value: document.getElementById('answer').value }));
  check('a recording that finishes in the background does not scroll the page', st.y === y0, `${y0} -> ${st.y}`);
  check('and does not take focus: the person is still typing in the box, draft intact', st.focus === 'answer' && st.value.startsWith('typing while'), JSON.stringify(st));
  check('its status is announced politely (a live region)', (await p.getAttribute('#rec-dock-status', 'aria-live')) === 'polite' && (await text(p, '#rec-dock-status')).includes('10-minute limit'));
  await finish(p);
  check('during self-marking the pending recording is still in the workspace, with the question above', (await vis(p, '#rec-dock')) && (await vis(p, '#question-text')) && (await p.evaluate(() => document.getElementById('rec-dock').parentElement.id)) === 'rec-review-slot');
  await shot(p, 'desktop-selfmark-with-review', { fullPage: true });
  await p.context().close();
}

/* ===== 10. After the session: the header indicator, Open review, and the full-width summary ===== */
{
  const p = await newPage(b, { viewport: DESKTOP });
  await begin(p, { count: 1, sets: SHORT });
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1500);
  await p.click('#rec-stop'); await p.waitForSelector('#rec-dock:not([hidden])');
  await shot(p, 'desktop-pending-audio', { fullPage: true });
  await p.fill('#answer', 'my answer'); await finish(p); await next(p);
  await p.waitForSelector('#finished:not([hidden])');
  const f = await box(p, '#finished'); const main = await box(p, '#screen-practice');
  check('the summary is full width', f.w >= main.w - 36, JSON.stringify({ f: f.w, main: main.w }));
  check('the live interviewer and workspace are gone from the summary screen', !(await vis(p, '#avatar')) && !(await vis(p, '.workspace')) && !(await vis(p, '#interview')));
  check('the closing line is at the top of the summary, and focus is on its heading', (await text(p, '#finished-closing')).length > 5 && (await p.evaluate(() => document.activeElement.tagName + ':' + document.activeElement.textContent)) === 'H2:Session summary');
  check('the pending recording is not shown above or inside the summary: only a one-line indicator', (await vis(p, '#rec-indicator')) && !(await vis(p, '#rec-dock')) && (await box(p, '#rec-indicator')).h < 60);
  const pageTop = () => p.evaluate(() => document.getElementById('finished').getBoundingClientRect().top + scrollY); // position in the page, whatever the scroll
  const topBefore = await pageTop();
  await p.click('#rec-indicator-open');
  check('Open review shows the same panel at the foot of the page and moves focus to it', (await vis(p, '#rec-dock')) && (await p.evaluate(() => document.activeElement.closest('#rec-dock') !== null)) && (await p.evaluate(() => document.getElementById('rec-dock').parentElement.id)) === 'rec-tray');
  check('opening the review does not move the summary within the page', Math.abs((await pageTop()) - topBefore) < 1, `${topBefore} -> ${await pageTop()}`);
  check('the review is labelled as an earlier question and shows Save audio', (await text(p, '#rec-dock h2')).includes('earlier question') && (await vis(p, '#rec-save')));
  await shot(p, 'desktop-summary-with-review', { fullPage: true });
  await p.click('#rec-indicator-open');
  check('Hide review puts it away and returns focus to the button', !(await vis(p, '#rec-dock')) && (await p.evaluate(() => document.activeElement.id)) === 'rec-indicator-open');
  await tab(p, 'history');
  check('on another tab the same indicator is there, with the review closed', (await vis(p, '#rec-indicator')) && !(await vis(p, '#rec-dock')));
  await tab(p, 'practice');
  await p.click('#rec-indicator-open'); await p.click('#rec-discard');
  check('discarding clears the indicator', !(await vis(p, '#rec-indicator')));
  await shot(p, 'desktop-summary');
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}
{
  // The same on a phone, for the pictures
  const p = await newPage(b, { viewport: MOBILE });
  await begin(p, { count: 1, showAnswer: true, sets: SHORT });
  await shot(p, 'mobile-live-reference');
  await p.click('#tab-response'); await p.fill('#answer', 'My answer on the phone.');
  await shot(p, 'mobile-live-response');
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1500);
  await p.click('#rec-stop'); await p.waitForSelector('#rec-dock:not([hidden])'); await p.waitForTimeout(400);
  const ro = await p.evaluate(overflow);
  check('phone, with a pending recording in the workspace: no sideways scroll, all review buttons reachable', ro.sw <= ro.cw && (await vis(p, '#rec-save')) && (await vis(p, '#rec-discard')), JSON.stringify(ro));
  await shot(p, 'mobile-review', { fullPage: true });
  await finish(p); await next(p); await p.waitForSelector('#finished:not([hidden])');
  const o = await p.evaluate(overflow);
  check('phone summary: full width, no sideways scroll, indicator is one line', o.sw <= o.cw && (await vis(p, '#rec-indicator')));
  await shot(p, 'mobile-summary', { fullPage: true });
  await p.context().close();
}

/* ===== 11. Reduced motion and contrast of the new surfaces in every theme ===== */
{
  const ctx = await b.newContext({ viewport: DESKTOP, reducedMotion: 'reduce', permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  await p.goto(process.env.BASE_URL || 'http://localhost:8804/');
  await begin(p, { showAnswer: true });
  const anim = await p.evaluate(() => [...document.querySelectorAll('.workspace *, .interviewer-col *')].filter((e) => { const cs = getComputedStyle(e); return cs.animationName !== 'none' && !e.closest('.avatar'); }).map((e) => e.id || e.className));
  check('reduced motion: nothing in the workspace animates', anim.length === 0, anim.join());
  await ctx.close();
}
for (const id of ['sage', 'teal', 'plum', 'blue']) {
  const p = await newPage(b, { viewport: DESKTOP });
  await p.evaluate((t) => localStorage.setItem('interviewpal.settings', JSON.stringify({ theme: t })), id);
  await begin(p, { showAnswer: true });
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1200);
  await p.click('#rec-stop'); await p.waitForSelector('#rec-dock:not([hidden])');
  const a = await p.evaluate(AUDIT);
  check(`${id}: the workspace, reference and review are readable (${a.checked} pieces of text)`, a.failures.length === 0, a.failures.slice(0, 3).join(' | '));
  await p.context().close();
}
console.log(`Screenshots written to ${OUT}`);
await b.close();
process.exit(done() ? 1 : 0);
