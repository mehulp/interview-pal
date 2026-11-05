// The question library (UX redesign Step 6): browse and select by ID, search and filters, Edit / Save / Cancel with honest
// saving, validation, guards for unsaved edits, delete with Undo, move conflicts, Practise this set, the notes import
// preview (destination safe), backup compatibility, keyboard focus, phone width, a 200% layout and all four themes.
// Devices and viewports are SIMULATED (see README.md); real browser zoom, clipboard and mobile keyboards are manual checks.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, newPage, vis, text, stats, overflow, AUDIT, check, done } from './lib.mjs';

const OUT = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), 'interviewpal-library-'));
mkdirSync(OUT, { recursive: true });
const shot = async (p, name, opts = {}) => writeFileSync(join(OUT, `${name}.png`), await p.screenshot(opts));
const b = await launch();

// Storage can be made to fail for the sets; reading a file can be delayed or fail
const INIT = () => {
  window.__failSave = false; window.__delay = 0; window.__dl = [];
  const anchorClick = HTMLAnchorElement.prototype.click; // downloads are made with a link that is not in the page: note them
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); return anchorClick.call(this); };
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__failSave && k === 'interviewpal.sets') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); };
  const textOrig = File.prototype.text;
  File.prototype.text = async function () { if (window.__delay) await new Promise((r) => setTimeout(r, window.__delay)); if (window.__failRead) throw new Error('disk read failed'); return textOrig.call(this); };
  // No clipboard in the test browser: make it refuse, to test the fallback box
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
};
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.sets')).sets);
const names = (p) => p.evaluate(() => [...document.querySelectorAll('#q-list .q-row-title')].map((e) => e.textContent));
const ids = (p) => p.evaluate(() => [...document.querySelectorAll('#q-list .q-row')].map((e) => e.dataset.id));
const selectedRow = (p) => p.evaluate(() => document.querySelector('#q-list .q-row[aria-current="true"]')?.dataset.id || null);
const focusId = (p) => p.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
const focusRowId = (p) => p.evaluate(() => document.activeElement?.dataset?.id || null);
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);
const settings = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.settings') || 'null'));

const LONG = Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1}: I would listen first, write down what I heard, check it against facts, agree one visible goal, and review it weekly with the whole team so problems surface early.`).join('\n\n');
const LONGQ = 'You have joined a team that has missed three releases in a row, two of your strongest engineers are talking about leaving, and your own manager wants a plan within a week. How do you decide what to do first, who you talk to, and how you will know it is working?';
const q = (id, question, o = {}) => ({ id, question, answer: o.answer ?? '', topic: o.topic ?? '', level: o.level ?? '' });
const SETS = () => ([
  { id: 'sa', name: 'Alpha', questions: [
    q('a1', 'How do you delegate?', { answer: 'Clear outcomes.', topic: 'People', level: 'easy' }),
    q('a2', 'Describe a conflict you resolved', { topic: '' }),
    q('a3', LONGQ, { answer: LONG, topic: 'Leadership', level: 'hard' }),
    q('a4', 'Design a cache', { answer: 'LRU with a TTL.', topic: 'Technical', level: 'hard' }),
    q('a5', 'Why management?', { answer: 'Impact through others.', topic: 'people' }),
    q('a6', 'Tell me about a mistake', { topic: 'Reflection' }),
  ] },
  { id: 'sb', name: 'Beta', questions: [q('b1', 'why   MANAGEMENT?', { answer: 'Beta copy' }), q('b2', 'Beta only question', { topic: 'Misc' })] },
]);
async function open(p, sets = SETS()) {
  await p.evaluate((s) => localStorage.setItem('interviewpal.sets', JSON.stringify({ sets: s })), sets);
  await p.reload();
  await tab(p, 'questions');
}
const rowFor = (p, id) => p.locator(`#q-list .q-row[data-id="${id}"]`);
const pick = async (p, id) => { await rowFor(p, id).click(); await p.waitForSelector('#q-view:not([hidden])'); };
const sel = (p, v) => p.selectOption('#set-select', v);
const NOTES = { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('Some stray text that is not a question.\n\nQ: What is your management style?\nA: Supportive and clear.\n\nQ: How do you give feedback?\nA: Early and kind.\n') };

