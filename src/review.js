// Review screen: load notes (files or pasted text), then edit, add and delete the pairs.
// The list is saved in this browser after every change.
import { parseText, parseFiles } from './parser.js';
import { loadQuestions, saveQuestions } from './storage.js';

const fileInput = document.getElementById('file-input');
const pasteBox = document.getElementById('paste-box');
const loadStatus = document.getElementById('load-status');
const pairsList = document.getElementById('pairs-list');
const unplacedList = document.getElementById('unplaced-list');
const unplacedSection = document.getElementById('unplaced-section');
const countLabel = document.getElementById('pair-count');

let pairs = loadQuestions(); // [{ id, question, answer, topic, level }]
let unplaced = []; // text the parser could not place (not saved)

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function save() {
  saveQuestions(pairs.filter((p) => p.question.trim()));
}

/* ---------- Drawing the screen ---------- */

// Small helper to build an element. Text is set with textContent, so file contents can't inject HTML.
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

// A labelled input (textarea, text box or select) bound to one field of a pair.
function field(label, control, pair, key) {
  control.value = pair[key] || '';
  control.addEventListener('input', () => { pair[key] = control.value; save(); });
  control.addEventListener('change', () => { pair[key] = control.value; save(); });
  return el('label', { className: 'field' }, [label, control]);
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
    pairs = pairs.filter((p) => p !== pair);
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
  ]);
}

function unplacedCard(text) {
  const useBtn = el('button', { type: 'button', className: 'small', textContent: 'Use as a question' });
  const dropBtn = el('button', { type: 'button', className: 'small danger', textContent: 'Delete' });
  useBtn.addEventListener('click', () => {
    pairs.push({ id: newId(), question: text, answer: '', topic: '', level: '' });
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
  countLabel.textContent = `(${pairs.length})`;
  pairsList.replaceChildren(...pairs.map(pairCard));
  if (!pairs.length) pairsList.append(el('p', { className: 'hint', textContent: 'No questions yet. Load a file, paste text, or add one by hand.' }));
  unplacedSection.hidden = unplaced.length === 0;
  unplacedList.replaceChildren(...unplaced.map(unplacedCard));
}

/* ---------- Loading notes ---------- */

// Add parsed pairs to the list, skipping questions that are already there.
function addPairs(found) {
  const have = new Set(pairs.map((p) => p.question.trim().toLowerCase()));
  let added = 0;
  for (const p of found) {
    const key = p.question.trim().toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    pairs.push({ id: newId(), ...p });
    added++;
  }
  return added;
}

document.getElementById('parse-btn').addEventListener('click', async () => {
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

  const added = addPairs(result.pairs);
  unplaced = result.unplaced;
  save();
  render();

  const parts = [`Found ${result.pairs.length} question(s), ${added} new.`];
  if (unplaced.length) parts.push(`${unplaced.length} piece(s) of text were not recognised. Check them below.`);
  if (result.errors.length) parts.push('Problems: ' + result.errors.join(' '));
  loadStatus.textContent = parts.join(' ');
  fileInput.value = '';
  if (!result.errors.length) pasteBox.value = '';
});

document.getElementById('add-btn').addEventListener('click', () => {
  pairs.push({ id: newId(), question: '', answer: '', topic: '', level: '' });
  render();
  pairsList.querySelector('.pair-card:last-of-type textarea').focus();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!pairs.length || !confirm('Delete all questions?')) return;
  pairs = [];
  unplaced = [];
  save();
  render();
});

render();
