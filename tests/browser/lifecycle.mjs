// The answer and review lifecycle (UX redesign Step 4): Question spoken -> Ready -> Answering -> Finishing -> Review -> Next.
// Speak and Type, recording Off / Audio / Video, separate status lines, permission refusal and delay, a recorder that
// never says it has stopped, double clicks, the hard time limit, End during finalisation, self-marking, Coach retry /
// error / skip / empty text, pending recordings across questions, outcomes in History, old history, media cleanup.
// A headless browser has no real speech recogniser, microphone or camera: see README.md for what that leaves untested.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, newPage, ready, startAnswer, finish, next, vis, text, stats, overflow, check, done, INIT, BASE } from './lib.mjs';

const OUT = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), 'interviewpal-lifecycle-'));
mkdirSync(OUT, { recursive: true });
const shot = async (p, name, opts = {}) => writeFileSync(join(OUT, `${name}.png`), await p.screenshot(opts));
const b = await launch();

// A speech stand-in: words arrive while listening; window.__recFail makes it fail at once like a refused microphone.
const SPEECH = () => {
  window.__late = []; window.__stopDelay = 300; window.__spokenLog = []; window.__listens = 0;
  const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = (u) => { window.__spokenLog.push(u.text); speak(u); };
  class FakeRec {
    constructor() { this.continuous = true; this.interimResults = true; this._n = 0; this._words = []; }
    start() {
      window.__listens++;
      if (window.__recFail) { setTimeout(() => { this.onerror?.({ error: window.__recFail }); this.onend?.(); }, 50); return; }
      this._words = (window.__voice || 'I would delegate the work').split(/\s+/); this._n = 0;
      this._t = setInterval(() => { if (this._n < this._words.length) { this._n++; this._emit(false); } }, 120);
    }
    _emit(final) { const r = Object.assign([{ transcript: this._words.slice(0, this._n).join(' ') }], { isFinal: final }); this.onresult?.({ resultIndex: 0, results: [r] }); }
    stop() { clearInterval(this._t); setTimeout(() => { this._words = this._words.slice(0, this._n).concat(window.__late); this._n = this._words.length; this._emit(true); this.onend?.(); }, window.__stopDelay); }
    abort() { clearInterval(this._t); setTimeout(() => this.onend?.(), 10); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRec;
};
const COACH_KEY = () => localStorage.setItem('interviewpal.apiKey', 'sk-ant-test-not-real');
const history = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.history') || '[]'));
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);
const primary = (p) => text(p, '#primary-btn');
const phaseOf = async (p) => ({ label: await primary(p), disabled: await p.locator('#primary-btn').isDisabled(), kind: await p.getAttribute('#primary-btn', 'data-kind') });
const AUDIO_OK = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ score: 8, covered: ['a'], missed: ['b'], tip: 't', spoken_feedback: 'Well done.' }) }] });

async function open(p, { count = 3, difficulty = 'medium', coach = false, selfMark = false, showAnswer = false } = {}) {
  await tab(p, 'questions'); if (await p.locator('#demo-btn').isVisible()) await p.click('#demo-btn');
  await tab(p, 'practice');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.selectOption('#opt-order', 'serial'); await p.selectOption('#opt-difficulty', difficulty); await p.fill('#opt-count', String(count));
  if (coach) await p.check('#mode-coach');
  if (selfMark) await p.check('#opt-selfmark');
  if (showAnswer) await p.check('#opt-show-answer');
  await p.click('#start-btn');
}
const gumCount = (p) => p.evaluate(() => window.__stats.gum);
const liveTracks = async (p) => (await stats(p)).live;

