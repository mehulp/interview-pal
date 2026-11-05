// Questions screen (the question library): a set selector, a searchable list and the selected question's detail,
// explicit Edit / Save / Cancel, delete with Undo, a notes import with a PREVIEW, and backup export / import.
//
// The rules that keep it honest:
//   - every change is made on a COPY of the sets (src/library.js) and saved first; the live data is replaced only if
//     the save worked, so a failed save never leaves the library half-changed and "Saved" is never shown early;
//   - the selected question is remembered by its stable ID, not by its position;
//   - a draft being edited is guarded: switching question, set, screen, or practising asks Save / Discard / Stay;
//   - everything a person's notes put on screen is set with textContent, never as HTML.
import { parseText, parseFiles } from './parser.js';
import { loadSets, saveSets, loadSettings, saveSettings } from './storage.js';
import { newId, normalize, nameTaken, createSet, describeSkipped, buildExport, parseImport, mergeImport } from './sets.js';
import {
  clone, ensureIds, titleOf, filterQuestions, topicsOf, hasFilters, describeMatches, NO_TOPIC, NOT_TAGGED, LEVEL_LABELS,
  validateDraft, isDirty, withEdit, withAdded, withDeleted, withRestored, moveConflict, withMoved, withClearedSet,
  previewImport, importCounts, commitImport, draftAsText,
} from './library.js';
import { DEMO_EXPORT, DEMO_SET_NAME } from './demoset.js';

const $ = (id) => document.getElementById(id);

let sets = loadSets();
ensureIds(sets); // older saved data may lack IDs; they are kept on the next save
let activeId = sets.some((s) => s.id === loadSettings().activeSetId) ? loadSettings().activeSetId : sets[0].id;
let selectedId = null; // the selected question's ID (never a position)
let mode = 'view'; // 'view' | 'edit' | 'add'
let draft = null; // { question, answer, topic, level } while editing
let filters = { search: '', topic: '', level: '' };
let undo = null; // { removed, label }: the last deleted question
let lastFailure = null; // { retry, text } for the "not saved" message
let importState = null; // { destId, destName, items, unplaced } once notes have been found
let busy = false; // a save or an import commit is running: a second click does nothing

const active = () => sets.find((s) => s.id === activeId);
const selectedQuestion = () => active().questions.find((q) => q.id === selectedId) || null;
const setStatus = (text) => { $('set-status').textContent = text; };

// Small helper to build an element. Text is set with textContent, so file contents can't inject HTML.
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

/* ---------- Saving: copy, save, then replace the live data ---------- */
// Returns true only if the browser really stored the change. The live `sets` is replaced only then.
function commit(next) {
  const ok = saveSets(next.map((s) => ({ ...s, questions: s.questions.filter((q) => String(q.question || '').trim()) })));
  if (ok) { sets = next; hideAlert(); }
  return ok;
}

function showAlert(text, { retry = null, copy = '' } = {}) {
  lastFailure = { retry, text: copy };
  $('lib-alert-text').textContent = text;
  $('lib-retry').hidden = !retry;
  $('lib-copy').hidden = !copy;
  $('lib-download').hidden = !copy;
  $('lib-copy-box').hidden = true;
  $('lib-alert').hidden = false;
}
function hideAlert() { lastFailure = null; $('lib-alert').hidden = true; $('lib-copy-box').hidden = true; }

$('lib-retry').addEventListener('click', () => { if (lastFailure?.retry) lastFailure.retry(); });
$('lib-copy').addEventListener('click', async () => {
  const text = lastFailure?.text || '';
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Copied the unsaved text.');
  } catch {
    // No clipboard access: show it in a box to select and copy by hand
    $('lib-copy-box').value = text; $('lib-copy-box').hidden = false; $('lib-copy-box').focus(); $('lib-copy-box').select();
    setStatus('Copying was not allowed here. The text is in the box: select it and copy it yourself.');
  }
});
$('lib-download').addEventListener('click', () => {
  const blob = new Blob([lastFailure?.text || ''], { type: 'text/plain' });
  const link = el('a', { href: URL.createObjectURL(blob), download: 'interviewpal-unsaved-question.txt' });
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus('Download started. Check your Downloads folder.');
});

/* ---------- Guarding unsaved edits ---------- */
const savedOf = () => (mode === 'edit' ? selectedQuestion() : null);
const editing = () => mode !== 'view' && draft !== null;
const dirty = () => editing() && isDirty(draft, savedOf());

