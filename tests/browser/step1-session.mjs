import { launch, newPage, startSession, answering, vis, text, stats, check, done } from './lib.mjs';
const b = await launch();

// Speech stand-in whose last words arrive LATE, after stop(), as a real recogniser's can.
const SPEECH = () => {
  window.__late = []; window.__stopDelay = 700; window.__spokenLog = [];
  const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = (u) => { window.__spokenLog.push(u.text); speak(u); };
  class FakeRec {
    constructor() { this.continuous = true; this.interimResults = true; this._n = 0; this._words = []; }
    start() {
      this._words = (window.__voice || 'I would delegate the work').split(/\s+/); this._n = 0;
      this._t = setInterval(() => { if (this._n < this._words.length) { this._n++; this._emit(false); } }, 150);
    }
    _emit(final) { const r = Object.assign([{ transcript: this._words.slice(0, this._n).join(' ') }], { isFinal: final }); this.onresult?.({ resultIndex: 0, results: [r] }); }
    stop() {
      clearInterval(this._t);
      setTimeout(() => { this._words = this._words.slice(0, this._n).concat(window.__late); this._n = this._words.length; this._emit(true); this.onend?.(); }, window.__stopDelay);
    }
    abort() { clearInterval(this._t); setTimeout(() => this.onend?.(), 10); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRec;
};
const history = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.history') || '[]'));
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);
const spoken = (p) => p.evaluate(() => window.__spokenLog.length);

/* ===== 1. Cancel keeps the answer, the timer and the recording intact ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  await p.fill('#answer', 'my half written answer');
  await p.click('#rec-btn'); await p.waitForSelector('#rec-stop:not([hidden])');
  const t0 = await text(p, '#timer');
  let msg = null; p.once('dialog', async (d) => { msg = d.message(); await d.dismiss(); });
  await tab(p, 'history');
  check('a confirmation is shown, and it says what OK and Cancel do', msg && msg.includes('OK: end this session') && msg.includes('Cancel: stay'), msg);
  check('Cancel: still on the interview', (await vis(p, '#interview')) && !(await vis(p, '#screen-history')));
  await p.waitForTimeout(1300);
  check('Cancel: the answer is untouched', (await p.inputValue('#answer')) === 'my half written answer');
  check('Cancel: the timer kept running', (await text(p, '#timer')) !== t0);
  check('Cancel: the recording is still going', (await vis(p, '#rec-stop')) && (await vis(p, '#rec-clock')));
  check('Cancel: nothing was saved to History', (await history(p)).length === 0);
  await p.click('#next-btn');
  await p.waitForSelector('#question-text:has-text("How do you run")', { timeout: 15000 }).catch(() => {});
  check('Cancel: the interview carries on normally afterwards', (await text(p, '#progress')).includes('2 of 3') || (await text(p, '#progress')).includes('Question'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 2. OK ends the session, keeps the draft as incomplete, and leaving again adds nothing ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  await p.fill('#answer', 'a draft I never handed in');
  p.once('dialog', (d) => d.accept());
  await tab(p, 'settings');
  await p.waitForSelector('#screen-settings:not([hidden])');
  let h = await history(p);
  check('OK: left for Settings, one session saved', (await vis(p, '#screen-settings')) && h.length === 1, h.length);
  const r = h[0].results[0];
  check('the draft is kept as an incomplete answer, with its words', h[0].results.length === 1 && r.incomplete === true && r.answer === 'a draft I never handed in', JSON.stringify(h[0].results));
  check('it is not scored, marked, skipped or timed out', r.score === null && r.mark === '' && r.skipped === false && r.timedOut === false && r.delivery === null);
  check('the session is recorded as ended early', h[0].completed === false);
  await tab(p, 'history'); await tab(p, 'questions'); await tab(p, 'practice'); await tab(p, 'history');
  h = await history(p);
  check('leaving and coming back again adds no duplicate session', h.length === 1, h.length);
  const row = await text(p, '.history-row');
  check('the History row says incomplete', row.includes('1 incomplete') && row.includes('ended early'), row);
  await p.click('.history-row');
  const detail = await text(p, '#history-summary');
  check('the summary shows the incomplete answer clearly, not as a score', detail.includes('incomplete (not scored)') || (detail.includes('incomplete') && !detail.includes('Average score')), detail.slice(0, 300));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 3. End while spoken words are still arriving: they are kept ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  await p.evaluate(() => { window.__voice = 'I would delegate'; window.__late = ['and', 'review', 'weekly']; });
  await p.click('#mic-btn'); await p.waitForFunction(() => document.getElementById('answer').value.includes('delegate'));
  await p.click('#end-btn');
  await p.waitForSelector('#finished:not([hidden])');
  const h = await history(p);
  check('End: the late spoken words are in the incomplete answer', h[0].results[0].incomplete === true && h[0].results[0].answer.endsWith('and review weekly'), JSON.stringify(h[0].results[0].answer));
  await p.context().close();
}

/* ===== 4. Next, then End straight away: that answer is finished once, with its own outcome ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  await p.check('#opt-selfmark').catch(() => {});
  await p.evaluate(() => { window.__voice = 'I check in weekly'; window.__late = ['and', 'give', 'feedback']; window.__stopDelay = 900; });
  await p.click('#mic-btn'); await p.waitForFunction(() => document.getElementById('answer').value.includes('weekly'));
  const spokenBefore = await spoken(p);
  await p.click('#next-btn'); // Next pressed: the last words are still on their way
  await p.waitForFunction(() => document.getElementById('next-btn').disabled);
  await p.click('#end-btn');
  await p.waitForSelector('#finished:not([hidden])');
  const h = await history(p);
  const r = h[0].results;
  check('exactly one result', r.length === 1, JSON.stringify(r.map((x) => x.answer)));
  check('it keeps its original outcome: a normal answer, not incomplete', r[0].incomplete === false && r[0].skipped === false && r[0].timedOut === false);
  check('and includes the last words that arrived', r[0].answer.endsWith('and give feedback'), r[0].answer);
  check('End did not ask the next question', (await spoken(p)) === spokenBefore && !(await text(p, '#finished-body')).includes('Question 2'));
  check('no marking step was opened', !(await vis(p, '#reveal')));
  check('the session is saved once', h.length === 1);
  await p.context().close();
}

/* ===== 5. Double End: one result, one session ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  await p.fill('#answer', 'once only');
  await p.evaluate(() => { const b = document.getElementById('end-btn'); b.click(); b.click(); b.click(); });
  await p.waitForSelector('#finished:not([hidden])');
  await p.waitForTimeout(800);
  const h = await history(p);
  check('three clicks on End: one session, one incomplete answer', h.length === 1 && h[0].results.length === 1, JSON.stringify(h.map((x) => x.results.length)));
  await p.context().close();
}

/* ===== 6. A recording with no words is not an answer; the recording stays, with its question ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await startSession(p, { count: 3 });
  const q1 = (await text(p, '#question-text')).trim();
  await p.click('#rec-btn'); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1500);
  await p.click('#end-btn');
  await p.waitForSelector('#rec-indicator:not([hidden])'); await p.waitForSelector('#finished:not([hidden])');
  const h = await history(p);
  check('recording only: no result and no session is created from it', h.length === 0, JSON.stringify(h));
  check('the summary says nothing was saved because nothing was answered', (await text(p, '#finished-body')).includes('Nothing was saved to History'));
  check('the summary is not displaced: the review stays closed, and a header line names the question', (await vis(p, '#rec-indicator')) && (await text(p, '#rec-indicator-text')).includes(q1) && !(await vis(p, '#rec-dock')), await text(p, '#rec-indicator-text'));
  await p.click('#rec-indicator-open'); // the person asks for it
  check('Open review shows the same panel, and the recording is kept with its ORIGINAL question', (await text(p, '#rec-dock-question')).includes(q1) && (await text(p, '#rec-dock h2')).includes('earlier question'), await text(p, '#rec-dock-question'));
  check('the microphone is released', (await stats(p)).live === 0);
  check('it can still be saved as audio', await vis(p, '#rec-save'));
  await p.context().close();
}

/* ===== 7. Start cancelled by leaving; double-clicked Start ===== */
{
  const p = await newPage(b, { init: SPEECH });
  await p.route('**/assets/interviewers/**', async (route) => { await new Promise((r) => setTimeout(r, 1800)); await route.continue(); });
  await p.click('.tabs button[data-screen="questions"]'); await p.click('#demo-btn');
  await tab(p, 'practice');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.fill('#opt-count', '3');
  let asked = false; p.on('dialog', async (d) => { asked = true; await d.dismiss(); });
  await p.click('#start-btn');
  check('while loading, the Start button is off', await p.locator('#start-btn').isDisabled());
  await tab(p, 'history');
  check('leaving during startup asks nothing', asked === false);
  await p.waitForTimeout(3500);
  check('the cancelled start never opened a session', !(await vis(p, '#interview')) && (await spoken(p)) === 0);
  await tab(p, 'practice');
  check('back on Interview: setup is shown and Start works again', (await vis(p, '#setup')) && !(await p.locator('#start-btn').isDisabled()));
  // a double click starts one session only
  await p.evaluate(() => { const b = document.getElementById('start-btn'); b.click(); b.click(); b.click(); });
  await answering(p);
  await p.waitForTimeout(500);
  const log = await p.evaluate(() => window.__spokenLog);
  const questionSpoken = log.filter((t) => t.includes('Why did you move into engineering management?')).length;
  check('a triple click on Start starts exactly one session (the first question is asked once)', questionSpoken === 1 && (await text(p, '#progress')).includes('Question 1 of 3'), JSON.stringify(log));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 8. Late camera permission after the session ended ===== */
{
  const p = await newPage(b, { init: () => {
    window.__camRelease = null;
    window.__gum = (c, real) => (c.video && !c.audio ? new Promise((resolve) => { window.__camRelease = async () => resolve(await real(c)); }) : real(c));
  } });
  await p.click('.tabs button[data-screen="questions"]'); await p.click('#demo-btn');
  await tab(p, 'practice');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = i.parentElement.textContent.includes('Demo'); i.dispatchEvent(new Event('change', { bubbles: true })); }));
  await p.check('#opt-selfview'); await p.fill('#opt-count', '2');
  await p.click('#start-btn'); await answering(p);
  await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  await p.evaluate(() => window.__camRelease()); // the user clicks Allow, too late
  await p.waitForTimeout(600);
  const cam = await p.evaluate(() => ({ live: window.__stats.tracks.filter((t) => t.readyState === 'live').length, src: document.getElementById('self-view').srcObject, hidden: document.getElementById('self-view').hidden, note: document.getElementById('selfview-note').textContent }));
  check('the late camera was released at once and self-view stayed off', cam.live === 0 && cam.src === null && cam.hidden === true, JSON.stringify(cam));
  check('no confusing message was shown for it', cam.note === '');
  check('the self-view button shows it is off', (await p.getAttribute('#selfview-btn', 'aria-pressed')) === 'false');
  await p.context().close();
}
await b.close();
process.exit(done() ? 1 : 0);