/* ===== 1. Browse: rows, detail, selection by ID ===== */
{
  const p = await newPage(b, { init: [INIT], viewport: { width: 1280, height: 900 } });
  await open(p);
  check('a compact set selector, the set title and count, and the set actions are in the header', (await vis(p, '#set-select')) && (await text(p, '#set-name')) === 'Alpha' && (await text(p, '#pair-count')) === '(6)' && (await vis(p, '#add-btn')) && (await vis(p, '#import-open')) && (await vis(p, '#practise-set')) && (await vis(p, '#set-menu-btn')));
  check('Rename, Delete and Export sit in the Set actions menu, not among the routine buttons', !(await vis(p, '#set-rename')) && !(await vis(p, '#set-delete')) && !(await vis(p, '#menu-export')));
  const rows = await p.locator('.q-row').allInnerTexts();
  check('rows show the title, topic, complexity and whether a reference answer exists', rows[0].includes('How do you delegate?') && rows[0].includes('People') && rows[0].includes('Easy') && rows[0].includes('Reference answer') && rows[1].includes('No topic') && rows[1].includes('Not tagged') && rows[1].includes('No reference'), rows.slice(0, 2).join(' | '));
  check('with room the list and the detail are side by side (two panes, not three columns)', await p.evaluate(() => { const l = document.getElementById('lib-list-pane').getBoundingClientRect(); const d = document.getElementById('lib-detail-pane').getBoundingClientRect(); return l.right <= d.left + 1 && Math.abs(l.top - d.top) < 40; }));
  check('before choosing: a hint, no detail', (await vis(p, '#q-empty')) && !(await vis(p, '#q-view')));
  await pick(p, 'a3');
  check('the detail shows the WHOLE question and the whole reference answer', (await text(p, '#q-view-title')) === LONGQ && (await text(p, '#q-view-answer')).includes('Paragraph 14') && (await text(p, '#q-view-meta')).includes('Leadership'));
  const o = await p.evaluate(overflow);
  check('a long reference wraps: no sideways scroll', o.sw <= o.cw, JSON.stringify(o));
  check('the row is marked as the current one, and focus moved to the detail heading', (await selectedRow(p)) === 'a3' && (await focusId(p)) === 'q-view-title');
  // selection is by ID: filtering and clearing moves the row, not the selection
  await p.fill('#lib-search', 'cache');
  check('searching moves the row in the list; the selected question (hidden now) is deselected while only viewing', (await ids(p)).join() === 'a4' && !(await vis(p, '#q-view')));
  await p.click('#lib-clear');
  check('Clear filters restores the original order', (await ids(p)).join() === 'a1,a2,a3,a4,a5,a6');
  await pick(p, 'a4'); await p.fill('#lib-search', 'a');
  check('a selection that is still visible stays selected when the list changes', (await selectedRow(p)) === 'a4');
  check('no page errors', p.errors.length === 0, p.errors.join());
  await shot(p, 'library-desktop');
  await p.context().close();
}