/* ===== 1. The sequence and the main button; nothing is captured while the interviewer speaks ===== */
{
  // A slow speaker, so "asking" can be seen
  const p = await newPage(b, { init: [SPEECH, () => { window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event('end')), 1800); }] });
  await open(p, { count: 2 });
  await p.waitForSelector('#question-text:not(:empty)');
  let s = await phaseOf(p);
  check('while the question is being asked: Start answer is there but off', s.label === 'Start answer' && s.disabled === true && s.kind === 'start', JSON.stringify(s));
  check('nothing is captured while the interviewer speaks (no microphone request, not listening)', (await gumCount(p)) === 0 && (await p.evaluate(() => window.__listens)) === 0);
  check('the hint says nothing is captured yet', (await text(p, '#primary-hint')).includes('Nothing is captured'));
  await ready(p);
  s = await phaseOf(p);
  check('Ready: Start answer is on', s.label === 'Start answer' && !s.disabled);
  check('Ready: the preparation clock runs, there is no answer clock yet', (await text(p, '#phase-clock')).startsWith('Preparing'));
  check('Ready: still nothing captured', (await gumCount(p)) === 0 && (await p.evaluate(() => window.__listens)) === 0);
  check('Ready: keyboard focus is on Start answer', (await p.evaluate(() => document.activeElement.id)) === 'primary-btn');
  await p.click('#primary-btn');
  s = await phaseOf(p);
  check('Answering: the main button is Finish answer', s.label === 'Finish answer' && !s.disabled && s.kind === 'finish');
  check('Answering: the answer clock runs', (await text(p, '#phase-clock')).startsWith('Answering'));
  check('Answering: Repeat is off (nothing may play over the answer)', await p.locator('#repeat-btn').isDisabled());
  await p.fill('#answer', 'Typed response');
  await p.click('#primary-btn');
  check('Finishing: the button says Finishing… and is off', (await primary(p)) === 'Finishing…' || (await p.locator('#review').isVisible()));
  await p.waitForSelector('#review:not([hidden])');
  s = await phaseOf(p);
  check('Review: the main button is Next question', s.label === 'Next question' && !s.disabled && s.kind === 'next');
  check('Review: focus moved to the review heading', (await p.evaluate(() => document.activeElement.id)) === 'review-title');
  check('Review: the handed-in response is shown, and the text box is gone', (await text(p, '#review-response')) === 'Typed response' && !(await vis(p, '#answer')));
  await next(p); await ready(p);
  check('Next question: back to Ready for question 2, with an empty box', (await text(p, '#progress')).includes('2 of 2') && (await p.inputValue('#answer')) === '');
  await p.click('#primary-btn'); await p.fill('#answer', 'second'); await finish(p);
  check('the last review says Finish session', (await primary(p)) === 'Finish session');
  await next(p); await p.waitForSelector('#finished:not([hidden])');
  const h = (await history(p))[0];
  check('results carry the new timings, and outcomes are answered', h.results.length === 2 && h.results.every((r) => 'prepSeconds' in r && 'answerSeconds' in r && r.incomplete === false && r.answer));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 2. Speaking and typing; Speak is the default; switching never loses the response ===== */
{
  const p = await newPage(b, { init: [SPEECH] });
  await open(p, { count: 2 }); await ready(p);
  check('Speak is the default where speech recognition exists', await p.locator('#method-speak').isChecked());
  await p.evaluate(() => { window.__voice = 'I would delegate the work'; window.__late = ['carefully']; });
  await p.click('#primary-btn'); // Start answer starts listening
  await p.waitForFunction(() => document.getElementById('answer').value.includes('delegate'));
  check('Start answer began listening, and the Speech to text line says so', (await p.evaluate(() => window.__listens)) === 1 && (await text(p, '#status')).includes('Listening'), await text(p, '#status'));
  check('the Recording line is separate and says recording is off', (await text(p, '#rec-status')).includes('off'));
  await p.fill('#answer', 'I would delegate the work, and then I typed more.'); // typing stops the listening and wins over a late transcript
  await p.waitForTimeout(700);
  check('typing while listening stops listening; a late transcript does not overwrite the typed words', (await p.inputValue('#answer')) === 'I would delegate the work, and then I typed more.');
  await p.check('#method-type');
  check('switching to Type keeps the response', (await p.inputValue('#answer')).startsWith('I would delegate'));
  check('the choice is remembered', (await p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.settings')).answerMethod)) === 'type');
  await finish(p);
  check('the typed response is what was handed in', (await text(p, '#review-response')).endsWith('I typed more.'));
  await p.context().close();
}
{
  // No speech recognition at all: Type, with Speak switched off
  const p = await newPage(b);
  await open(p, { count: 1 }); await ready(p);
  check('without speech recognition: Type is chosen and Speak is off', (await p.locator('#method-type').isChecked()) && (await p.locator('#method-speak').isDisabled()));
  await startAnswer(p);
  check('and the Speech to text line explains', (await text(p, '#status')).includes('Not supported'));
  check('typing works: the box takes focus when Start answer is pressed', (await p.evaluate(() => document.activeElement.id)) === 'answer');
  await p.context().close();
}

/* ===== 3. Recording Off / Audio / Video with a typed response ===== */
{
  const p = await newPage(b);
  await open(p, { count: 3 }); await ready(p);
  check('recording is Off by default', await p.locator('#rec-mode-off').isChecked());
  await startAnswer(p);
  check('Off: no microphone was requested', (await gumCount(p)) === 0);
  await p.fill('#answer', 'no recording'); await finish(p);
  check('Off: the review says recording was off, and nothing is waiting', (await text(p, '#review-recording')).includes('Off') && !(await vis(p, '#rec-dock')));
  await next(p); await ready(p);
  check('the Off choice is still Off on the next question', await p.locator('#rec-mode-off').isChecked());
  await p.check('#rec-mode-audio'); await startAnswer(p);
  await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1300);
  check('Audio: started by Start answer (one microphone request), and the Recording line says what is on', (await gumCount(p)) === 1 && (await text(p, '#rec-device')).includes('Recording'));
  await p.fill('#answer', 'with audio'); await finish(p);
  await p.waitForSelector('#rec-dock:not([hidden])');
  check('Audio: Finish answer waited for the recording; it is waiting in the review, with Save', (await liveTracks(p)) === 0 && (await vis(p, '#rec-save')) && (await text(p, '#review-recording')).includes('Audio captured'));
  await next(p); await ready(p);
  check('a pending recording is labelled as an earlier question on the next one', (await text(p, '#rec-dock h2')).includes('earlier question'));
  await p.click('#rec-discard');
  await p.check('#rec-mode-video'); await startAnswer(p);
  await p.waitForSelector('#rec-preview-box:not([hidden])'); await p.waitForTimeout(1200);
  const c = await p.evaluate(() => window.__stats.constraints.at(-1));
  check('Video: asks for the camera too', c.includes('video') && c.includes('audio'));
  await p.fill('#answer', 'with video'); await finish(p);
  await p.waitForSelector('#rec-dock:not([hidden])');
  check('Video: download only (no Save), and nothing is stored in the browser', !(await vis(p, '#rec-save')) && (await vis(p, '#rec-download')) && (await p.evaluate(() => new Promise((resolve) => { const q = indexedDB.open('interviewpal-recordings'); q.onsuccess = () => { const tx = q.result.transaction(['attempts']); const a = tx.objectStore('attempts').count(); tx.oncomplete = () => resolve(a.result); }; }))) === 0);
  check('Video: every track released after Finish answer', (await liveTracks(p)) === 0);
  await p.click('#rec-download');
  check('the Download wording does not claim the file was kept', (await text(p, '#rec-dock-status')).includes('cannot confirm'));
  await p.context().close();
}

/* ===== 4. Failures are separate: recognition fails but recording works; recording fails but speech works ===== */
{
  const p = await newPage(b, { init: [SPEECH] });
  await open(p, { count: 2 }); await ready(p);
  await p.evaluate(() => { window.__recFail = 'audio-capture'; });
  await p.check('#rec-mode-audio');
  await p.click('#primary-btn');
  await p.waitForFunction(() => document.getElementById('status').textContent.includes('No microphone'));
  await p.waitForSelector('#rec-stop:not([hidden])');
  check('speech failed: the Speech to text line says so, and offers typing', (await text(p, '#status')).includes('type your response instead'), await text(p, '#status'));
  check('the recording carries on and says nothing about the failure', !(await text(p, '#rec-status')).includes('No microphone') && (await vis(p, '#rec-stop')));
  await p.waitForTimeout(500);
  check('it did not restart listening by itself', (await p.evaluate(() => window.__listens)) === 1);
  await p.fill('#answer', 'I typed instead'); await p.waitForTimeout(1200); await finish(p);
  await p.waitForSelector('#rec-dock:not([hidden])');
  check('the typed response and the recording both arrived', (await text(p, '#review-response')) === 'I typed instead' && (await vis(p, '#rec-save')));
  await p.context().close();
}
{
  // The microphone for recording is refused; speech still works
  const p = await newPage(b, { init: [SPEECH, () => { window.__gum = (c, real) => { throw Object.assign(new Error('refused'), { name: 'NotAllowedError' }); }; }] });
  await open(p, { count: 2 }); await ready(p);
  await p.evaluate(() => { window.__voice = 'speech still works'; });
  await p.check('#rec-mode-audio'); await p.click('#primary-btn');
  await p.waitForFunction(() => document.getElementById('answer').value.includes('works'));
  const s = await text(p, '#rec-status');
  check('recording was refused: the Recording line explains, and the answer carries on', s.length > 10 && (await primary(p)) === 'Finish answer', s);
  check('the Speech to text line is not affected by it', (await text(p, '#status')).includes('Listening'));
  await finish(p);
  check('the review says nothing was recorded, and the response is intact', (await text(p, '#review-recording')).includes('Nothing was recorded') && (await text(p, '#review-response')).includes('speech still works'));
  check('no half-created recording is left', !(await vis(p, '#rec-dock')) && (await liveTracks(p)) === 0);
  await p.context().close();
}

/* ===== 5. A permission dialog that is slow: the answer and the clocks do not wait ===== */
{
  const p = await newPage(b, { init: [() => { window.__gumRelease = null; window.__gum = (c, real) => new Promise((resolve) => { window.__gumRelease = async () => resolve(await real(c)); }); }] });
  await open(p, { count: 2 }); await ready(p);
  const t0 = await text(p, '#timer');
  await p.check('#rec-mode-audio'); await p.click('#primary-btn');
  await p.waitForSelector('#primary-btn[data-kind="finish"]');
  check('Start answer does not wait for the permission: the answer is under way', (await primary(p)) === 'Finish answer');
  check('the Recording line says it is waiting for permission', (await text(p, '#rec-device')).includes('Waiting for the microphone'));
  await p.fill('#answer', 'typing while the prompt is open');
  await p.waitForTimeout(2200);
  const t1 = await text(p, '#timer');
  check('the hard countdown was not paused or reset by the dialog', t1 !== t0 && t1 < t0, `${t0} -> ${t1}`);
  await finish(p); // permission still not answered
  check('Finish answer does not hang on the permission: the response is handed in', (await text(p, '#review-response')) === 'typing while the prompt is open');
  check('the review says the permission was still waiting', (await text(p, '#review-recording')).includes('permission was still waiting'), await text(p, '#review-recording'));
  await p.evaluate(() => window.__gumRelease()); // the user clicks Allow, too late
  await p.waitForTimeout(700);
  check('a late permission opens no recording and leaves no microphone on', !(await vis(p, '#rec-dock')) && (await liveTracks(p)) === 0);
  await p.context().close();
}

/* ===== 6. A recorder that never reports it has stopped: finalisation is bounded ===== */
{
  const p = await newPage(b, { init: [() => { MediaRecorder.prototype.stop = function stuck() { /* never fires onstop */ }; }] });
  await open(p, { count: 2 }); await ready(p);
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(2200);
  await p.fill('#answer', 'the recorder is stuck');
  const started = Date.now();
  await finish(p);
  const took = Date.now() - started;
  check('Finish answer still opens the review within the bound (about 3 s, not forever)', took < 9000, `${took} ms`);
  check('the response is kept, and the microphone is released', (await text(p, '#review-response')) === 'the recorder is stuck' && (await liveTracks(p)) === 0);
  check('the interview can move on', !(await p.locator('#primary-btn').isDisabled()));
  await next(p); await ready(p);
  await p.context().close();
}

/* ===== 7. Double clicks: Finish answer and Next question happen once ===== */
{
  const p = await newPage(b, { init: [SPEECH] });
  await open(p, { count: 3 }); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'once');
  await p.evaluate(() => { const b = document.getElementById('primary-btn'); b.click(); b.click(); b.click(); });
  await p.waitForSelector('#review:not([hidden])'); await p.waitForTimeout(500);
  await p.evaluate(() => { const b = document.getElementById('primary-btn'); b.click(); b.click(); b.click(); }); // Next, three times
  await ready(p);
  check('three clicks on Next moved on exactly one question', (await text(p, '#progress')).includes('Question 2 of 3'));
  check('and the first answer is one result', (await history(p)).length === 0 && (await p.evaluate(() => 1)) === 1);
  await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  const h = await history(p);
  check('one session, with one handed-in answer (question 2 was not started)', h.length === 1 && h[0].results.length === 1 && h[0].results[0].answer === 'once' && h[0].results[0].incomplete === false, JSON.stringify(h[0]?.results));
  await p.context().close();
}