function askGuard(text) {
  const dialog = $('guard-dialog');
  $('guard-text').textContent = text;
  return new Promise((resolve) => {
    const done = (answer) => { dialog.close(); cleanup(); resolve(answer); };
    const onSave = () => done('save'); const onDiscard = () => done('discard'); const onStay = () => done('stay');
    const onCancel = (e) => { e.preventDefault(); done('stay'); }; // Escape
    const cleanup = () => {
      $('guard-save').removeEventListener('click', onSave); $('guard-discard').removeEventListener('click', onDiscard);
      $('guard-stay').removeEventListener('click', onStay); dialog.removeEventListener('cancel', onCancel);
    };
    $('guard-save').addEventListener('click', onSave); $('guard-discard').addEventListener('click', onDiscard);
    $('guard-stay').addEventListener('click', onStay); dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
    $('guard-save').focus();
  });
}

// Resolves true if it is fine to go somewhere else (nothing unsaved, or it was saved, or it was discarded).
// A failed Save, or Stay, resolves false: the person is not taken away from their draft.
async function guardEdits(what) {
  if (!editing()) return true;
  if (!dirty()) { endEdit(); return true; } // opened but unchanged: nothing to lose
  const choice = await askGuard(`You have unsaved changes to this question. Save them before ${what}, or discard them?`);
  if (choice === 'stay') return false;
  if (choice === 'discard') { endEdit(); return true; }
  return saveDraft();
}
window.addEventListener('beforeunload', (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });

function endEdit() { mode = 'view'; draft = null; $('q-f-error').hidden = true; }

/* ---------- Drawing the screen ---------- */
const visibleQuestions = () => filterQuestions(active().questions, filters);
const levelOf = (q) => LEVEL_LABELS[q.level === 'easy' || q.level === 'hard' ? q.level : ''];
const hasReference = (q) => Boolean((q.answer || '').trim());

function renderHeader() {
  $('set-select').replaceChildren(...sets.map((s) =>
    el('option', { value: s.id, textContent: `${s.name} (${s.questions.length})`, selected: s.id === activeId })));
  $('set-name').textContent = active().name;
  $('pair-count').textContent = `(${active().questions.length})`;
  $('practise-set').disabled = !active().questions.length;
  $('set-delete').disabled = sets.length === 1;
}

function renderFilters() {
  const topics = topicsOf(active().questions);
  const keep = filters.topic;
  $('lib-topic').replaceChildren(
    el('option', { value: '', textContent: 'All topics' }),
    el('option', { value: NO_TOPIC, textContent: 'No topic' }),
    ...topics.map((t) => el('option', { value: t, textContent: t })),
  );
  // A topic that no longer exists (its last question was edited) falls back to "All topics"
  filters.topic = keep === '' || keep === NO_TOPIC || topics.includes(keep) ? keep : '';
  $('lib-topic').value = filters.topic;
  $('lib-level').value = filters.level;
  $('lib-search').value = filters.search;
}

function renderList() {
  const set = active();
  const shown = visibleQuestions();
  const filtered = hasFilters(filters);
  $('lib-count').textContent = describeMatches({ total: set.questions.length, shown: shown.length, filtered });
  $('lib-clear').hidden = !filtered;
  const rows = shown.map((q) => {
    const row = el('button', { type: 'button', className: 'q-row', textContent: '' });
    row.dataset.id = q.id;
    if (q.id === selectedId) row.setAttribute('aria-current', 'true');
    row.append(
      el('span', { className: 'q-row-title', textContent: titleOf(q) }),
      el('span', { className: 'q-row-meta', textContent: [q.topic?.trim() || 'No topic', levelOf(q), hasReference(q) ? 'Reference answer' : 'No reference'].join(' · ') }),
    );
    return el('li', {}, [row]);
  });
  if (mode === 'add') {
    const row = el('button', { type: 'button', className: 'q-row', textContent: '' });
    row.setAttribute('aria-current', 'true');
    row.append(el('span', { className: 'q-row-title', textContent: titleOf({ question: draft?.question }) || 'New question (not saved yet)' }), el('span', { className: 'q-row-meta', textContent: 'Draft · not saved' }));
    rows.unshift(el('li', {}, [row]));
  }
  $('q-list').replaceChildren(...rows);
  if (!set.questions.length && mode !== 'add') {
    $('q-list').append(el('li', { className: 'hint', textContent: 'No questions in this set yet. Add one, or import your notes.' }));
  }
}