/* ===== 2. Search and filters ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  const before = JSON.stringify(await stored(p));
  await p.fill('#lib-search', 'DELEGATE');
  check('search matches the question text (ignoring case)', (await ids(p)).join() === 'a1' && (await text(p, '#lib-count')) === '1 of 6 match');
  await p.fill('#lib-search', 'technical');
  check('search matches the topic', (await ids(p)).join() === 'a4');
  await p.fill('#lib-search', 'zzzz nothing');
  check('no match: a clear empty state and a Clear filters button', (await text(p, '#lib-count')) === 'No questions match these filters.' && (await vis(p, '#lib-clear')) && (await ids(p)).length === 0);
  await p.click('#lib-clear');
  await p.selectOption('#lib-topic', '__none');
  check('the topic filter has No topic', (await ids(p)).join() === 'a2');
  await p.selectOption('#lib-topic', 'Leadership');
  check('the topic filter lists the set\'s topics', (await ids(p)).join() === 'a3' && (await p.locator('#lib-topic option').allInnerTexts()).join().includes('Reflection'));
  await p.selectOption('#lib-topic', ''); await p.selectOption('#lib-level', '__untagged');
  check('the complexity filter has Not tagged', (await ids(p)).join() === 'a2,a5,a6');
  await p.selectOption('#lib-level', 'hard');
  check('Hard', (await ids(p)).join() === 'a3,a4');
  await p.fill('#lib-search', 'cache');
  check('filters combine', (await ids(p)).join() === 'a4');
  await p.click('#lib-clear');
  check('Clear filters resets all three and restores the saved order', (await ids(p)).join() === 'a1,a2,a3,a4,a5,a6' && (await p.inputValue('#lib-search')) === '' && (await p.inputValue('#lib-level')) === '' && (await p.inputValue('#lib-topic')) === '' && (await focusId(p)) === 'lib-search');
  check('filtering never changed what is saved', JSON.stringify(await stored(p)) === before);
  await p.context().close();
}

/* ===== 3. Editing: Edit -> Save / Cancel, validation, focus ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await pick(p, 'a1');
  await p.click('#q-edit');
  check('Edit opens a labelled form with the saved values; focus is in the question', (await vis(p, '#q-form')) && (await p.inputValue('#q-f-question')) === 'How do you delegate?' && (await p.inputValue('#q-f-topic')) === 'People' && (await focusId(p)) === 'q-f-question');
  await p.fill('#q-f-question', 'Changed wording?');
  check('typing changes nothing saved', (await stored(p))[0].questions[0].question === 'How do you delegate?');
  await p.click('#q-cancel');
  check('Cancel restores the saved version and puts focus on Edit', (await text(p, '#q-view-title')) === 'How do you delegate?' && (await focusId(p)) === 'q-edit' && (await stored(p))[0].questions[0].question === 'How do you delegate?');
  await p.click('#q-edit'); await p.fill('#q-f-question', '   '); await p.click('#q-save');
  check('an empty question is refused, with a message tied to the field, and nothing is saved', (await vis(p, '#q-f-error')) && (await text(p, '#q-f-error')).includes('cannot be empty') && (await p.getAttribute('#q-f-question', 'aria-invalid')) === 'true' && (await focusId(p)) === 'q-f-question');
  await p.fill('#q-f-question', '  DESIGN   a cache ');
  await p.click('#q-save');
  check('a duplicate in the same set is refused (capitals and spaces ignored), naming the set', (await text(p, '#q-f-error')).includes('"Alpha" already has this question'), await text(p, '#q-f-error'));
  await p.fill('#q-f-question', 'Describe a conflict you resolved');
  await p.click('#q-save');
  check('another question\'s text is a duplicate too', await vis(p, '#q-f-error'));
  await p.fill('#q-f-question', 'How do you delegate well?'); await p.fill('#q-f-answer', 'New reference'); await p.fill('#q-f-topic', 'Delegation'); await p.selectOption('#q-f-level', 'hard');
  await p.click('#q-save');
  await p.waitForSelector('#q-view:not([hidden])');
  const saved = (await stored(p))[0].questions[0];
  check('Save stores the change (same ID, same position) and says saved only now', saved.id === 'a1' && saved.question === 'How do you delegate well?' && saved.answer === 'New reference' && saved.topic === 'Delegation' && saved.level === 'hard' && (await text(p, '#set-status')).startsWith('Saved.'));
  check('the recordings note appears when the wording changes', (await text(p, '#set-status')).includes('Recordings saved under the old wording'));
  check('focus returns to the saved question\'s heading, and the row is still selected', (await focusId(p)) === 'q-view-title' && (await selectedRow(p)) === 'a1');
  // the same question text is fine in another set
  await sel(p, 'sb'); await pick(p, 'b2'); await p.click('#q-edit'); await p.fill('#q-f-question', 'How do you delegate well?'); await p.click('#q-save');
  await p.waitForSelector('#q-view:not([hidden])');
  check('the same question is allowed in a different set', (await stored(p))[1].questions[1].question === 'How do you delegate well?');
  // Add
  await p.click('#add-btn');
  check('Add question opens an empty draft and focus is in it; nothing is added yet', (await vis(p, '#q-form')) && (await p.inputValue('#q-f-question')) === '' && (await focusId(p)) === 'q-f-question' && (await stored(p))[1].questions.length === 2);
  await p.click('#q-cancel');
  check('cancelling an added draft adds nothing and focus returns to Add question', (await stored(p))[1].questions.length === 2 && (await focusId(p)) === 'add-btn' && !(await vis(p, '#q-form')));
  await p.click('#add-btn'); await p.fill('#q-f-question', 'A brand new question?'); await p.fill('#q-f-answer', 'Because.');
  await p.click('#q-save'); await p.waitForSelector('#q-view:not([hidden])');
  const st = (await stored(p))[1].questions;
  check('a saved new question is at the end with its own ID, and is selected', st.length === 3 && st[2].question === 'A brand new question?' && st[2].id && (await selectedRow(p)) === st[2].id);
  check('no page errors', p.errors.length === 0, p.errors.join());
  await shot(p, 'library-view');
  await p.context().close();
}

/* ===== 4. A failed save: the draft is kept, nothing is claimed, retry and copy work ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await pick(p, 'a2'); await p.click('#q-edit'); await p.fill('#q-f-question', 'Describe a conflict you resolved (edited)'); await p.fill('#q-f-answer', 'Draft reference');
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#q-save');
  check('a failed save says NOT saved, keeps the form open with the draft, and offers Try again, Copy and Download', (await vis(p, '#lib-alert')) && (await text(p, '#lib-alert-text')).startsWith('Not saved') && (await vis(p, '#q-form')) && (await p.inputValue('#q-f-answer')) === 'Draft reference' && (await vis(p, '#lib-retry')) && (await vis(p, '#lib-copy')) && (await vis(p, '#lib-download')), await text(p, '#lib-alert-text'));
  check('it did not say Saved, and the library data is unchanged', !(await text(p, '#set-status')).startsWith('Saved') && (await stored(p))[0].questions[1].question === 'Describe a conflict you resolved');
  await p.click('#lib-copy');
  check('with no clipboard access the text is offered in a box to copy by hand', (await vis(p, '#lib-copy-box')) && (await p.inputValue('#lib-copy-box')).includes('Question: Describe a conflict you resolved (edited)') && (await p.inputValue('#lib-copy-box')).includes('Reference answer: Draft reference'));
  await p.click('#lib-download');
  check('Download as a file starts a download', (await p.evaluate(() => window.__dl.at(-1))) === 'interviewpal-unsaved-question.txt');
  await p.click('#lib-retry');
  check('retrying while storage still fails keeps everything', (await vis(p, '#lib-alert')) && (await vis(p, '#q-form')));
  // a failed Save from the guard must not navigate away
  await rowFor(p, 'a4').click();
  check('the guard asks Save, Discard or Stay', await vis(p, '#guard-dialog'));
  await p.click('#guard-save');
  await p.waitForTimeout(200);
  check('a failed Save from the guard keeps the person on the draft (it does not navigate)', !(await vis(p, '#guard-dialog')) && (await vis(p, '#q-form')) && (await selectedRow(p)) === 'a2');
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#lib-retry');
  await p.waitForSelector('#q-view:not([hidden])');
  check('Try again after storage works saves it, hides the warning, and says saved', !(await vis(p, '#lib-alert')) && (await text(p, '#set-status')).startsWith('Saved.') && (await stored(p))[0].questions[1].answer === 'Draft reference');
  await p.reload(); await tab(p, 'questions');
  check('and it survives a reload', (await stored(p))[0].questions[1].answer === 'Draft reference');
  await p.context().close();
}

/* ===== 5. Guards: switching question, set, Add, Practise, leaving the tab ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await pick(p, 'a1'); await p.click('#q-edit');
  await rowFor(p, 'a4').click();
  check('an UNCHANGED edit form does not ask (nothing to lose)', !(await vis(p, '#guard-dialog')) && (await selectedRow(p)) === 'a4');
  await p.click('#q-edit'); await p.fill('#q-f-topic', 'Changed topic');
  await rowFor(p, 'a5').click();
  check('a changed draft asks before switching question', await vis(p, '#guard-dialog'));
  await p.keyboard.press('Escape');
  check('Escape means Stay: the draft is untouched and still selected', !(await vis(p, '#guard-dialog')) && (await p.inputValue('#q-f-topic')) === 'Changed topic' && (await selectedRow(p)) === 'a4');
  await rowFor(p, 'a5').click(); await p.click('#guard-stay');
  check('Stay keeps the draft', (await p.inputValue('#q-f-topic')) === 'Changed topic');
  await rowFor(p, 'a5').click(); await p.click('#guard-discard');
  check('Discard drops the draft and moves on; nothing was saved', (await selectedRow(p)) === 'a5' && (await stored(p))[0].questions[3].topic === 'Technical');
  await p.click('#q-edit'); await p.fill('#q-f-topic', 'Saved by the guard');
  await rowFor(p, 'a6').click(); await p.click('#guard-save');
  await p.waitForSelector('#q-view:not([hidden])');
  check('Save in the guard saves, then moves on', (await selectedRow(p)) === 'a6' && (await stored(p))[0].questions[4].topic === 'Saved by the guard');
  // other exits
  await p.click('#q-edit'); await p.fill('#q-f-topic', 'unsaved again');
  await sel(p, 'sb');
  check('switching set asks too, and Stay puts the selector back', (await vis(p, '#guard-dialog')) && (await (async () => { await p.click('#guard-stay'); return p.inputValue('#set-select'); })()) === 'sa');
  await p.click('#add-btn'); check('Add question asks too', await vis(p, '#guard-dialog')); await p.click('#guard-stay');
  await p.click('#practise-set'); check('Practise this set asks too', await vis(p, '#guard-dialog')); await p.click('#guard-stay');
  check('and staying left us on the Questions tab with the draft', (await vis(p, '#screen-questions')) && (await p.inputValue('#q-f-topic')) === 'unsaved again');
  await tab(p, 'practice');
  check('leaving the tab (which also covers starting practice) asks', await vis(p, '#guard-dialog'));
  await p.click('#guard-stay');
  check('Stay keeps us on the Questions tab', (await vis(p, '#screen-questions')) && !(await vis(p, '#setup')));
  await tab(p, 'practice'); await p.click('#guard-discard');
  check('Discard lets us leave', await vis(p, '#setup'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 6. Hiding the selected question with filters while editing keeps the draft ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await pick(p, 'a1'); await p.click('#q-edit'); await p.fill('#q-f-answer', 'my long draft');
  await p.fill('#lib-search', 'cache');
  check('while editing, a filter that hides the question keeps the editor, with a note, and the draft', (await vis(p, '#q-form')) && (await vis(p, '#q-form-hidden')) && (await p.inputValue('#q-f-answer')) === 'my long draft' && (await focusId(p)) === 'lib-search');
  await p.click('#lib-clear');
  check('clearing the filter shows the row again, still selected, draft intact', (await selectedRow(p)) === 'a1' && (await p.inputValue('#q-f-answer')) === 'my long draft' && !(await vis(p, '#q-form-hidden')));
  await p.context().close();
}

/* ===== 7. Delete with Undo ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  const original = (await stored(p))[0].questions[2];
  await pick(p, 'a3');
  await p.click('#q-delete');
  check('deleting removes it at once and shows Undo, with a plain explanation of how long it stays', (await ids(p)).join() === 'a1,a2,a4,a5,a6' && (await vis(p, '#undo-bar')) && (await text(p, '#undo-note')).includes('until you delete another question, open another set, leave this tab or reload') && (await stored(p))[0].questions.length === 5);
  check('focus goes to the next question\'s row', (await focusRowId(p)) === 'a4');
  await p.waitForTimeout(3500);
  check('Undo does not expire on a timer', await vis(p, '#undo-btn'));
  await p.click('#undo-btn');
  const back = (await stored(p))[0].questions;
  check('Undo restores the same ID, content and position', back.map((x) => x.id).join() === 'a1,a2,a3,a4,a5,a6' && JSON.stringify(back[2]) === JSON.stringify(original));
  check('the restored question is selected, focused, and Undo is gone', (await selectedRow(p)) === 'a3' && (await focusRowId(p)) === 'a3' && !(await vis(p, '#undo-bar')));
  // failures
  await pick(p, 'a2');
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#q-delete');
  check('a failed delete says it was NOT deleted, and the question is still there', (await text(p, '#lib-alert-text')).startsWith('Not deleted') && (await ids(p)).includes('a2') && (await stored(p))[0].questions.length === 6 && !(await vis(p, '#undo-bar')));
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#lib-retry');
  check('Try again deletes it for real', !(await ids(p)).includes('a2') && (await stored(p))[0].questions.length === 5 && (await vis(p, '#undo-bar')));
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#undo-btn');
  check('a failed Undo says so, the question stays deleted, and Undo is still offered', (await text(p, '#lib-alert-text')).startsWith('Undo failed') && !(await ids(p)).includes('a2') && (await vis(p, '#undo-btn')));
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#lib-retry');
  check('retrying Undo restores it', (await ids(p)).join() === 'a1,a2,a3,a4,a5,a6');
  // Undo is dropped when changing set; a conflicting Undo is refused
  await pick(p, 'a1'); await p.click('#q-delete');
  await sel(p, 'sb');
  check('opening another set drops Undo', !(await vis(p, '#undo-bar')));
  await sel(p, 'sa'); await pick(p, 'a4'); await p.click('#q-delete');
  await p.click('#add-btn'); await p.fill('#q-f-question', 'design a CACHE'); await p.click('#q-save'); await p.waitForSelector('#q-view:not([hidden])');
  await p.click('#undo-btn');
  check('Undo is refused (not silently duplicated) when the set now has the same question', (await text(p, '#set-status')).includes('Could not undo') && (await vis(p, '#undo-bar')));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 8. Moving between sets ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await pick(p, 'a5'); // "Why management?" is also in Beta (different spacing and case), with a different reference
  let message = '';
  p.once('dialog', async (d) => { message = d.message(); await d.dismiss(); });
  await p.selectOption('#q-move', 'sb');
  check('moving into a set that has the same question warns first, and says the existing copy is kept', message.includes('already has this question') && message.includes('is kept exactly as it is'), message);
  check('dismissing the warning changes nothing', (await stored(p))[0].questions.length === 6 && (await p.inputValue('#q-move')) === '');
  p.once('dialog', (d) => d.accept());
  await p.selectOption('#q-move', 'sb');
  const st = await stored(p);
  check('accepting only removes it from here; the destination copy is unchanged', st[0].questions.length === 5 && st[1].questions.length === 2 && st[1].questions[0].answer === 'Beta copy' && (await text(p, '#set-status')).includes('only removed from here'), await text(p, '#set-status'));
  await pick(p, 'a1');
  await p.selectOption('#q-move', 'sb');
  check('a normal move keeps the question and its ID in the other set, without a warning', (await stored(p))[1].questions.some((x) => x.id === 'a1') && (await text(p, '#set-status')).startsWith('Moved one question'));
  await pick(p, 'a2');
  await p.evaluate(() => { window.__failSave = true; });
  await p.selectOption('#q-move', 'sb');
  check('a failed move says it was not moved, and the question is where it was', (await text(p, '#lib-alert-text')).startsWith('Not moved') && (await ids(p)).includes('a2') && !(await stored(p))[1].questions.some((x) => x.id === 'a2'));
  await p.context().close();
}

/* ===== 9. Sets: menu, rename, delete, clear, export wording, Practise this set ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await p.focus('#set-menu-btn'); await p.keyboard.press('Enter');
  check('the Set actions menu opens from the keyboard with focus on its first item', (await vis(p, '#set-menu')) && (await p.getAttribute('#set-menu-btn', 'aria-expanded')) === 'true' && (await focusId(p)) === 'set-rename');
  await p.keyboard.press('ArrowDown');
  check('arrow keys move through the items', (await focusId(p)) === 'menu-export');
  await p.keyboard.press('Escape');
  check('Escape closes it and returns focus to the button', !(await vis(p, '#set-menu')) && (await focusId(p)) === 'set-menu-btn');
  await p.click('#set-menu-btn');
  check('the menu says Export all sets', (await text(p, '#menu-export')) === 'Export all sets' && (await text(p, '#export-btn')) === 'Export all sets');
  p.once('dialog', (d) => d.accept('Renamed Alpha'));
  await p.click('#set-rename');
  check('Rename works and is saved', (await text(p, '#set-name')) === 'Renamed Alpha' && (await stored(p))[0].name === 'Renamed Alpha' && !(await vis(p, '#set-menu')));
  await p.click('#menu-export').catch(async () => { await p.click('#set-menu-btn'); await p.click('#menu-export'); });
  check('exporting says all sets were exported', (await text(p, '#backup-status')).startsWith('Exported all 2 set(s)'), await text(p, '#backup-status'));
  await p.click('#set-menu-btn'); p.once('dialog', (d) => d.dismiss()); await p.click('#clear-btn');
  check('clearing asks for confirmation, and cancelling keeps the questions', (await stored(p))[0].questions.length === 6);
  await p.click('#set-menu-btn'); p.once('dialog', (d) => d.accept()); await p.click('#clear-btn');
  check('confirming clears the set', (await stored(p))[0].questions.length === 0 && (await text(p, '#lib-count')).includes('No questions in this set yet'));
  await p.click('#set-menu-btn'); let delMsg = ''; p.once('dialog', async (d) => { delMsg = d.message(); await d.accept(); }); await p.click('#set-delete');
  check('deleting a set asks first and then removes it', delMsg.includes('Delete the set') && (await stored(p)).length === 1);
  await p.click('#set-menu-btn');
  check('the last set cannot be deleted', await p.locator('#set-delete').isDisabled());
  await p.context().close();
}
{
  // Practise this set: opens setup with only that set ticked; no session, no media, no preset change
  const p = await newPage(b, { init: [INIT] });
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('interviewpal.settings') || '{}'); localStorage.setItem('interviewpal.settings', JSON.stringify({ ...s, preset: 'mock', practiceDifficulty: 'hard', showModelAnswer: false, practiceSelfMark: false, mode: 'practice', practiceCount: 4, practiceOrder: 'random', answerMethod: 'type' })); });
  await open(p); // (the saved settings are there before the page loads)
  const before = await settings(p);
  const gum0 = (await stats(p)).gum;
  await sel(p, 'sb');
  await p.click('#practise-set');
  await p.waitForSelector('#setup:not([hidden])');
  const after = await settings(p);
  check('Practise this set opens setup', await vis(p, '#setup') && !(await vis(p, '#interview')));
  check('only that set is ticked', (await p.locator('#set-choices input:checked').count()) === 1 && (await p.locator('#set-choices input:checked').evaluate((e) => e.parentElement.textContent)).includes('Beta'));
  const { practiceSets: _a, activeSetId: _b, ...restBefore } = before; const { practiceSets: _c, activeSetId: _d, ...restAfter } = after;
  check('no other setup choice changed: preset, pressure, reference, feedback, count, order, method', JSON.stringify(restBefore) === JSON.stringify(restAfter), JSON.stringify(restAfter));
  check('the preset is still Mock and the screen shows the saved choices (nothing was applied)', (await p.locator('#preset-mock').isChecked()) && (await p.inputValue('#opt-difficulty')) === 'hard' && (await p.inputValue('#opt-count')) === '4');
  check('no microphone or camera was requested and nothing is recording', (await stats(p)).gum === gum0 && (await stats(p)).live === 0 && (await p.locator('#setup-rec-off').isChecked()));
  check('no session started (the Start button is still there, no interview)', (await vis(p, '#start-btn')) && !(await vis(p, '#interview')));
  await p.context().close();
}

/* ===== 10. Importing notes: preview first, destination fixed, nothing added until Confirm ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await p.click('#import-open');
  check('Import questions opens a panel, separate from the Backup restore, and nothing is added', (await vis(p, '#import-panel')) && (await text(p, '#import-dest')).includes('"Alpha"') && (await stored(p))[0].questions.length === 6);
  await p.setInputFiles('#file-input', NOTES);
  await p.fill('#paste-box', 'Q: How do you delegate?\nA: Already here.\n');
  await p.evaluate(() => { window.__delay = 800; });
  await p.click('#parse-btn');
  check('while reading: the button is off and the status names the destination', (await p.locator('#parse-btn').isDisabled()) && (await text(p, '#load-status')).includes('"Alpha"'));
  await p.evaluate(() => document.getElementById('parse-btn').click());
  await sel(p, 'sb'); // the person opens another set while the notes are being read
  await p.waitForSelector('#import-preview:not([hidden])');
  check('the destination was fixed when Find questions was pressed (Alpha), not the set opened later', (await text(p, '#import-dest')).includes('"Alpha"') && (await text(p, '#import-dest')).includes('fixed when you pressed Find questions'), await text(p, '#import-dest'));
  const items = await p.locator('#import-items li').allInnerTexts();
  check('the preview lists detected questions with their references, and nothing was added yet', items.length === 3 && items[0].includes('What is your management style?') && items[0].includes('Supportive and clear.') && (await stored(p))[0].questions.length === 6 && (await stored(p))[1].questions.length === 2);
  check('a duplicate of an existing question is marked and cannot be selected', items.some((t) => t.includes('Already in this set: not added')) && (await p.locator('#import-items li').filter({ hasText: 'How do you delegate?' }).locator('input').isDisabled()));
  check('the counts and the Confirm button say what will happen', (await text(p, '#import-counts')).includes('3 found') && (await text(p, '#import-counts')).includes('2 selected to add') && (await text(p, '#import-counts')).includes('1 already in "Alpha"') && (await text(p, '#import-counts')).includes('1 not recognised') && (await text(p, '#import-confirm')) === 'Add 2 questions to "Alpha"', await text(p, '#import-counts'));
  check('unrecognised text is shown, with Copy and Use as a question', (await text(p, '#unplaced-list')).includes('stray text') && (await vis(p, '#unplaced-list >> text=Use as a question')) && (await vis(p, '#unplaced-list >> text=Copy')));
  await shot(p, 'library-import-preview', { fullPage: true });
  await p.locator('#import-items li').filter({ hasText: 'How do you give feedback?' }).locator('input').uncheck();
  check('deselecting a question updates the count and the button', (await text(p, '#import-confirm')) === 'Add 1 question to "Alpha"');
  await p.click('#import-none');
  check('Select none disables Confirm', await p.locator('#import-confirm').isDisabled());
  await p.click('#import-all');
  await p.click('#unplaced-list >> text=Use as a question');
  check('"Use as a question" adds the text as one more proposed question (and removes it from the unrecognised list)', (await p.locator('#import-items li').count()) === 4 && !(await vis(p, '#import-unplaced')));
  await p.click('#import-cancel');
  check('Cancel changes nothing, closes the preview, and says so', (await stored(p))[0].questions.length === 6 && !(await vis(p, '#import-panel')) && (await text(p, '#set-status')).includes('Import cancelled'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}
{
  // Confirm: success, rechecked duplicates, repeated clicks, destination deleted, failed save
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await p.click('#import-open'); await p.setInputFiles('#file-input', NOTES); await p.click('#parse-btn'); await p.waitForSelector('#import-preview:not([hidden])');
  // someone adds one of the proposed questions meanwhile
  await p.click('#add-btn'); await p.fill('#q-f-question', 'what is your MANAGEMENT style?'); await p.click('#q-save'); await p.waitForSelector('#q-view:not([hidden])');
  await p.evaluate(() => { const b = document.getElementById('import-confirm'); b.click(); b.click(); b.click(); });
  await p.waitForTimeout(300);
  const st = (await stored(p))[0].questions;
  check('three quick clicks on Confirm add once; the duplicate made meanwhile is rechecked and skipped', st.length === 8 && st.filter((x) => /feedback/i.test(x.question)).length === 1 && st.filter((x) => /management style/i.test(x.question)).length === 1, JSON.stringify(st.map((x) => x.question)));
  check('success is announced only after saving, with what was skipped', (await text(p, '#set-status')).startsWith('Added 1 question to "Alpha".') && (await text(p, '#set-status')).includes('Skipped 1'), await text(p, '#set-status'));
  check('the panel closes and the input boxes are cleared', !(await vis(p, '#import-panel')) && (await p.inputValue('#paste-box')) === '');
  // failed save: nothing added, preview stays, controls work
  await p.click('#import-open'); await p.setInputFiles('#file-input', { name: 'n2.md', mimeType: 'text/markdown', buffer: Buffer.from('Q: A fresh question one?\nA: x\n\nQ: A fresh question two?\nA: y\n') });
  await p.click('#parse-btn'); await p.waitForSelector('#import-preview:not([hidden])');
  await p.evaluate(() => { window.__failSave = true; });
  await p.click('#import-confirm');
  check('a failed save adds nothing, says so, and keeps the preview', (await text(p, '#load-status')).startsWith('Nothing was added: this browser could not store') && (await vis(p, '#import-items')) && (await stored(p))[0].questions.length === 8 && !(await p.locator('#import-confirm').isDisabled()));
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#import-confirm');
  check('confirming again after storage works adds them', (await stored(p))[0].questions.length === 10 && (await text(p, '#set-status')).startsWith('Added 2 questions'));
  // destination deleted before confirm
  await p.context().close();
}
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  p.once('dialog', (d) => d.accept('Short lived'));
  await p.click('#set-new'); // it is now the open set
  await p.click('#import-open'); await p.setInputFiles('#file-input', NOTES); await p.click('#parse-btn'); await p.waitForSelector('#import-preview:not([hidden])');
  // delete the destination set while the preview is up
  await p.click('#set-menu-btn'); p.once('dialog', (d) => d.accept()); await p.click('#set-delete');
  await p.click('#import-confirm');
  const st = await stored(p);
  check('if the destination no longer exists nothing is added anywhere, and the screen explains', st.every((s) => !s.questions.some((x) => /management style/.test(x.question))) && (await text(p, '#load-status')).includes('no longer exists'), await text(p, '#load-status'));
  check('the preview is kept so it can be cancelled, and Cancel still works', await vis(p, '#import-items'));
  await p.click('#import-cancel');
  await p.context().close();
}
{
  // Reading fails: input is kept and controls are restored
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await p.click('#import-open'); await p.setInputFiles('#file-input', NOTES); await p.fill('#paste-box', 'Q: pasted?\nA: yes\n');
  await p.evaluate(() => { window.__failRead = true; });
  await p.click('#parse-btn');
  await p.waitForFunction(() => !document.getElementById('parse-btn').disabled && document.getElementById('load-status').textContent.includes('Problems'));
  check('a file that cannot be read is named, the rest is still previewed, and nothing is added', (await text(p, '#load-status')).includes('disk read failed') && (await p.locator('#import-items li').count()) === 1 && (await stored(p))[0].questions.length === 6);
  check('the input is kept (file and pasted text) until the import is confirmed or closed, and the buttons work', (await p.inputValue('#paste-box')).includes('pasted') && (await p.evaluate(() => document.getElementById('file-input').files.length)) === 1 && !(await p.locator('#parse-btn').isDisabled()));
  await p.click('#import-cancel');
  await p.context().close();
}

/* ===== 11. Backup compatibility ===== */
// Restore a backup file and wait for the message (reading the file is asynchronous)
const restore = async (p, file) => {
  await p.evaluate(() => { document.getElementById('backup-status').textContent = ''; });
  await p.setInputFiles('#import-input', file);
  await p.click('#import-btn');
  await p.waitForFunction(() => document.getElementById('backup-status').textContent.length > 0);
};
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  // build a valid backup by hand: one same-name set (merges), one new set, the same question in two sets
  const backup = { app: 'interviewpal', version: 1, exportedAt: 'x', sets: [
    { name: 'alpha', questions: [{ question: 'HOW do you delegate?', answer: 'dup' }, { question: 'New from backup', answer: 'ok', topic: 'T', level: 'easy' }] },
    { name: 'Gamma', questions: [{ question: 'How do you delegate?', answer: 'same text, other set' }] },
  ] };
  await restore(p, { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  const st = await stored(p);
  check('a valid backup merges same-name sets (case-insensitive), skips within-set duplicates, creates new sets, allows the same question across sets', st.find((s) => s.name === 'Alpha').questions.length === 7 && st.some((s) => s.name === 'Gamma' && s.questions.length === 1) && (await text(p, '#backup-status')).includes('created 1 new set') && (await text(p, '#backup-status')).includes('Skipped 1'), await text(p, '#backup-status'));
  check('existing IDs are untouched', st.find((s) => s.name === 'Alpha').questions.slice(0, 6).map((x) => x.id).join() === 'a1,a2,a3,a4,a5,a6');
  const before = JSON.stringify(await stored(p));
  await restore(p, { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  check('an invalid backup changes nothing and says so', JSON.stringify(await stored(p)) === before && (await text(p, '#backup-status')).startsWith('Import failed. Nothing was changed.'));
  await p.evaluate(() => { window.__failSave = true; });
  await restore(p, { name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'interviewpal', version: 1, sets: [{ name: 'Delta', questions: [{ question: 'D?' }] }] })) });
  check('a backup that cannot be saved leaves the live sets unchanged and says nothing was imported', (await text(p, '#backup-status')).startsWith('Nothing was imported') && !(await p.locator('#set-select option').allInnerTexts()).join().includes('Delta') && JSON.stringify(await stored(p)) === before);
  await p.context().close();
}

