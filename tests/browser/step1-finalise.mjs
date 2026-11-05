import { launch, newPage, startSession, answering, vis, text, check, done, INIT, BASE } from './lib.mjs';
const b = await launch();
const SPEECH = () => {
  window.__late = []; window.__stopDelay = 900; window.__spokenLog = [];
  const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = (u) => { window.__spokenLog.push(u.text); speak(u); };
  class FakeRec {
    constructor() { this.continuous = true; this.interimResults = true; this._n = 0; this._words = []; }
    start() { this._words = (window.__voice || 'I check in weekly').split(/\s+/); this._n = 0; this._t = setInterval(() => { if (this._n < this._words.length) { this._n++; this._emit(false); } }, 150); }
    _emit(final) { const r = Object.assign([{ transcript: this._words.slice(0, this._n).join(' ') }], { isFinal: final }); this.onresult?.({ resultIndex: 0, results: [r] }); }
    stop() { clearInterval(this._t); setTimeout(() => { this._words = this._words.slice(0, this._n).concat(window.__late); this._n = this._words.length; this._emit(true); this.onend?.(); }, window.__stopDelay); }
    abort() { clearInterval(this._t); setTimeout(() => this.onend?.(), 10); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRec;
};
const COACH_KEY = () => localStorage.setItem('interviewpal.apiKey', 'sk-ant-test-not-real');
const history = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.history') || '[]'));
async function coachPage(delayMs = 1500) {
  const p = await newPage(b, { init: [SPEECH, COACH_KEY] });
  p.api = 0;
  await p.route('https://api.anthropic.com/**', async (route) => {
    p.api++;
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ score: 8, covered: ['a'], missed: ['b'], tip: 't', spoken_feedback: 'Well done.' }) }] }) });
  });
  await p.reload();
  await p.click('.tabs button[data-screen="questions"]'); await p.click('#demo-btn');
  await p.click('.tabs button[data-screen="practice"]');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.check('#mode-coach'); await p.fill('#opt-count', '3'); await p.selectOption('#opt-order', 'serial');
  await p.click('#start-btn'); await answering(p);
  return p;
}

/* ===== A. Coach: Next, then End while the last words are still arriving ===== */
{
  const p = await coachPage();
  await p.evaluate(() => { window.__voice = 'I check in weekly'; window.__late = ['and', 'give', 'feedback']; });
  await p.click('#mic-btn'); await p.waitForFunction(() => document.getElementById('answer').value.includes('weekly'));
  await p.click('#next-btn');
  await p.waitForFunction(() => document.getElementById('next-btn').disabled);
  await p.click('#end-btn');
  await p.waitForSelector('#finished:not([hidden])');
  await p.waitForTimeout(2500); // long enough for a stray Coach request to be made and answered
  const h = await history(p); const r = h[0].results;
  check('Coach: no Coach request was started by ending', p.api === 0, p.api);
  check('Coach: one result with its original outcome (not incomplete), including the late words', r.length === 1 && r[0].incomplete === false && r[0].skipped === false && r[0].answer.endsWith('and give feedback'), JSON.stringify(r[0]));
  check('Coach: the score is left unset', r[0].score === null && h[0].results.every((x) => x.score === null));
  check('Coach: no next question was asked and no feedback was spoken', !(await text(p, '#finished-body')).includes('Question 2') && !(await p.evaluate(() => window.__spokenLog)).some((t) => t.includes('Well done')));
  check('Coach: the summary shows no average score', !(await text(p, '#finished-body')).includes('Average score'));
  await p.context().close();
}

