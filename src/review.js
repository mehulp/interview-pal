// Questions screen: pick a set, load notes into it, then edit, add, move and delete questions.
// Also backup: export all sets to a file, or import them from one.
// Everything is saved in this browser after every change.
import { parseText, parseFiles } from './parser.js';
import { loadSets, saveSets, loadSettings, saveSettings } from './storage.js';
import {
  newId, createSet, nameTaken, addQuestions, moveQuestion, describeSkipped,
  buildExport, parseImport, mergeImport,
} from './sets.js';
import { DEMO_EXPORT, DEMO_SET_NAME } from './demoset.js';

const $ = (id) => document.getElementById(id);
const fileInput = $('file-input');
const pasteBox = $('paste-box');
const loadStatus = $('load-status');
const pairsList = $('pairs-list');
const unplacedList = $('unplaced-list');
const unplacedSection = $('unplaced-section');
const setSelect = $('set-select');
const setStatus = $('set-status');
const backupStatus = $('backup-status');

let sets = loadSets();
let activeId = sets.some((s) => s.id === loadSettings().activeSetId) ? loadSettings().activeSetId : sets[0].id;
let unplaced = []; // text the parser could not place (not saved)

const active = () => sets.find((s) => s.id === activeId);

// Save the sets. Questions with an empty question text are not kept.
function save() {
  saveSets(sets.map((s) => ({ ...s, questions: s.questions.filter((q) => q.question.trim()) })));
}

function openSet(id) {
  activeId = id;
  unplaced = [];
  saveSettings({ activeSetId: id });
}

/* ---------- Drawing the screen ---------- */

// Small helper to build an element. Text is set with textContent, so file contents can't inject HTML.
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

// A labelled input (textarea, text box or select) bound to one field of a question.
function field(label, control, pair, key) {
  control.value = pair[key] || '';
  control.addEventListener('input', () => { pair[key] = control.value; save(); });
  control.addEventListener('change', () => { pair[key] = control.value; save(); });
  return el('label', { className: 'field' }, [label, control]);
}

// "Move to set" drop-down: moving takes the question out of this set and into another.
function moveControl(pair) {
  const select = el('select', {}, [
    el('option', { value: '', textContent: 'Move to set…' }),
    ...sets.filter((s) => s.id !== activeId).map((s) => el('option', { value: s.id, textContent: s.name })),
  ]);
  select.addEventListener('change', () => {
    if (!select.value) return;
    const target = sets.find((s) => s.id === select.value);
    const result = moveQuestion(sets, activeId, pair.id, select.value);
    if (result) {
      setStatus.textContent = result === 'merged'
        ? `"${target.name}" already had that question, so it was only removed from here. The copy in "${target.name}" is unchanged.`
        : `Moved one question to "${target.name}".`;
      save();
      render();
    }
  });
  return el('label', { className: 'field pair-move' }, ['Set', select]);
}

function pairCard(pair, index) {
  const levelSelect = el('select', {}, [
    el('option', { value: '', textContent: 'Not tagged' }),
    el('option', { value: 'easy', textContent: 'Easy' }),
    el('option', { value: 'hard', textContent: 'Hard' }),
  ]);
  const del = el('button', { type: 'button', className: 'small danger', textContent: 'Delete' });
  del.setAttribute('aria-label', `Delete question ${index + 1}`);
  del.addEventListener('click', () => {
    active().questions = active().questions.filter((p) => p !== pair);
    save();
    render();
  });

  return el('article', { className: 'pair-card' }, [
    el('div', { className: 'pair-head' }, [el('strong', { textContent: `#${index + 1}` }), del]),
    field('Question', el('textarea', { rows: 2 }), pair, 'question'),
    field('Reference answer (optional)', el('textarea', { rows: 3 }), pair, 'answer'),
    el('div', { className: 'pair-meta' }, [
      field('Topic', el('input', { type: 'text' }), pair, 'topic'),
      field('Level', levelSelect, pair, 'level'),
    ]),
    ...(sets.length > 1 ? [moveControl(pair)] : []),
  ]);
}