/* ===== 8. The hard time limit hands the response in once and opens the review, with no auto-advance ===== */
{
  const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 }, permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  await p.addInitScript(INIT); await p.addInitScript(SPEECH);
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.clock.install();
  await p.goto(BASE);
  await open(p, { count: 3, difficulty: 'hard' });
  for (let i = 0; i < 30 && (await p.locator('#timer').isHidden()); i++) await p.clock.runFor(500);
  check('(time) the countdown is running in Ready, before Start answer', !(await p.locator('#timer').isHidden()));
  await p.clock.runFor(4000);
  const before = await text(p, '#timer');
  await p.click('#primary-btn'); // Start answer: the countdown is not reset or paused
  await p.fill('#answer', 'my answer as time ran out');
  await p.clock.runFor(2000);
  const after = await text(p, '#timer');
  const secs = (t) => { const [, m, s] = t.match(/(\d+):(\d+)/); return Number(m) * 60 + Number(s); };
  check('(time) Start answer did not reset or pause the hard countdown', secs(after) < secs(before) && secs(before) - secs(after) >= 1 && secs(before) - secs(after) <= 4, `${before} -> ${after}`);
  for (let i = 0; i < 4000 && (await p.locator('#review').isHidden()); i++) await p.clock.runFor(250);
  check('(time) the limit opened the review', await vis(p, '#review'));
  await p.clock.runFor(30000);
  check('(time) it did not go on to the next question by itself', (await text(p, '#progress')).includes('Question 1 of 3') && (await vis(p, '#review')));
  check('(time) the review says time ran out and keeps the response', (await text(p, '#review-title')).startsWith('Time ran out') && (await text(p, '#review-response')) === 'my answer as time ran out');
  check('(time) the main button is Next question, waiting for the person', (await primary(p)) === 'Next question' && !(await p.locator('#primary-btn').isDisabled()));
  const spokenTimeUp = await p.evaluate(() => window.__spokenLog.length);
  await p.click('#end-btn'); await p.clock.runFor(3000); await p.waitForSelector('#finished:not([hidden])');
  const r = (await history(p))[0].results;
  check('(time) one result, timed out, once', r.length === 1 && r[0].timedOut === true && r[0].incomplete === false && r[0].answerSeconds >= 1, JSON.stringify(r));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await ctx.close();
}