function renderDetail() {
  const q = selectedQuestion();
  const showForm = editing();
  const showView = !showForm && Boolean(q);
  $('q-empty').hidden = showForm || showView;
  $('q-view').hidden = !showView;
  $('q-form').hidden = !showForm;
  if (showView) {
    $('q-view-title').textContent = q.question;
    $('q-view-meta').textContent = [q.topic?.trim() ? `Topic: ${q.topic.trim()}` : 'No topic', `Complexity: ${levelOf(q)}`, hasReference(q) ? 'Has a reference answer' : 'No reference answer'].join(' · ');
    $('q-view-answer').textContent = hasReference(q) ? q.answer : 'No reference answer saved for this question. Edit it to add one.';
    $('q-view-answer').classList.toggle('empty', !hasReference(q));
    const others = sets.filter((s) => s.id !== activeId);
    $('q-move-row').hidden = !others.length;
    $('q-move').replaceChildren(el('option', { value: '', textContent: 'Choose a set…' }), ...others.map((s) => el('option', { value: s.id, textContent: s.name })));
  }
  if (showForm) {
    $('q-form-title').textContent = mode === 'add' ? 'New question' : 'Edit question';
    // Fields are filled when editing starts (see beginEdit), not here, so typing is never overwritten by a redraw
    $('q-form-hidden').hidden = !(mode === 'edit' && !visibleQuestions().some((x) => x.id === selectedId));
  }
}

function render() {
  renderHeader();
  renderFilters();
  renderList();
  renderDetail();
  if (!selectedId && mode !== 'add') showPane('list'); // nothing selected: the list is what to show on a phone
  renderImport();
  renderDemo();
  renderUndo();
}

function showPane(view) { $('lib-body').dataset.view = view; }

function fillForm() {
  $('q-f-question').value = draft.question;
  $('q-f-answer').value = draft.answer;
  $('q-f-topic').value = draft.topic;
  $('q-f-level').value = draft.level || '';
  $('q-f-error').hidden = true;
  $('q-f-question').removeAttribute('aria-invalid');
}

/* ---------- Choosing, editing, adding ---------- */
function focusRow(id) {
  const row = id ? $('q-list').querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
  (row || $('lib-search')).focus();
}

async function selectQuestion(id) {
  if (id === selectedId && mode === 'view') { showPane('detail'); $('q-view-title').focus(); return; }
  if (!(await guardEdits('opening another question'))) return;
  mode = 'view'; draft = null;
  selectedId = id;
  render();
  showPane('detail');
  $('q-view-title').focus();
}

$('q-list').addEventListener('click', (event) => {
  const row = event.target.closest('.q-row');
  if (row?.dataset.id) selectQuestion(row.dataset.id);
});
// Up and Down move between rows
$('q-list').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...$('q-list').querySelectorAll('.q-row')];
  const at = rows.indexOf(document.activeElement);
  if (at === -1) return;
  event.preventDefault();
  rows[Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
});

$('q-back').addEventListener('click', async () => {
  if (!(await guardEdits('going back'))) return;
  const id = selectedId;
  mode = 'view'; draft = null;
  showPane('list');
  render();
  focusRow(id);
});

function beginEdit() {
  const q = selectedQuestion();
  if (!q) return;
  mode = 'edit';
  draft = { question: q.question, answer: q.answer || '', topic: q.topic || '', level: q.level || '' };
  renderDetail(); renderList();
  fillForm();
  showPane('detail');
  $('q-f-question').focus();
}
$('q-edit').addEventListener('click', beginEdit);

$('add-btn').addEventListener('click', async () => {
  if (!(await guardEdits('adding a question'))) return;
  closeMenu();
  filters = { search: '', topic: '', level: '' }; // so the new question will be visible once saved
  selectedId = newId();
  mode = 'add';
  draft = { question: '', answer: '', topic: '', level: '' };
  render();
  fillForm();
  showPane('detail');
  setStatus('');
  $('q-f-question').focus();
});

// Typing updates the draft only. Nothing is saved until Save.
for (const [id, key] of [['q-f-question', 'question'], ['q-f-answer', 'answer'], ['q-f-topic', 'topic'], ['q-f-level', 'level']]) {
  $(id).addEventListener('input', () => {
    if (!draft) return;
    draft[key] = $(id).value;
    if (key === 'question') {
      $('q-f-error').hidden = true; $('q-f-question').removeAttribute('aria-invalid');
      if (mode === 'add') renderList();
    }
  });
  $(id).addEventListener('change', () => { if (draft) draft[key] = $(id).value; });
}

