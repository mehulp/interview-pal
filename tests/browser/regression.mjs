import { launch, newPage, startSession, ready, startAnswer, finish, next, typeAndNext, attempts, stats, vis, text, check, done } from './lib.mjs';
const b = await launch();
const history = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.history') || '[]'));
const waitDock = (p) => p.waitForSelector('#rec-dock:not([hidden])');
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);

/* ===== A. A normal, complete session: no prompt on the summary, nothing duplicated ===== */
{
  const p = await newPage(b);
  await startSession(p, { count: 2 });
  await p.check('#fbk-self').catch(() => {});
  await typeAndNext(p, 'first answer');
  await ready(p); await typeAndNext(p, 'second answer');
  await p.waitForSelector('#finished:not([hidden])');
  let h = await history(p);
  check('a full session saves once, completed, with both answers and none incomplete', h.length === 1 && h[0].completed === true && h[0].results.length === 2 && h[0].results.every((r) => !r.incomplete), JSON.stringify(h.map((x) => x.results.length)));
  let asked = false; p.on('dialog', async (d) => { asked = true; await d.dismiss(); });
  await tab(p, 'history'); await tab(p, 'practice');
  check('leaving from the summary asks nothing and adds no session', !asked && (await history(p)).length === 1);
  check('the setup screen is back, and leaving from setup asks nothing', await vis(p, '#setup'));
  await tab(p, 'settings');
  check('(still no prompt from the setup screen)', !asked);
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== B. Self-marking, model answer, and shared questions still work ===== */
{
  const p = await newPage(b);
  await tab(p, 'questions'); await p.click('#demo-btn');
  check('demo card is first on the Questions tab', (await p.locator('#screen-questions > *:not([hidden])').first().getAttribute('id')) === 'demo-card');
  await p.click('#import-open'); await p.fill('#paste-box', 'Q: How do you delegate effectively?\nA: MY ANSWER\n'); await p.click('#parse-btn'); await p.click('#import-confirm'); // notes are previewed, then confirmed
  check('the same question is allowed in a second set', (await p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.sets')).sets.map((s) => s.questions.length))).join() === '1,20');
  await tab(p, 'practice');
  await p.evaluate(() => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }));
  check('setup counts the shared question once', (await text(p, '#available')).startsWith('20 question(s)'));
  await p.selectOption('#opt-order', 'serial'); await p.fill('#opt-count', '2'); await p.check('#fbk-self'); await p.check('#opt-show-answer');
  await p.click('#start-btn'); await ready(p);
  check('model answer visible from the start, and it is my copy', (await text(p, '#model-answer-text')) === 'MY ANSWER');
  await startAnswer(p); await p.fill('#answer', 'x'); await finish(p);
  check('self-marking in the review: three mark buttons and the reference', (await vis(p, '#reference')) && (await p.locator('#review [data-mark]').count()) === 3);
  await p.click('[data-mark="got"]');
  check('choosing a mark does not move on (Next is separate)', (await vis(p, '#review')) && (await p.locator('[data-mark="got"]').getAttribute('aria-pressed')) === 'true');
  await next(p); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'y'); await finish(p); await p.click('[data-mark="partly"]'); await next(p);
  await p.waitForSelector('#finished:not([hidden])');
  const h = (await history(p))[0];
  check('marks saved, session flagged as answer-visible, nothing incomplete', h.results.map((r) => r.mark).join() === 'got,partly' && h.answersVisible === true && h.results.every((r) => !r.incomplete));
  check('summary notes the visible answer', (await text(p, '#finished-body')).includes('model answer was visible'));
  await p.context().close();
}

/* ===== C. Audio recording: record, save, list, reload, History, play, delete ===== */
{
  const p = await newPage(b);
  await startSession(p, { count: 2 });
  const q1 = (await text(p, '#question-text')).trim();
  await p.check('#rec-mode-audio'); await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(2500);
  await p.fill('#answer', 'typed'); await finish(p); // Finish answer stops the recording and waits for it
  await waitDock(p);
  check('Finish answer ended the recording; the audio is waiting, labelled with the question', (await stats(p)).live === 0 && (await text(p, '#rec-dock-question')).includes(q1));
  check('Record again is offered in the review, with its scope explained', (await vis(p, '#rec-retry')) && (await text(p, '#rec-dock-hint')).includes('only this recording'));
  await next(p); await ready(p);
  check('the pending audio is still labelled with the ORIGINAL question after moving on', (await text(p, '#rec-dock-question')).includes(q1));
  check('Retry is not offered once you have moved on', !(await vis(p, '#rec-retry')));
  await p.click('#rec-save');
  await p.waitForFunction(() => document.getElementById('rec-dock-status').textContent.startsWith('Saved'));
  const a = await attempts(p);
  check('saved under the original question', a.length === 1 && a[0].questionText.trim() === q1);
  await p.reload(); await tab(p, 'history');
  await p.waitForSelector('#recordings-card .rec-attempt');
  await p.click('#recordings-card .rec-attempt button:has-text("Play")');
  await p.waitForFunction(() => { const x = document.querySelector('#recordings-card audio'); return x && Number.isFinite(x.duration) && x.seekable.length > 0; }, null, { timeout: 8000 });
  const seek = await p.evaluate(async () => { const x = document.querySelector('#recordings-card audio'); x.muted = true; x.currentTime = 1; await new Promise((r) => setTimeout(r, 400)); return x.currentTime; });
  check('after reload the saved audio plays and seeks', Math.abs(seek - 1) < 0.5, seek);
  p.on('dialog', (d) => d.accept());
  await p.click('#recordings-card .rec-attempt button:has-text("Delete")');
  await p.waitForFunction(() => document.querySelector('#recordings-card').textContent.includes('No saved recordings yet'));
  check('delete works', (await attempts(p)).length === 0);
  check('no page errors, no network', p.errors.length === 0 && p.external.length === 0, p.errors.join() + p.external.join());
  await p.context().close();
}

/* ===== D. Video: download only, never stored, preview small, screen untouched ===== */
{
  const p = await newPage(b);
  await startSession(p, { count: 2 });
  await p.check('#rec-mode-video'); await startAnswer(p);
  await p.waitForSelector('#rec-preview-box:not([hidden])'); await p.waitForTimeout(1500);
  const w = await p.evaluate(() => Math.round(document.getElementById('rec-preview').getBoundingClientRect().width));
  check('a small preview, with the interviewer and question still visible', w <= 260 && (await vis(p, '#avatar')) && (await vis(p, '#question-text')), w);
  await p.click('#rec-stop'); await waitDock(p);
  check('no Save for video; Download is offered', !(await vis(p, '#rec-save')) && (await vis(p, '#rec-download')));
  const counts = await p.evaluate(() => new Promise((resolve) => { const q = indexedDB.open('interviewpal-recordings'); q.onsuccess = () => { const tx = q.result.transaction(['attempts', 'audio']); const a = tx.objectStore('attempts').count(); const u = tx.objectStore('audio').count(); tx.oncomplete = () => resolve([a.result, u.result]); }; }));
  check('nothing was written to the browser store', counts.join() === '0,0', counts);
  await p.click('#rec-download');
  check('downloading marks it safe to leave', (await p.evaluate(() => window.__downloads.length)) === 1 && (await text(p, '#rec-dock-status')).startsWith('Download started'));
  await p.context().close();
}
await b.close();
process.exit(done() ? 1 : 0);