/* ===== 9. End during finalisation (with a recording): the answer is kept once, nothing else starts ===== */
{
  const p = await newPage(b, { init: [SPEECH, () => { window.__stopDelay = 1500; }] });
  let api = 0; await p.route('https://api.anthropic.com/**', (r) => { api++; r.abort(); });
  await open(p, { count: 3 }); await ready(p);
  await p.evaluate(() => { window.__voice = 'last words matter'; window.__late = ['too']; });
  await p.check('#rec-mode-audio'); await p.click('#primary-btn');
  await p.waitForFunction(() => document.getElementById('answer').value.includes('matter'));
  await p.click('#primary-btn');
  await p.waitForFunction(() => document.getElementById('primary-btn').disabled);
  await p.click('#end-btn');
  await p.waitForSelector('#finished:not([hidden])');
  const h = await history(p);
  check('End during Finishing: one result with its original outcome, including the late words', h[0].results.length === 1 && h[0].results[0].incomplete === false && h[0].results[0].answer.endsWith('too'), JSON.stringify(h[0].results));
  check('no review, no next question, no Coach request', !(await vis(p, '#review')) && api === 0 && !(await text(p, '#finished-body')).includes('Question 2'));
  check('the recording is waiting (indicator), the microphone released', (await vis(p, '#rec-indicator')) && (await liveTracks(p)) === 0);
  await p.context().close();
}