// Save the draft. Returns true if it was really stored.
async function saveDraft() {
  if (!editing() || busy) return false;
  const check = validateDraft(draft, active(), mode === 'edit' ? selectedId : null);
  if (!check.ok) {
    $('q-f-error').textContent = check.message; $('q-f-error').hidden = false;
    $('q-f-question').setAttribute('aria-invalid', 'true');
    $('q-f-question').focus();
    return false;
  }
  busy = true;
  try {
    const wasEdit = mode === 'edit';
    const before = wasEdit ? selectedQuestion() : null;
    const next = wasEdit ? withEdit(sets, activeId, selectedId, draft) : withAdded(sets, activeId, draft, selectedId);
    if (!next) {
      showAlert('This question or set no longer exists, so the changes could not be saved. Copy your text below if you want to keep it.', { copy: draftAsText(draft) });
      return false;
    }
    if (!commit(next)) {
      showAlert('Not saved: this browser could not store your changes (storage may be blocked or full). Your draft is still here and nothing was changed. Try again, or copy or download the text to keep it.', { retry: () => saveDraft(), copy: draftAsText(draft) });
      $('q-save').focus();
      return false;
    }
    const renamed = wasEdit && before && normalize(before.question) !== normalize(draft.question);
    endEdit();
    render();
    setStatus(`Saved. ${wasEdit ? 'Your changes are' : 'The new question is'} kept in this browser.${renamed ? ' Recordings saved under the old wording stay saved, but may not show under this question any more.' : ''}`);
    $('q-view-title').focus();
    return true;
  } finally {
    busy = false;
  }
}
$('q-form').addEventListener('submit', (event) => { event.preventDefault(); saveDraft(); });

$('q-cancel').addEventListener('click', () => {
  const wasAdd = mode === 'add';
  endEdit();
  hideAlert();
  if (wasAdd) selectedId = null;
  render();
  setStatus('Cancelled. Nothing was changed.');
  if (wasAdd) { showPane('list'); $('add-btn').focus(); } else $('q-edit').focus(); // the saved version is back
});

/* ---------- Delete (with Undo) and move ---------- */
function neighbourId(deletedId) {
  const rows = visibleQuestions();
  const at = rows.findIndex((q) => q.id === deletedId);
  return (rows[at + 1] || rows[at - 1] || {}).id || null;
}

function deleteSelected() {
  const q = selectedQuestion();
  if (!q || busy) return;
  const result = withDeleted(sets, activeId, selectedId);
  if (!result) return;
  const neighbour = neighbourId(selectedId);
  if (!commit(result.sets)) {
    showAlert('Not deleted: this browser could not store the change, so the question is still here. Try again.', { retry: deleteSelected });
    return;
  }
  undo = { removed: result.removed, label: titleOf(q, 60) };
  selectedId = neighbour;
  mode = 'view'; draft = null;
  render();
  setStatus('');
  showPane('list');
  focusRow(selectedId);
}
$('q-delete').addEventListener('click', deleteSelected);

function renderUndo() {
  $('undo-bar').hidden = !undo;
  if (undo) $('undo-text').textContent = `Deleted "${undo.label}".`;
}

function undoDelete() {
  if (!undo || busy) return;
  const result = withRestored(sets, undo.removed);
  if (result.error) {
    const why = { 'set-gone': 'its set no longer exists', duplicate: 'the set now has a question with the same text', exists: 'it is already back' }[result.error];
    setStatus(`Could not undo: ${why}.`);
    if (result.error !== 'set-gone') { /* the question stays deleted; the bar stays so the person can try again after changing things */ }
    return;
  }
  if (!commit(result.sets)) {
    showAlert('Undo failed: this browser could not store the change. The question is still deleted, and Undo is still available. Try again.', { retry: undoDelete });
    return;
  }
  const id = undo.removed.question.id;
  undo = null;
  selectedId = id;
  mode = 'view'; draft = null;
  render();
  setStatus('Restored the question where it was.');
  showPane('detail');
  focusRow(id);
}
$('undo-btn').addEventListener('click', undoDelete);

