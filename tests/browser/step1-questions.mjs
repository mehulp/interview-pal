import { launch, newPage, vis, text, check, done } from './lib.mjs';
const b = await launch();
const INIT_SAVE = () => {
  window.__failSave = false;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__failSave && k === 'interviewpal.sets') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); };
  window.__delay = 0;
  const textOrig = File.prototype.text;
  File.prototype.text = async function () { if (window.__delay) await new Promise((r) => setTimeout(r, window.__delay)); return textOrig.call(this); };
};
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.sets')).sets.map((s) => ({ name: s.name, qs: s.questions.map((q) => q.question) })));
const goQuestions = (p) => p.click('.tabs button[data-screen="questions"]');
const pickSet = async (p, prefix) => { const v = await p.evaluate((pre) => [...document.querySelectorAll('#set-select option')].find((o) => o.textContent.startsWith(pre)).value, prefix); await p.selectOption('#set-select', v); };
const NOTES = { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('Q: What is your management style?\nA: Supportive and clear.\n') };

/* ===== 1. A failed save is reported, the edit stays, and retry works ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  await p.click('#add-btn');
  const box = p.locator('.pair-card textarea').first();
  await box.fill('A question I typed while storage is blocked?');
  check('no warning while saving works', !(await vis(p, '#save-alert')));
  await p.evaluate(() => { window.__failSave = true; });
  await box.fill('A question I typed while storage is blocked? (edited)');
  check('a failed save shows a message with a retry button', (await vis(p, '#save-alert')) && (await vis(p, '#save-retry')), '');
  check('the edit is still on the page', (await box.inputValue()).endsWith('(edited)'));
  p.once('dialog', (d) => d.accept('Leadership'));
  await p.click('#set-new');
  check('"Created" does not claim more than happened', (await text(p, '#set-status')).includes('not saved yet'), await text(p, '#set-status'));
  await p.click('#save-retry');
  check('retry while storage is still blocked keeps the warning', await vis(p, '#save-alert'));
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#save-retry');
  check('retry after storage works: warning gone and it says saved', !(await vis(p, '#save-alert')) && (await text(p, '#set-status')).startsWith('Saved.'), await text(p, '#set-status'));
  const st = await stored(p);
  check('what was typed is now really in storage (the new set, and the earlier edit)', st.some((s) => s.name === 'Leadership') && st.some((s) => s.qs.some((q) => q.endsWith('(edited)'))), JSON.stringify(st));
  await p.reload(); await goQuestions(p);
  check('and it survives a reload', (await stored(p)).some((s) => s.name === 'Leadership'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 1b. Demo and backup import also say when they could not save ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#demo-btn');
  check('demo: the confirmation says it is not saved yet', (await text(p, '#demo-status')).includes('Not saved yet') && (await vis(p, '#save-alert')), await text(p, '#demo-status'));
  await p.context().close();
}

/* ===== 2. Switching sets while notes are being read ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  p.once('dialog', (d) => d.accept('Other set'));
  await p.click('#set-new');
  await pickSet(p, 'My questions');
  await p.setInputFiles('#file-input', NOTES);
  await p.evaluate(() => { window.__delay = 900; });
  await p.click('#parse-btn');
  check('while reading: the button is off and the status names the destination', (await p.locator('#parse-btn').isDisabled()) && (await text(p, '#load-status')).includes('"My questions"'), await text(p, '#load-status'));
  await p.evaluate(() => document.getElementById('parse-btn').click()); // a second click is ignored
  await pickSet(p, 'Other set'); // the user opens another set during the wait
  await p.waitForFunction(() => !document.getElementById('parse-btn').disabled, null, { timeout: 5000 });
  const st = await stored(p);
  check('the questions went into the set the import started from, not the one opened later', st.find((s) => s.name === 'My questions').qs.length === 1 && st.find((s) => s.name === 'Other set').qs.length === 0, JSON.stringify(st));
  check('only one copy was added (the second click was ignored)', st.find((s) => s.name === 'My questions').qs.length === 1);
  check('the message says where they went', (await text(p, '#load-status')).includes('went into "My questions"'), await text(p, '#load-status'));
  check('the other set was not disturbed', (await text(p, '#set-name')) === 'Other set' && (await p.locator('.pair-card').count()) === 0);
  check('the button works again', !(await p.locator('#parse-btn').isDisabled()));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 3. The destination set is deleted while notes are being read ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  p.once('dialog', (d) => d.accept('Short lived'));
  await p.click('#set-new'); // it is now the open set
  await p.setInputFiles('#file-input', NOTES);
  await p.fill('#paste-box', 'Q: A pasted question?\nA: Yes.');
  await p.evaluate(() => { window.__delay = 900; });
  await p.click('#parse-btn');
  p.once('dialog', (d) => d.accept()); // confirm deleting the set
  await p.click('#set-delete');
  await p.waitForFunction(() => !document.getElementById('parse-btn').disabled, null, { timeout: 5000 });
  const st = await stored(p);
  check('nothing was added anywhere', st.every((s) => !s.qs.some((q) => q.includes('management style') || q.includes('pasted'))), JSON.stringify(st));
  check('the message explains why', (await text(p, '#load-status')).includes('was deleted while the notes were being read'), await text(p, '#load-status'));
  check('the notes are still there to try again, and the button is back', (await p.inputValue('#paste-box')).includes('pasted') && (await p.evaluate(() => document.getElementById('file-input').files.length)) === 1 && !(await p.locator('#parse-btn').isDisabled()));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 4. A file that cannot be read: status and button are restored ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  await p.setInputFiles('#file-input', NOTES);
  await p.evaluate(() => { File.prototype.text = () => Promise.reject(new Error('disk read failed')); });
  await p.click('#parse-btn');
  await p.waitForFunction(() => !document.getElementById('parse-btn').disabled, null, { timeout: 5000 });
  const msg = await text(p, '#load-status');
  check('a read failure is reported, nothing added, and the button is restored', !msg.startsWith('Reading') && !(await p.locator('#parse-btn').isDisabled()) && (await stored(p)).every((s) => s.qs.length === 0), msg);
  await p.context().close();
}
await b.close();
process.exit(done() ? 1 : 0);