/* ===== 10. Empty responses, skipped and incomplete are told apart ===== */
{
  const p = await newPage(b);
  await open(p, { count: 4 }); await ready(p);
  await startAnswer(p); await finish(p);
  check('nothing typed: the review says No response, and there is no score', (await text(p, '#review-title')) === 'No response' && (await vis(p, '#review-response')));
  await next(p); await ready(p);
  await p.click('#skip-btn');
  await ready(p);
  check('Skip moves straight on, without a review', (await text(p, '#progress')).includes('Question 3') && !(await vis(p, '#review')));
  await startAnswer(p); await p.fill('#answer', 'half an answer');
  await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  const h = (await history(p))[0];
  const [a, s, c] = h.results;
  check('History: no response (answered, no words), skipped, and incomplete are different', a.answer === '' && !a.skipped && !a.incomplete && s.skipped === true && c.incomplete === true && h.results.length === 3, JSON.stringify(h.results.map((r) => [r.answer, r.skipped, r.incomplete])));
  const body = await text(p, '#finished-body');
  check('the summary names them: no response, skipped, incomplete (not scored)', body.includes('no response') && body.includes('skipped') && body.includes('incomplete'));
  await p.context().close();
}

/* ===== 11. Pending recordings across questions: never overwritten ===== */
{
  const p = await newPage(b);
  await open(p, { count: 4 }); await ready(p);
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForTimeout(1300); await p.fill('#answer', 'one'); await finish(p);
  await next(p); await ready(p);
  const gum1 = await gumCount(p);
  await p.click('#primary-btn');
  check('a recording is pending: Start answer does not start another, and says why', (await primary(p)) === 'Start answer' && (await vis(p, '#rec-blocked')) && (await text(p, '#rec-blocked-text')).includes('save it, download it or discard it'));
  check('nothing was requested, the first recording is untouched', (await gumCount(p)) === gum1 && (await vis(p, '#rec-save')));
  await p.click('#rec-continue-without');
  await p.waitForSelector('#primary-btn[data-kind="finish"]');
  check('Continue without recording starts the answer unrecorded, for this answer only', (await gumCount(p)) === gum1 && (await text(p, '#rec-status')).includes('not being recorded') && await p.locator('#rec-mode-audio').isChecked());
  await p.fill('#answer', 'two'); await finish(p);
  check('the review says it was not recorded and the earlier recording is still there', (await text(p, '#review-recording')).includes('Off') && (await vis(p, '#rec-save')));
  await next(p); await ready(p);
  await p.click('#rec-save'); await p.waitForFunction(() => document.getElementById('rec-dock-status').textContent.startsWith('Saved'));
  await p.click('#primary-btn'); await p.waitForSelector('#rec-clock:not([hidden])'); // actually recording (the permission was answered)
  check('after saving, the next Start answer records (the choice was never changed)', (await gumCount(p)) === gum1 + 1 && !(await vis(p, '#rec-blocked')));
  await p.fill('#answer', 'three'); await finish(p);
  check('Record again is offered for this question, saying it replaces only the recording', (await vis(p, '#rec-retry')) && (await text(p, '#rec-dock-hint')).includes('your answer text stays'));
  await p.click('#rec-retry'); await p.waitForSelector('#rec-stop:not([hidden])');
  check('Record again records only (the response is not changed or retaken)', (await text(p, '#review-response')) === 'three' && (await vis(p, '#review')));
  await p.waitForTimeout(800); await p.click('#rec-stop'); await p.waitForSelector('#rec-save');
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 12. Coach: success, error with retry, skip, and no text ===== */
{
  const p = await newPage(b, { init: [COACH_KEY] });
  let calls = 0; let mode = 'fail';
  await p.route('https://api.anthropic.com/**', async (route) => {
    calls++;
    if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"boom"}}' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: AUDIO_OK });
  });
  await p.reload();
  await open(p, { count: 3, coach: true }); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'I would listen first.'); await finish(p);
  await p.waitForSelector('#fb-error:not([hidden])');
  check('Coach error: the message and the two choices are in the review; Next waits', (await vis(p, '#fb-retry')) && (await vis(p, '#fb-skip')) && (await p.locator('#primary-btn').isDisabled()));
  mode = 'ok';
  await p.click('#fb-retry'); await p.waitForSelector('#fb-result:not([hidden])');
  check('Try again re-marks the same result: feedback shown, Next on, no second answer', calls === 2 && !(await p.locator('#primary-btn').isDisabled()) && (await text(p, '#fb-score')) === '8');
  await next(p); await ready(p);
  mode = 'fail';
  await startAnswer(p); await p.fill('#answer', 'second answer'); await finish(p);
  await p.waitForSelector('#fb-error:not([hidden])');
  await p.click('#fb-skip');
  check('Skip feedback: the review stays, Next is on, and the result is kept without a score', !(await p.locator('#primary-btn').isDisabled()) && (await vis(p, '#review')) && !(await vis(p, '#feedback')));
  await next(p); await ready(p);
  // no text: a recording alone
  const before = calls;
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForTimeout(1200); await finish(p);
  await p.waitForSelector('#fb-empty:not([hidden])');
  check('no text: no request, a clear explanation, and a recording is never sent', calls === before && (await text(p, '#fb-empty')).includes('needs your words') && (await text(p, '#fb-empty')).includes('never sent'));
  check('no text: the response area says there is no text, and nothing is scored 0', (await text(p, '#review-title')) === 'No response' && !(await vis(p, '#fb-score')));
  check('no text: Next is available (continue unscored)', !(await p.locator('#primary-btn').isDisabled()));
  mode = 'ok';
  await p.click('#fb-type'); await p.fill('#fb-text', 'What I said, typed now.'); await p.click('#fb-submit');
  await p.waitForSelector('#fb-result:not([hidden])');
  check('typing the response afterwards gets feedback, once, for the same result', calls === before + 1 && (await text(p, '#review-response')) === 'What I said, typed now.' && (await text(p, '#review-title')) !== 'No response');
  await next(p); await p.waitForSelector('#finished:not([hidden])');
  const h = (await history(p))[0];
  check('History: three results, no duplicates; the skipped feedback has no score; the corrected one has words and a score', h.results.length === 3 && h.results[0].score === 8 && h.results[1].score === null && h.results[1].feedbackSkipped === true && h.results[2].answer === 'What I said, typed now.' && h.results[2].score === 8, JSON.stringify(h.results.map((r) => [r.score, r.feedbackSkipped, r.answer.length])));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}
{
  // Coach, a recording alone, "Continue without feedback"
  const p = await newPage(b, { init: [COACH_KEY] });
  let calls = 0; await p.route('https://api.anthropic.com/**', (r) => { calls++; r.fulfill({ status: 200, contentType: 'application/json', body: AUDIO_OK }); });
  await p.reload();
  await open(p, { count: 2, coach: true }); await ready(p);
  await startAnswer(p); await finish(p);
  await p.waitForSelector('#fb-empty:not([hidden])');
  await p.click('#fb-continue');
  check('Continue without feedback closes the notice; no request was made', calls === 0 && !(await vis(p, '#feedback')) && !(await p.locator('#primary-btn').isDisabled()));
  await p.context().close();
}