$('q-move').addEventListener('change', async () => {
  const toId = $('q-move').value;
  if (!toId || !selectedQuestion()) return;
  const target = sets.find((s) => s.id === toId);
  const conflict = moveConflict(sets, activeId, selectedId, toId);
  if (conflict && !window.confirm(`"${target.name}" already has this question. If you continue, the copy in "${target.name}" is kept exactly as it is, and this one is only removed from "${active().name}". Continue?`)) {
    $('q-move').value = '';
    return;
  }
  const neighbour = neighbourId(selectedId);
  const moved = withMoved(sets, activeId, selectedId, toId);
  if (!moved) return;
  if (!commit(moved.sets)) {
    $('q-move').value = '';
    showAlert('Not moved: this browser could not store the change, so the question is still where it was.', { retry: () => { $('q-move').value = toId; $('q-move').dispatchEvent(new Event('change')); } });
    return;
  }
  selectedId = neighbour;
  render();
  setStatus(moved.result === 'merged'
    ? `"${target.name}" already had that question, so it was only removed from here. The copy in "${target.name}" is unchanged.`
    : `Moved one question to "${target.name}".`);
  showPane('list');
  focusRow(selectedId);
});

/* ---------- Search and filters ---------- */
function filtersChanged() {
  // If the selected question is now hidden: a question being edited stays open (its draft is kept); one only being
  // viewed is deselected. Focus stays in the control being used.
  const hidden = selectedId && !visibleQuestions().some((q) => q.id === selectedId);
  if (hidden && mode === 'view') selectedId = null;
  renderList();
  renderDetail();
}
$('lib-search').addEventListener('input', () => { filters.search = $('lib-search').value; filtersChanged(); });
$('lib-topic').addEventListener('change', () => { filters.topic = $('lib-topic').value; filtersChanged(); });
$('lib-level').addEventListener('change', () => { filters.level = $('lib-level').value; filtersChanged(); });
$('lib-clear').addEventListener('click', () => {
  filters = { search: '', topic: '', level: '' };
  $('lib-search').value = ''; $('lib-topic').value = ''; $('lib-level').value = '';
  filtersChanged();
  $('lib-search').focus();
});

/* ---------- Sets ---------- */
function openSet(id) {
  activeId = id;
  selectedId = null; mode = 'view'; draft = null; undo = null;
  filters = { search: '', topic: '', level: '' };
  importState = importState && importState.destId === id ? importState : null;
  saveSettings({ activeSetId: id });
}

// Ask for a set name. Returns the name, or '' if cancelled or not allowed (a message is shown).
function askSetName(message, current = '', exceptId) {
  const name = (window.prompt(message, current) || '').trim();
  if (!name) return '';
  if (nameTaken(sets, name, exceptId)) { setStatus(`There is already a set called "${name}".`); return ''; }
  return name;
}

$('set-select').addEventListener('change', async () => {
  const wanted = $('set-select').value;
  if (!(await guardEdits('opening another set'))) { $('set-select').value = activeId; return; }
  openSet(wanted);
  setStatus('');
  render();
  showPane('list');
});

$('set-new').addEventListener('click', async () => {
  if (!(await guardEdits('creating a set'))) return;
  const name = askSetName('Name for the new set (for example Leadership):');
  if (!name) return;
  const set = createSet(name);
  if (!commit([...clone(sets), set])) { showAlert(`Not created: this browser could not store the new set "${name}".`); return; }
  openSet(set.id);
  setStatus(`Created "${name}".`);
  render();
});