/* ===== 12. Old data: questions without IDs are still usable, and History is untouched by editing ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await p.evaluate(() => {
    localStorage.setItem('interviewpal.sets', JSON.stringify({ sets: [{ id: 's1', name: 'Old', questions: [{ question: 'No id question?', answer: 'A' }, { question: 'Another?', answer: '' }] }] }));
    localStorage.setItem('interviewpal.history', JSON.stringify([{ id: 'h1', startedAt: 1, endedAt: 2, durationSec: 1, completed: true, mode: 'practice', difficulty: 'easy', order: 'serial', level: 'all', total: 1, sets: ['Old'], results: [{ question: 'No id question?', answer: 'old answer', skipped: false, timedOut: false, seconds: 5, mark: 'got' }] }]));
  });
  await p.reload(); await tab(p, 'questions');
  const ids2 = await ids(p);
  check('questions that lack an ID get one so they can be selected', ids2.length === 2 && ids2.every(Boolean));
  const histBefore = await p.evaluate(() => localStorage.getItem('interviewpal.history'));
  await rowFor(p, ids2[0]).click(); await p.click('#q-edit'); await p.fill('#q-f-question', 'Reworded question?'); await p.click('#q-save');
  await p.waitForSelector('#q-view:not([hidden])');
  check('editing works on them, and History is not rewritten', (await stored(p))[0].questions[0].question === 'Reworded question?' && (await p.evaluate(() => localStorage.getItem('interviewpal.history'))) === histBefore);
  await p.context().close();
}

/* ===== 13. Keyboard ===== */
{
  const p = await newPage(b, { init: [INIT] });
  await open(p);
  await p.focus('#lib-search');
  for (let i = 0; i < 6 && !(await focusRowId(p)); i++) await p.keyboard.press('Tab');
  const first = await focusRowId(p);
  check('Tab from the filters reaches the first row', first === 'a1', String(first));
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  check('Down arrow moves between rows', (await focusRowId(p)) === 'a3');
  await p.keyboard.press('Enter');
  check('Enter selects the question and moves focus to its heading', (await selectedRow(p)) === 'a3' && (await focusId(p)) === 'q-view-title');
  await p.keyboard.press('Tab');
  check('the next Tab reaches Edit', (await focusId(p)) === 'q-edit');
  await p.keyboard.press('Enter');
  await p.keyboard.type(' (edited by keyboard)');
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  check('the form is reachable in order: question, reference, topic, complexity, then Save', (await focusId(p)) === 'q-save', await focusId(p));
  check('and what was typed is in the question', (await p.inputValue('#q-f-question')).endsWith('(edited by keyboard)'));
  await p.context().close();
}

