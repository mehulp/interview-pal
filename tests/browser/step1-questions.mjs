// Honest saving and destination-safe notes import on the Questions screen (Step 1 reliability, adapted to the Step 6
// library). The fuller library checks are in library.mjs; these keep the original Step 1 scenarios alive.
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

/* ===== 1. A failed save is reported, nothing is claimed, the draft stays, and retry works ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  await p.click('#add-btn');
  await p.fill('#q-f-question', 'A question I typed while storage is blocked?');
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#q-save');
  check('a failed save shows a message with a retry button', (await vis(p, '#lib-alert')) && (await vis(p, '#lib-retry')));
  check('the draft is still on the page, and nothing is stored', (await p.inputValue('#q-f-question')).startsWith('A question I typed') && (await stored(p))[0].qs.length === 0);
  await p.click('#lib-retry');
  check('retry while storage is still blocked keeps the warning and the draft', (await vis(p, '#lib-alert')) && (await vis(p, '#q-form')));
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#lib-retry');
  await p.waitForSelector('#q-view:not([hidden])');
  check('retry after storage works: warning gone and it says saved', !(await vis(p, '#lib-alert')) && (await text(p, '#set-status')).startsWith('Saved.'), await text(p, '#set-status'));
  check('what was typed is really in storage, and survives a reload', (await stored(p))[0].qs.includes('A question I typed while storage is blocked?'));
  await p.reload(); await goQuestions(p);
  check('after a reload it is still there', (await stored(p))[0].qs.length === 1);
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 1b. Creating a set, the demo and a backup say when they could not save ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#demo-btn');
  check('demo: the confirmation says nothing was added, and the sets are unchanged', (await text(p, '#demo-status')).startsWith('Nothing was added') && (await text(p, '#demo-status')).includes('could not store') && (await stored(p)).length === 1, await text(p, '#demo-status'));
  p.once('dialog', (d) => d.accept('Leadership'));
  await p.click('#set-new');
  check('a new set that could not be saved is not created, and the message says so', (await text(p, '#lib-alert-text')).includes('Not created') && (await stored(p)).length === 1);
  await p.context().close();
}

/* ===== 2. Opening another set while notes are being read ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  p.once('dialog', (d) => d.accept('Other set'));
  await p.click('#set-new');
  await pickSet(p, 'My questions');
  await p.click('#import-open');
  await p.setInputFiles('#file-input', NOTES);
  await p.evaluate(() => { window.__delay = 900; });
  await p.click('#parse-btn');
  check('while reading: the button is off and the status names the destination', (await p.locator('#parse-btn').isDisabled()) && (await text(p, '#load-status')).includes('"My questions"'), await text(p, '#load-status'));
  await p.evaluate(() => document.getElementById('parse-btn').click()); // a second click is ignored
  await pickSet(p, 'Other set'); // the user opens another set during the wait
  await p.waitForSelector('#import-preview:not([hidden])', { timeout: 5000 });
  check('the preview is for the set the import started from, not the one opened later', (await text(p, '#import-dest')).includes('"My questions"') && (await text(p, '#import-confirm')).includes('"My questions"'));
  check('nothing has been added yet anywhere', (await stored(p)).every((s) => s.qs.length === 0));
  await p.click('#import-confirm');
  await p.waitForFunction(() => document.getElementById('set-status').textContent.startsWith('Added'));
  const st = await stored(p);
  check('on confirm the questions went into the original destination only, once', st.find((s) => s.name === 'My questions').qs.length === 1 && st.find((s) => s.name === 'Other set').qs.length === 0, JSON.stringify(st));
  check('the set on screen was not disturbed', (await text(p, '#set-name')) === 'Other set');
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 3. The destination set is deleted while notes are being read ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  p.once('dialog', (d) => d.accept('Short lived'));
  await p.click('#set-new'); // it is now the open set
  await p.click('#import-open');
  await p.setInputFiles('#file-input', NOTES);
  await p.fill('#paste-box', 'Q: A pasted question?\nA: Yes.');
  await p.evaluate(() => { window.__delay = 900; });
  await p.click('#parse-btn');
  await p.click('#set-menu-btn'); p.once('dialog', (d) => d.accept()); await p.click('#set-delete'); // confirm deleting the set
  await p.waitForFunction(() => !document.getElementById('parse-btn').disabled, null, { timeout: 5000 });
  check('nothing was added anywhere', (await stored(p)).every((s) => !s.qs.some((q) => q.includes('management style') || q.includes('pasted'))));
  check('the message explains why', (await text(p, '#load-status')).includes('was deleted while the notes were being read'), await text(p, '#load-status'));
  check('the notes are still there to try again, and the button is back', (await p.inputValue('#paste-box')).includes('pasted') && (await p.evaluate(() => document.getElementById('file-input').files.length)) === 1 && !(await p.locator('#parse-btn').isDisabled()));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 4. A file that cannot be read: status and button are restored ===== */
{
  const p = await newPage(b, { init: INIT_SAVE });
  await goQuestions(p);
  await p.click('#import-open');
  await p.setInputFiles('#file-input', NOTES);
  await p.evaluate(() => { File.prototype.text = () => Promise.reject(new Error('disk read failed')); });
  await p.click('#parse-btn');
  await p.waitForFunction(() => !document.getElementById('parse-btn').disabled, null, { timeout: 5000 });
  const msg = await text(p, '#load-status');
  check('a read failure is reported, nothing added, and the button is restored', msg.includes('disk read failed') && !(await p.locator('#parse-btn').isDisabled()) && (await stored(p)).every((s) => s.qs.length === 0), msg);
  await p.context().close();
}
await b.close();
process.exit(done() ? 1 : 0);