// ---- the Set actions menu ----
function closeMenu({ focus = false } = {}) {
  $('set-menu').hidden = true;
  $('set-menu-btn').setAttribute('aria-expanded', 'false');
  if (focus) $('set-menu-btn').focus();
}
$('set-menu-btn').addEventListener('click', () => {
  const open = $('set-menu').hidden;
  $('set-menu').hidden = !open;
  $('set-menu-btn').setAttribute('aria-expanded', String(open));
  if (open) $('set-menu').querySelector('button:not(:disabled)').focus();
});
$('set-menu').addEventListener('keydown', (event) => {
  const items = [...$('set-menu').querySelectorAll('button:not(:disabled)')];
  const at = items.indexOf(document.activeElement);
  if (event.key === 'Escape') { event.preventDefault(); closeMenu({ focus: true }); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); items[(at + 1) % items.length].focus(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
  else if (event.key === 'Tab') closeMenu();
});
document.addEventListener('click', (event) => { if (!event.target.closest('.menu-wrap')) closeMenu(); });

$('set-rename').addEventListener('click', async () => {
  closeMenu();
  const name = askSetName('New name for this set:', active().name, activeId);
  if (!name) { $('set-menu-btn').focus(); return; }
  const next = clone(sets); next.find((s) => s.id === activeId).name = name;
  if (!commit(next)) { showAlert(`Not renamed: this browser could not store the change.`); return; }
  setStatus(`Renamed to "${name}".`);
  render();
  $('set-menu-btn').focus();
});

$('set-delete').addEventListener('click', async () => {
  closeMenu();
  const set = active();
  if (sets.length === 1) { setStatus('You need at least one set, so this one cannot be deleted.'); return; }
  if (!(await guardEdits('deleting this set'))) return;
  if (!window.confirm(`Delete the set "${set.name}" and its ${set.questions.length} question(s)? This cannot be undone.`)) return;
  const next = sets.filter((s) => s.id !== set.id);
  if (!commit(clone(next))) { showAlert(`Not deleted: this browser could not store the change, so "${set.name}" is still here.`); return; }
  openSet(sets[0].id);
  setStatus(`Deleted "${set.name}".`);
  render();
  $('set-select').focus();
});

$('clear-btn').addEventListener('click', async () => {
  closeMenu();
  const set = active();
  if (!set.questions.length) { setStatus('This set has no questions to clear.'); return; }
  if (!(await guardEdits('clearing this set'))) return;
  if (!window.confirm(`Delete all ${set.questions.length} question(s) in "${set.name}"? This cannot be undone.`)) return;
  const next = withClearedSet(sets, activeId);
  if (!commit(next)) { showAlert(`Not cleared: this browser could not store the change, so the questions are still here.`); return; }
  selectedId = null; undo = null;
  render();
  setStatus(`Cleared "${set.name}".`);
  $('add-btn').focus();
});

$('menu-export').addEventListener('click', () => { closeMenu(); exportAll(); });

// Practise this set: open setup with only this set ticked. It starts nothing, asks for no device, changes no preset.
$('practise-set').addEventListener('click', async () => {
  if (!(await guardEdits('going to the Interview tab'))) return;
  saveSettings({ practiceSets: [activeId] }); // the one thing that changes: which set is ticked
  document.querySelector('.tabs [data-screen="practice"]').click();
});

/* ---------- Importing notes, with a preview ---------- */
let reading = false; // notes are being read: a second click does nothing

function renderImport() {
  const open = $('import-open').getAttribute('aria-expanded') === 'true';
  $('import-panel').hidden = !open;
  if (!open) return;
  const locked = Boolean(importState);
  const destName = importState ? importState.destName : active().name;
  $('import-dest').textContent = `Questions will be added to: "${destName}"${locked ? ' (fixed when you pressed Find questions)' : ''}.`;
  $('import-input-stage').hidden = locked;
  $('import-preview').hidden = !locked;
  if (!locked) return;
  const { items, unplaced } = importState;
  const counts = importCounts(items);
  $('import-counts').textContent = [
    `${counts.found} found`, `${counts.selected} selected to add`,
    counts.existing ? `${counts.existing} already in "${destName}"` : '', counts.repeated ? `${counts.repeated} repeated in these notes` : '',
    unplaced.length ? `${unplaced.length} not recognised` : '',
  ].filter(Boolean).join(' · ');
  $('import-confirm').textContent = `Add ${counts.selected} question${counts.selected === 1 ? '' : 's'} to "${destName}"`;
  $('import-confirm').disabled = !counts.selected || importState.committing;
  $('import-items').replaceChildren(...items.map((item) => {
    const box = el('input', { type: 'checkbox', checked: item.selected, disabled: item.status !== 'new' });
    box.addEventListener('change', () => { item.selected = box.checked; renderImport(); });
    const badge = { new: '', existing: 'Already in this set: not added', repeated: 'Repeated in these notes: not added', empty: 'Empty: not added' }[item.status];
    return el('li', { className: `import-item${item.status === 'new' ? '' : ' skipped'}` }, [
      el('label', {}, [
        box,
        el('span', { className: 'import-q' }, [
          el('strong', { textContent: item.question || '(empty)' }),
          ...(item.answer ? [el('span', { className: 'import-a', textContent: item.answer.length > 160 ? `${item.answer.slice(0, 159)}…` : item.answer })] : [el('span', { className: 'import-a', textContent: 'No reference answer found' })]),
          el('span', { className: 'import-meta', textContent: [item.topic || 'No topic', LEVEL_LABELS[item.level]].join(' · ') + (badge ? ` · ${badge}` : '') }),
        ]),
      ]),
    ]);
  }));
  $('import-unplaced').hidden = !unplaced.length;
  $('unplaced-list').replaceChildren(...unplaced.map((text) => {
    const useBtn = el('button', { type: 'button', className: 'small', textContent: 'Use as a question' });
    const copyBtn = el('button', { type: 'button', className: 'small', textContent: 'Copy' });
    useBtn.addEventListener('click', () => {
      // Add the text as one more proposed question (checked like any new one), keeping the earlier choices
      const old = importState.items;
      const fresh = previewImport(sets, importState.destId, [...old, { question: text }]);
      importState.items = fresh.map((n, i) => (old[i] ? { ...n, selected: old[i].selected && n.status === 'new' } : n));
      importState.unplaced = importState.unplaced.filter((t) => t !== text);
      renderImport();
    });
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); $('load-status').textContent = 'Copied.'; } catch { $('load-status').textContent = 'Copying was not allowed here: select the text and copy it yourself.'; }
    });
    return el('div', { className: 'unplaced-card' }, [el('pre', { textContent: text }), el('div', { className: 'pair-head' }, [useBtn, copyBtn])]);
  }));
}