/* ===== 14. Phone: list first, then detail with Back ===== */
{
  const p = await newPage(b, { init: [INIT], viewport: { width: 390, height: 800 } });
  await open(p);
  check('on a phone the list is shown first and the detail is not', (await vis(p, '#q-list')) && !(await vis(p, '#lib-detail-pane')));
  let o = await p.evaluate(overflow);
  check('no sideways scroll on the phone list', o.sw <= o.cw, JSON.stringify(o));
  await shot(p, 'library-mobile-list', { fullPage: true });
  await pick(p, 'a3');
  check('choosing a question shows the detail alone, with a Back button', (await vis(p, '#lib-detail-pane')) && !(await vis(p, '#q-list')) && (await vis(p, '#q-back')));
  o = await p.evaluate(overflow);
  check('no sideways scroll on the phone detail (long reference)', o.sw <= o.cw, JSON.stringify(o));
  await shot(p, 'library-mobile-detail', { fullPage: true });
  await p.click('#q-back');
  check('Back returns to the list and focuses the question that was open', (await vis(p, '#q-list')) && (await focusRowId(p)) === 'a3');
  await pick(p, 'a1'); await p.click('#q-edit');
  o = await p.evaluate(overflow);
  check('the editor fits the phone width', o.sw <= o.cw, JSON.stringify(o));
  await shot(p, 'library-mobile-editor', { fullPage: true });
  await p.fill('#q-f-topic', 'x'); await p.click('#q-back');
  check('Back with unsaved edits asks first', await vis(p, '#guard-dialog'));
  await p.click('#guard-discard');
  await p.context().close();
}
{
  const ctx = await b.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  await p.addInitScript(INIT);
  await p.goto(process.env.BASE_URL || 'http://localhost:8804/');
  await open(p);
  await pick(p, 'a3');
  const o = await p.evaluate(overflow);
  const a = await p.evaluate(AUDIT);
  check('a 640px window at double scale (what 200% zoom of a 1280px window looks like; emulation, not real zoom): no sideways scroll, readable', o.sw <= o.cw && a.failures.length === 0, JSON.stringify(o) + a.failures.slice(0, 2).join('|'));
  await ctx.close();
}