function unplacedCard(text) {
  const useBtn = el('button', { type: 'button', className: 'small', textContent: 'Use as a question' });
  const dropBtn = el('button', { type: 'button', className: 'small danger', textContent: 'Delete' });
  useBtn.addEventListener('click', () => {
    const { skipped } = addQuestions(sets, activeId, [{ question: text }]);
    loadStatus.textContent = describeSkipped(skipped);
    unplaced = unplaced.filter((t) => t !== text);
    save();
    render();
  });
  dropBtn.addEventListener('click', () => {
    unplaced = unplaced.filter((t) => t !== text);
    render();
  });
  return el('div', { className: 'unplaced-card' }, [
    el('pre', { textContent: text }),
    el('div', { className: 'pair-head' }, [useBtn, dropBtn]),
  ]);
}

function render() {
  const set = active();
  setSelect.replaceChildren(...sets.map((s) =>
    el('option', { value: s.id, textContent: `${s.name} (${s.questions.length})`, selected: s.id === activeId })));

  $('set-name').textContent = set.name;
  $('pair-count').textContent = `(${set.questions.length})`;
  pairsList.replaceChildren(...set.questions.map(pairCard));
  if (!set.questions.length) {
    pairsList.append(el('p', { className: 'hint', textContent: 'No questions in this set yet. Load a file, paste text, or add one by hand.' }));
  }
  unplacedSection.hidden = unplaced.length === 0;
  unplacedList.replaceChildren(...unplaced.map(unplacedCard));
  renderDemo();
}

/* ---------- Managing sets ---------- */

// Ask for a set name. Returns the name, or '' if cancelled or not allowed (a message is shown).
function askSetName(message, current = '', exceptId) {
  const name = (window.prompt(message, current) || '').trim();
  if (!name) return '';
  if (nameTaken(sets, name, exceptId)) {
    setStatus.textContent = `There is already a set called "${name}".`;
    return '';
  }
  return name;
}

setSelect.addEventListener('change', () => {
  openSet(setSelect.value);
  setStatus.textContent = '';
  render();
});

$('set-new').addEventListener('click', () => {
  const name = askSetName('Name for the new set (for example Leadership):');
  if (!name) return;
  const set = createSet(name);
  sets.push(set);
  openSet(set.id);
  setStatus.textContent = `Created "${name}".`;
  save();
  render();
});

$('set-rename').addEventListener('click', () => {
  const name = askSetName('New name for this set:', active().name, activeId);
  if (!name) return;
  active().name = name;
  setStatus.textContent = `Renamed to "${name}".`;
  save();
  render();
});

$('set-delete').addEventListener('click', () => {
  const set = active();
  if (sets.length === 1) {
    setStatus.textContent = 'You need at least one set, so this one cannot be deleted.';
    return;
  }
  if (!window.confirm(`Delete the set "${set.name}" and its ${set.questions.length} question(s)? This cannot be undone.`)) return;
  sets = sets.filter((s) => s !== set);
  openSet(sets[0].id);
  setStatus.textContent = `Deleted "${set.name}".`;
  save();
  render();
});

/* ---------- Loading notes into the open set ---------- */

$('parse-btn').addEventListener('click', async () => {
  const files = [...fileInput.files];
  const pasted = pasteBox.value.trim();
  if (!files.length && !pasted) {
    loadStatus.textContent = 'Choose a file or paste some text first.';
    return;
  }
  loadStatus.textContent = 'Reading…';

  const result = await parseFiles(files);
  if (pasted) {
    const found = parseText(pasted);
    result.pairs.push(...found.pairs);
    result.unplaced.push(...found.unplaced);
  }

  // A question that already exists in any set is skipped (one question, one set)
  const { added, skipped } = addQuestions(sets, activeId, result.pairs);
  unplaced = result.unplaced;
  save();
  render();

  const parts = [`Found ${result.pairs.length} question(s), added ${added} to "${active().name}".`];
  if (skipped.length) parts.push(describeSkipped(skipped));
  if (unplaced.length) parts.push(`${unplaced.length} piece(s) of text were not recognised. Check them below.`);
  if (result.errors.length) parts.push('Problems: ' + result.errors.join(' '));
  loadStatus.textContent = parts.join(' ');
  fileInput.value = '';
  if (!result.errors.length) pasteBox.value = '';
});