$('import-open').addEventListener('click', () => {
  const open = $('import-open').getAttribute('aria-expanded') !== 'true';
  $('import-open').setAttribute('aria-expanded', String(open));
  renderImport();
  if (open) $('import-title').focus();
});
function closeImport() {
  importState = null;
  $('import-open').setAttribute('aria-expanded', 'false');
  $('load-status').textContent = '';
  renderImport();
}
$('import-close').addEventListener('click', () => { closeImport(); $('import-open').focus(); });
$('import-cancel').addEventListener('click', () => {
  closeImport(); // nothing was added, and the notes are cleared with the preview
  setStatus('Import cancelled. Nothing was added.');
  $('import-open').focus();
});
$('import-all').addEventListener('click', () => { importState.items.forEach((i) => { i.selected = i.status === 'new'; }); renderImport(); });
$('import-none').addEventListener('click', () => { importState.items.forEach((i) => { i.selected = false; }); renderImport(); });

$('parse-btn').addEventListener('click', async () => {
  if (reading || importState) return;
  const files = [...$('file-input').files];
  const pasted = $('paste-box').value.trim();
  if (!files.length && !pasted) { $('load-status').textContent = 'Choose a file or paste some text first.'; return; }
  // The destination is fixed NOW. Reading can take a while, and opening another set meanwhile must not redirect the notes.
  const destId = activeId;
  const destName = active().name;
  reading = true;
  $('parse-btn').disabled = true;
  $('load-status').textContent = `Reading… The questions will be offered for "${destName}".`;
  try {
    const result = await parseFiles(files);
    if (pasted) {
      const found = parseText(pasted);
      result.pairs.push(...found.pairs);
      result.unplaced.push(...found.unplaced);
    }
    if (!sets.some((s) => s.id === destId)) {
      $('load-status').textContent = `The set "${destName}" was deleted while the notes were being read, so nothing can be added. Your notes are still in the boxes: pick a set and press Find questions again.`;
      return;
    }
    importState = { destId, destName, items: previewImport(sets, destId, result.pairs), unplaced: result.unplaced, committing: false };
    const problems = result.errors.length ? ` Problems: ${result.errors.join(' ')}` : '';
    $('load-status').textContent = `Nothing has been added yet. Look through what was found, then confirm.${problems}`;
    renderImport();
    $('import-title').focus();
  } catch (err) {
    $('load-status').textContent = `Reading the notes failed (${err?.message || 'unknown problem'}), so nothing was added. Your notes are still there: try again.`;
  } finally {
    reading = false; // on success, failure and early return alike
    $('parse-btn').disabled = false;
  }
});

$('import-confirm').addEventListener('click', () => {
  if (!importState || importState.committing || busy) return; // a second click does nothing
  const state = importState;
  state.committing = true;
  renderImport();
  try {
    // The destination must still exist, and duplicates are checked again against the data as it is NOW
    const result = commitImport(sets, state.destId, state.items);
    if (result.error === 'set-gone') {
      $('load-status').textContent = `The set "${state.destName}" no longer exists, so nothing was added. Your preview is kept: cancel it, then choose a set and find the questions again.`;
      return;
    }
    if (!commit(result.sets)) {
      $('load-status').textContent = 'Nothing was added: this browser could not store the questions (storage may be blocked or full). Your preview is still here: try again.';
      return;
    }
    const skipped = describeSkipped(result.skipped);
    const msg = `Added ${result.added} question${result.added === 1 ? '' : 's'} to "${state.destName}".${skipped ? ` ${skipped}` : ''}`;
    importState = null;
    $('file-input').value = ''; $('paste-box').value = '';
    $('import-open').setAttribute('aria-expanded', 'false');
    if (state.destId === activeId) render(); else { renderHeader(); renderImport(); }
    setStatus(msg);
    $('set-status').scrollIntoView?.({ block: 'nearest' });
    $('add-btn').focus();
  } finally {
    state.committing = false;
    if (importState) renderImport();
  }
});