/* ===== 15. Desktop pictures and every theme ===== */
{
  const p = await newPage(b, { init: [INIT], viewport: { width: 1280, height: 900 } });
  await open(p);
  await pick(p, 'a3'); await p.click('#q-edit'); await p.fill('#q-f-question', LONGQ + ' (editing)');
  await shot(p, 'library-editor');
  await p.click('#q-cancel');
  await p.context().close();
}
for (const id of ['sage', 'teal', 'plum', 'blue']) {
  const p = await newPage(b, { init: [INIT], viewport: { width: 1280, height: 900 } });
  await p.evaluate((t) => localStorage.setItem('interviewpal.settings', JSON.stringify({ theme: t })), id);
  await open(p);
  await pick(p, 'a3'); await p.click('#q-edit'); await p.fill('#q-f-question', ''); await p.click('#q-save'); // an error message on screen
  await p.fill('#q-f-question', 'x'); await p.evaluate(() => { window.__failSave = true; }); await p.click('#q-save'); // the not-saved alert
  await p.evaluate(() => { window.__failSave = false; });
  await p.click('#lib-retry'); await p.waitForSelector('#q-view:not([hidden])');
  await p.click('#q-delete'); // the undo bar
  await p.click('#import-open'); await p.setInputFiles('#file-input', NOTES); await p.click('#parse-btn'); await p.waitForSelector('#import-preview:not([hidden])');
  await p.click('#set-menu-btn');
  const a = await p.evaluate(AUDIT);
  check(`${id}: the library (list, detail, undo bar, import preview, menu) is readable (${a.checked} pieces of text)`, a.failures.length === 0, a.failures.slice(0, 3).join(' | '));
  await p.context().close();
}

console.log(`Screenshots written to ${OUT}`);
await b.close();
process.exit(done() ? 1 : 0);
