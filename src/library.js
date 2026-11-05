// Library rules (UX redesign Step 6). Pure: no page, no storage. Every change works on a COPY of the sets and
// returns a new list, so the screen can save it first and only then make it the live data. A failed save therefore
// never leaves the library half-changed, and the originals passed in are never modified.
import { newId, normalize, findInSet } from './sets.js';

export const clone = (sets) => JSON.parse(JSON.stringify(sets));

// Give every question an ID (older saved data may lack them). Returns true if any were added. Mutates `sets`.
export function ensureIds(sets) {
  let changed = false;
  for (const set of sets) {
    for (const q of set.questions) {
      if (!q.id) { q.id = newId(); changed = true; }
    }
  }
  return changed;
}

const cleanLevel = (level) => (level === 'easy' || level === 'hard' ? level : '');
export const LEVEL_LABELS = { easy: 'Easy', hard: 'Hard', '': 'Not tagged' };

// A short title for a list row
export function titleOf(q, max = 90) {
  const text = String(q.question || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ---------- Search and filters ---------- */
export const NO_TOPIC = '__none';
export const NOT_TAGGED = '__untagged';

// The topics used in a set, sorted (questions without a topic are offered separately as NO_TOPIC)
export const topicsOf = (questions) => [...new Set(questions.map((q) => (q.topic || '').trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));

// filters: { search, topic, level }. topic: '' (all) | NO_TOPIC | a topic. level: '' (all) | 'easy' | 'hard' | NOT_TAGGED.
// The original order is kept, and the questions themselves are not touched.
export function filterQuestions(questions, { search = '', topic = '', level = '' } = {}) {
  const needle = normalize(search);
  return questions.filter((q) => {
    if (needle && !normalize(q.question).includes(needle) && !normalize(q.topic).includes(needle)) return false;
    if (topic === NO_TOPIC && (q.topic || '').trim()) return false;
    if (topic && topic !== NO_TOPIC && (q.topic || '').trim() !== topic) return false;
    if (level === NOT_TAGGED && cleanLevel(q.level)) return false;
    if (level && level !== NOT_TAGGED && cleanLevel(q.level) !== level) return false;
    return true;
  });
}
export const hasFilters = ({ search = '', topic = '', level = '' } = {}) => Boolean(search.trim() || topic || level);

// What to tell the person about the list
export function describeMatches({ total, shown, filtered }) {
  if (!total) return 'No questions in this set yet.';
  if (!filtered) return `${total} question${total === 1 ? '' : 's'}`;
  if (!shown) return 'No questions match these filters.';
  return `${shown} of ${total} match`;
}

/* ---------- Validating a draft ---------- */
// draft: { question, answer, topic, level }. exceptId: the question being edited (it may keep its own text).
// Returns { ok, field, message }.
export function validateDraft(draft, set, exceptId) {
  if (!normalize(draft.question)) return { ok: false, field: 'question', message: 'Write the question first: it cannot be empty.' };
  const same = findInSet(set, draft.question);
  if (same && same.id !== exceptId) {
    return { ok: false, field: 'question', message: `"${set.name}" already has this question (capital letters and extra spaces are ignored). Edit the existing one, or change the wording.` };
  }
  return { ok: true, field: '', message: '' };
}

// Is the draft different from the saved question (null saved = a new question, which is dirty once anything is typed)?
export function isDirty(draft, saved) {
  const trim = (v) => String(v || '').trim();
  if (!saved) return Boolean(trim(draft.question) || trim(draft.answer) || trim(draft.topic) || cleanLevel(draft.level));
  return trim(draft.question) !== trim(saved.question) || trim(draft.answer) !== trim(saved.answer)
    || trim(draft.topic) !== trim(saved.topic) || cleanLevel(draft.level) !== cleanLevel(saved.level);
}

const cleaned = (draft) => ({
  question: String(draft.question).trim(), answer: String(draft.answer || '').trim(),
  topic: String(draft.topic || '').trim(), level: cleanLevel(draft.level),
});

/* ---------- Changes (each returns a new list of sets, or null when it cannot be done) ---------- */
export function withEdit(sets, setId, questionId, draft) {
  const next = clone(sets);
  const q = next.find((s) => s.id === setId)?.questions.find((x) => x.id === questionId);
  if (!q) return null;
  Object.assign(q, cleaned(draft));
  return next;
}

// Add a new question with a chosen ID (so the screen can select it). Appended at the end of the set.
export function withAdded(sets, setId, draft, id = newId()) {
  const next = clone(sets);
  const set = next.find((s) => s.id === setId);
  if (!set) return null;
  set.questions.push({ id, ...cleaned(draft) });
  return next;
}

// Delete one question. Returns { sets, removed: { setId, index, question } } or null.
export function withDeleted(sets, setId, questionId) {
  const next = clone(sets);
  const set = next.find((s) => s.id === setId);
  const index = set ? set.questions.findIndex((q) => q.id === questionId) : -1;
  if (index === -1) return null;
  const [question] = set.questions.splice(index, 1);
  return { sets: next, removed: { setId, index, question } };
}

// Put a deleted question back with its original ID, content and position (as near as the set now allows).
// Returns { sets } or { error: 'set-gone' | 'duplicate' | 'exists' }.
export function withRestored(sets, removed) {
  const next = clone(sets);
  const set = next.find((s) => s.id === removed.setId);
  if (!set) return { error: 'set-gone' };
  if (set.questions.some((q) => q.id === removed.question.id)) return { error: 'exists' };
  if (findInSet(set, removed.question.question)) return { error: 'duplicate' };
  set.questions.splice(Math.min(removed.index, set.questions.length), 0, removed.question);
  return { sets: next };
}

// Moving: does the destination already hold this question? (The existing copy there is kept.)
export function moveConflict(sets, fromId, questionId, toId) {
  const q = sets.find((s) => s.id === fromId)?.questions.find((x) => x.id === questionId);
  const to = sets.find((s) => s.id === toId);
  return Boolean(q && to && findInSet(to, q.question));
}

// Move on a copy: 'moved', or 'merged' (the destination's copy is kept; only the original leaves). Returns { sets, result } or null.
export function withMoved(sets, fromId, questionId, toId) {
  const next = clone(sets);
  const from = next.find((s) => s.id === fromId);
  const to = next.find((s) => s.id === toId);
  const index = from ? from.questions.findIndex((q) => q.id === questionId) : -1;
  if (!to || index === -1 || fromId === toId) return null;
  const [question] = from.questions.splice(index, 1);
  if (findInSet(to, question.question)) return { sets: next, result: 'merged' };
  to.questions.push(question);
  return { sets: next, result: 'moved' };
}

export function withClearedSet(sets, setId) {
  const next = clone(sets);
  const set = next.find((s) => s.id === setId);
  if (!set) return null;
  set.questions = [];
  return next;
}

/* ---------- Import preview ---------- */
// pairs: what the parser found. Each proposed item gets a status against the destination set AND the items before it:
//   'new'        can be added
//   'existing'   the destination set already has it (not selectable)
//   'repeated'   an earlier item in these notes has the same text (not selectable)
//   'empty'      nothing to add (not selectable)
export function previewImport(sets, destId, pairs) {
  const dest = sets.find((s) => s.id === destId);
  const seen = new Set();
  return pairs.map((p, i) => {
    const key = normalize(p.question);
    let status = 'new';
    if (!key) status = 'empty';
    else if (dest && findInSet(dest, p.question)) status = 'existing';
    else if (seen.has(key)) status = 'repeated';
    if (status === 'new') seen.add(key);
    return {
      key: `i${i}`, question: String(p.question || '').trim(), answer: String(p.answer || '').trim(),
      topic: String(p.topic || '').trim(), level: cleanLevel(p.level), status, selected: status === 'new',
    };
  });
}

export const importCounts = (items) => ({
  found: items.length,
  selected: items.filter((i) => i.selected && i.status === 'new').length,
  existing: items.filter((i) => i.status === 'existing').length,
  repeated: items.filter((i) => i.status === 'repeated').length,
});

// Commit the selected items into the destination, checking duplicates again against the CURRENT sets.
// Returns { sets, added, skipped } or { error: 'set-gone' }. `sets` is a new list; the argument is not changed.
export function commitImport(sets, destId, items) {
  const next = clone(sets);
  const dest = next.find((s) => s.id === destId);
  if (!dest) return { error: 'set-gone' };
  let added = 0;
  const skipped = [];
  for (const item of items) {
    if (!item.selected || !normalize(item.question)) continue;
    if (findInSet(dest, item.question)) { skipped.push({ question: item.question, setName: dest.name }); continue; }
    dest.questions.push({ id: newId(), question: item.question, answer: item.answer, topic: item.topic, level: cleanLevel(item.level) });
    added++;
  }
  return { sets: next, added, skipped };
}

// A plain-text copy of a draft, for "Copy unsaved text" / "Download as a file"
export function draftAsText(draft) {
  return [
    `Question: ${draft.question || ''}`,
    `Reference answer: ${draft.answer || ''}`,
    `Topic: ${draft.topic || ''}`,
    `Complexity: ${LEVEL_LABELS[cleanLevel(draft.level)]}`,
  ].join('\n');
}