/* ---------- Backup: export all sets, restore from a file ---------- */
function exportAll() {
  const clean = sets.map((s) => ({ ...s, questions: s.questions.filter((q) => q.question.trim()) }));
  const blob = new Blob([JSON.stringify(buildExport(clean), null, 2)], { type: 'application/json' });
  const link = el('a', { href: URL.createObjectURL(blob), download: `interviewpal-sets-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  URL.revokeObjectURL(link.href);
  const total = clean.reduce((n, s) => n + s.questions.length, 0);
  $('backup-status').textContent = `Exported all ${clean.length} set(s) with ${total} question(s). Check your Downloads folder.`;
}
$('export-btn').addEventListener('click', exportAll);

$('import-btn').addEventListener('click', async () => {
  const file = $('import-input').files[0];
  const status = $('backup-status');
  if (!file) { status.textContent = 'Choose a sets file first.'; return; }
  try {
    const imported = parseImport(await file.text()); // throws a plain message if the file is not valid: nothing has changed yet
    const next = clone(sets);
    const { added, skipped, created } = mergeImport(next, imported);
    if (!commit(next)) { status.textContent = 'Nothing was imported: this browser could not store the sets (storage may be blocked or full). Your existing sets are unchanged.'; return; }
    ensureIds(sets);
    render();
    status.textContent = [`Imported ${added} question(s)` + (created ? `, created ${created} new set(s).` : '.'), describeSkipped(skipped)].filter(Boolean).join(' ');
  } catch (err) {
    status.textContent = `Import failed. Nothing was changed. ${err.message}`;
  }
  $('import-input').value = '';
});

/* ---------- Demo questions ---------- */
const demoSet = () => sets.find((s) => s.name === DEMO_SET_NAME);
let demoResult = null; // { added, skipped, saved } right after the button was pressed, so the confirmation stays visible

function renderDemo() {
  const demo = demoSet();
  const confirming = demoResult !== null;
  $('demo-card').hidden = Boolean(demo) && !confirming;
  $('demo-intro').hidden = confirming;
  $('demo-done').hidden = !confirming;
  $('demo-note').hidden = !demo || confirming;
  if (demo && !confirming) $('demo-note').textContent = `The demo set "${demo.name}" is already added (${demo.questions.length} question(s)).`;
  if (confirming) {
    const { added, skipped } = demoResult;
    $('demo-status').textContent = !demoResult.saved
      ? 'Nothing was added: this browser could not store the demo questions. Your sets are unchanged.'
      : added
        ? `Added ${added} question(s) to "${DEMO_SET_NAME}". The set you had open has not changed. ${describeSkipped(skipped)}`.trim()
        : `Nothing was added. ${describeSkipped(skipped)}`.trim();
    $('demo-open').hidden = !demo || !demoResult.saved;
  }
}

// The same check-and-merge as a file import, on a copy that is kept only if it saves. The open set is not changed.
$('demo-btn').addEventListener('click', () => {
  const next = clone(sets);
  const { added, skipped } = mergeImport(next, parseImport(JSON.stringify(DEMO_EXPORT)));
  const demo = next.find((s) => s.name === DEMO_SET_NAME);
  if (demo && !demo.questions.length) next.splice(next.indexOf(demo), 1); // nothing to show: do not leave an empty set behind
  const saved = commit(next);
  demoResult = { added: saved ? added : 0, skipped, saved };
  render();
});

$('demo-open').addEventListener('click', async () => {
  const demo = demoSet();
  if (!(await guardEdits('opening the demo set'))) return;
  demoResult = null;
  if (demo) openSet(demo.id);
  render();
});

/* ---------- Called by the app shell ---------- */
// Called BEFORE leaving the Questions tab (including to start practising). Resolves true if it is fine to go.
export async function requestLeaveQuestions() {
  closeMenu();
  const ok = await guardEdits('leaving this tab');
  if (ok) { undo = null; renderUndo(); }
  return ok;
}

render();