$('add-btn').addEventListener('click', () => {
  active().questions.push({ id: newId(), question: '', answer: '', topic: '', level: '' });
  render();
  pairsList.querySelector('.pair-card:last-of-type textarea').focus();
});

$('clear-btn').addEventListener('click', () => {
  const set = active();
  if (!set.questions.length || !window.confirm(`Delete all ${set.questions.length} question(s) in "${set.name}"?`)) return;
  set.questions = [];
  unplaced = [];
  save();
  render();
});

/* ---------- Backup: export and import ---------- */

$('export-btn').addEventListener('click', () => {
  const clean = sets.map((s) => ({ ...s, questions: s.questions.filter((q) => q.question.trim()) }));
  const blob = new Blob([JSON.stringify(buildExport(clean), null, 2)], { type: 'application/json' });
  const link = el('a', { href: URL.createObjectURL(blob), download: `interviewpal-sets-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  URL.revokeObjectURL(link.href);
  const total = clean.reduce((n, s) => n + s.questions.length, 0);
  backupStatus.textContent = `Exported ${clean.length} set(s) with ${total} question(s). Check your Downloads folder.`;
});

$('import-btn').addEventListener('click', async () => {
  const file = $('import-input').files[0];
  if (!file) {
    backupStatus.textContent = 'Choose a sets file first.';
    return;
  }
  try {
    const imported = parseImport(await file.text()); // throws a plain message if the file is not valid
    const { added, skipped, created } = mergeImport(sets, imported);
    save();
    render();
    backupStatus.textContent = [
      `Imported ${added} question(s)` + (created ? `, created ${created} new set(s).` : '.'),
      describeSkipped(skipped),
    ].filter(Boolean).join(' ');
  } catch (err) {
    backupStatus.textContent = `Import failed. Nothing was changed. ${err.message}`;
  }
  $('import-input').value = '';
});

/* ---------- Demo questions ---------- */

const demoSet = () => sets.find((s) => s.name === DEMO_SET_NAME);
let demoResult = null; // { added, skipped } right after the button was pressed, so the confirmation stays visible

// The demo card at the top: the full card, the confirmation after adding, or (once the
// demo set exists) just a one-line note.
function renderDemo() {
  const demo = demoSet();
  const confirming = demoResult !== null;
  $('demo-card').hidden = Boolean(demo) && !confirming;
  $('demo-intro').hidden = confirming;
  $('demo-done').hidden = !confirming;
  $('demo-note').hidden = !demo || confirming;
  if (demo && !confirming) {
    $('demo-note').textContent = `The demo set "${demo.name}" is already added (${demo.questions.length} question(s)).`;
  }
  if (confirming) {
    const { added, skipped } = demoResult;
    $('demo-status').textContent = added
      ? `Added ${added} question(s) to "${DEMO_SET_NAME}". The set you had open has not changed. ${describeSkipped(skipped)}`.trim()
      : `Nothing was added. ${describeSkipped(skipped)}`.trim();
    $('demo-open').hidden = !demo;
  }
}

// Goes through the same check-and-merge steps as a file import, so duplicates are skipped.
// The open set is not changed.
$('demo-btn').addEventListener('click', () => {
  const { added, skipped } = mergeImport(sets, parseImport(JSON.stringify(DEMO_EXPORT)));
  const demo = demoSet();
  if (demo && !demo.questions.length) sets.splice(sets.indexOf(demo), 1); // nothing to show: do not leave an empty set behind
  save();
  demoResult = { added, skipped };
  render();
});

$('demo-open').addEventListener('click', () => {
  const demo = demoSet();
  demoResult = null;
  if (demo) openSet(demo.id);
  render();
});

render();