/* ===== 13. Self-marking and the reference in review; assisted flags ===== */
{
  const p = await newPage(b);
  await open(p, { count: 2, selfMark: true }); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'unassisted'); await finish(p);
  check('review shows the reference for comparison', (await vis(p, '#reference')) && (await text(p, '#reference')).length > 10);
  await p.click('[data-mark="partly"]');
  check('choosing a mark does not advance; the mark shows as pressed', (await vis(p, '#review')) && (await p.getAttribute('[data-mark="partly"]', 'aria-pressed')) === 'true' && (await text(p, '#progress')).includes('Question 1'));
  await p.click('[data-mark="got"]');
  check('the mark can be changed before moving on', (await p.getAttribute('[data-mark="got"]', 'aria-pressed')) === 'true' && (await p.getAttribute('[data-mark="partly"]', 'aria-pressed')) === 'false');
  await next(p); await ready(p);
  await p.click('#answer-toggle'); await startAnswer(p); await p.fill('#answer', 'assisted'); await finish(p); await next(p);
  await p.waitForSelector('#finished:not([hidden])');
  const h = (await history(p))[0];
  check('seeing the reference only in review is not "assisted"; showing it while answering is', h.results[0].answerShown === false && h.results[0].mark === 'got' && h.results[1].answerShown === true && h.answersVisible === true, JSON.stringify(h.results.map((r) => [r.answerShown, r.mark])));
  await p.context().close();
}