/* ===== B. Coach: End while the marking request is still in flight ===== */
{
  const p = await coachPage(2000);
  await p.fill('#answer', 'I would delegate with clear outcomes.');
  await p.click('#next-btn');
  await p.waitForSelector('#feedback:not([hidden])');
  await p.waitForFunction(() => !document.getElementById('fb-loading').hidden);
  await p.click('#end-btn'); // the one End session button, kept apart from the routine buttons (Step 3 removed the duplicate in the feedback panel)
  await p.waitForSelector('#finished:not([hidden])');
  await p.waitForTimeout(3000); // the answer from Coach arrives after the session ended
  const h = await history(p); const r = h[0].results;
  check('Coach in flight then End: one request was made', p.api === 1, p.api);
  check('the late reply did not change the saved result: score stays unset', r.length === 1 && r[0].score === null && r[0].covered.length === 0 && r[0].incomplete === false, JSON.stringify(r[0]));
  check('and nothing was spoken from it', !(await p.evaluate(() => window.__spokenLog)).some((t) => t.includes('Well done')));
  check('the saved answer is still the one handed in', r[0].answer === 'I would delegate with clear outcomes.');
  await p.context().close();
}

/* ===== C. Practice: Skip, then End: the skip stands ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  await p.evaluate(() => { window.__voice = 'not sure'; window.__late = ['really']; });
  await p.click('#mic-btn'); await p.waitForFunction(() => document.getElementById('answer').value.includes('sure'));
  await p.click('#skip-btn');
  await p.waitForFunction(() => document.getElementById('skip-btn').disabled || document.getElementById('next-btn').disabled);
  await p.click('#end-btn');
  await p.waitForSelector('#finished:not([hidden])');
  const r = (await history(p))[0].results;
  check('Skip then End: one result, still a skip, not incomplete', r.length === 1 && r[0].skipped === true && r[0].incomplete === false, JSON.stringify(r[0]));
  await p.context().close();
}

/* ===== D. The time limit runs out, and End is pressed while it is being handed in ===== */
{
  const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 }, permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  await p.addInitScript(INIT); await p.addInitScript(SPEECH);
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.clock.install();
  await p.goto(BASE);
  await p.click('.tabs button[data-screen="questions"]'); await p.click('#demo-btn');
  await p.click('.tabs button[data-screen="practice"]');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.selectOption('#opt-order', 'serial'); await p.selectOption('#opt-difficulty', 'hard'); await p.fill('#opt-count', '3');
  await p.click('#start-btn');
  for (let i = 0; i < 20 && (await p.locator('#timer').isHidden()); i++) await p.clock.runFor(500); // through the pause and the spoken question
  check('(time test) the Hard session reached its answering phase (countdown visible)', !(await p.locator('#timer').isHidden()));
  await p.evaluate(() => { window.__voice = 'I would set clear goals'; window.__late = ['and', 'review']; window.__stopDelay = 900; });
  await p.click('#mic-btn');
  await p.clock.runFor(1500);
  const spokenBefore = await p.evaluate(() => window.__spokenLog.length);
  const [, m, sec] = (await text(p, '#timer')).match(/(\d+):(\d+)/);
  const left = Number(m) * 60 + Number(sec);
  await p.clock.runFor(Math.max(0, (left - 1) * 1000)); // up to one second before the limit
  await p.clock.runFor(1300); // the limit expires now, while the microphone is listening (its last words need 900 ms more)
  check('(time test) the limit ended the answer: it is being handed in', await p.locator('#next-btn').isDisabled());
  await p.click('#end-btn'); // End while the time-up submission waits for the last words
  await p.clock.runFor(3000);
  await p.waitForSelector('#finished:not([hidden])');
  const r = (await history(p))[0].results;
  check('time up then End: one result, timed out (its original outcome), not incomplete', r.length === 1 && r[0].timedOut === true && r[0].incomplete === false, JSON.stringify(r[0]));
  check('it includes the words that arrived after the limit', r[0].answer.endsWith('and review'), r[0].answer);
  const log = await p.evaluate(() => window.__spokenLog);
  check('no time-up line or next question was spoken after End', log.length === spokenBefore, JSON.stringify(log.slice(spokenBefore)));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await ctx.close();
}
await b.close();
process.exit(done() ? 1 : 0);