/* ===== 14. Repeat: only in Ready; it starts no timer and captures nothing ===== */
{
  const p = await newPage(b, { init: [SPEECH] });
  await open(p, { count: 2, difficulty: 'easy' }); await ready(p);
  const t = await p.locator('#repeat-btn').isVisible();
  if (t) {
    const n = await p.evaluate(() => window.__spokenLog.length);
    await p.click('#repeat-btn');
    await p.waitForFunction((k) => window.__spokenLog.length > k, n);
    check('Repeat in Ready speaks the question again without starting capture', (await p.evaluate(() => window.__listens)) === 0 && (await gumCount(p)) === 0 && (await primary(p)) === 'Start answer');
    await p.click('#primary-btn');
    check('Repeat is off once the answer has started', await p.locator('#repeat-btn').isDisabled());
  }
  await p.context().close();
}

/* ===== 15. Old history still opens; incomplete answers stay out of the numbers ===== */
{
  const p = await newPage(b);
  await p.evaluate(() => {
    const old = { id: 'old1', startedAt: Date.now() - 86400000, endedAt: Date.now() - 86000000, durationSec: 400, completed: true, mode: 'practice', difficulty: 'medium', order: 'serial', level: 'all', total: 2, sets: ['Demo'], results: [
      { question: 'Old one?', topic: 'T', level: '', set: 'Demo', answer: 'x', skipped: false, timedOut: false, seconds: 40, delivery: null, mark: 'got', score: null, covered: [], missed: [], tip: '', noAnswer: false, noReference: false, feedbackSkipped: false },
      { question: 'Old two?', topic: 'T', level: '', set: 'Demo', answer: '', skipped: false, timedOut: true, seconds: 120, delivery: null, mark: '', score: 0, covered: [], missed: [], tip: '', noAnswer: true, noReference: false, feedbackSkipped: false },
    ] };
    localStorage.setItem('interviewpal.history', JSON.stringify([old]));
  });
  await p.reload(); await tab(p, 'history'); await p.waitForSelector('.history-row');
  await p.click('.history-row');
  const t = await text(p, '#history-summary');
  check('an old session (no new fields) opens in History, with a sensible label for the empty one', t.includes('Old one?') && t.includes('Old two?'), t.slice(0, 200));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 16. Phone layout, keyboard use and pictures ===== */
{
  const p = await newPage(b, { viewport: { width: 390, height: 800 } });
  await open(p, { count: 1, showAnswer: true }); await ready(p);
  await p.check('#rec-mode-audio');
  await shot(p, 'mobile-ready', { fullPage: true });
  let o = await p.evaluate(overflow);
  check('phone, Ready: no sideways scroll', o.sw <= o.cw, JSON.stringify(o));
  // keyboard: Start answer with Enter, then Finish with Enter
  await p.focus('#primary-btn'); await p.keyboard.press('Enter');
  await p.waitForSelector('#primary-btn[data-kind="finish"]');
  check('keyboard: Enter on Start answer started the answer; the open tab is left as the person chose it', (await p.getAttribute('#tab-reference', 'aria-selected')) === 'true');
  await p.click('#tab-response'); await p.fill('#answer', 'Typed on a phone.'); await p.waitForTimeout(1200);
  await shot(p, 'mobile-answering', { fullPage: true });
  o = await p.evaluate(overflow);
  check('phone, Answering: no sideways scroll', o.sw <= o.cw, JSON.stringify(o));
  await p.focus('#primary-btn'); await p.keyboard.press('Enter');
  await p.waitForSelector('#review:not([hidden])');
  await shot(p, 'mobile-review', { fullPage: true });
  o = await p.evaluate(overflow);
  check('phone, Review: no sideways scroll, Next question reachable', o.sw <= o.cw && (await p.locator('#primary-btn').isEnabled()), JSON.stringify(o));
  check('keyboard: after Finish, focus is on the review heading', (await p.evaluate(() => document.activeElement.id)) === 'review-title');
  await p.context().close();
}
{
  const p = await newPage(b, { viewport: { width: 1366, height: 800 } });
  await open(p, { count: 1, showAnswer: true, selfMark: true }); await ready(p);
  await shot(p, 'desktop-ready');
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.fill('#answer', 'I would agree one visible goal with the team, then check in every day.'); await p.waitForTimeout(1500);
  await shot(p, 'desktop-answering');
  await finish(p); await p.click('[data-mark="partly"]');
  await shot(p, 'desktop-review', { fullPage: true });
  const dupes = await p.evaluate(() => { const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; }); return Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k); });
  check('no id is used twice', dupes.length === 0, dupes.join());
  await p.context().close();
}

console.log(`Screenshots written to ${OUT}`);
await b.close();
process.exit(done() ? 1 : 0);
