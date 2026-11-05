import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clone, ensureIds, titleOf, filterQuestions, topicsOf, hasFilters, describeMatches, NO_TOPIC, NOT_TAGGED,
  validateDraft, isDirty, withEdit, withAdded, withDeleted, withRestored, moveConflict, withMoved, withClearedSet,
  previewImport, importCounts, commitImport, draftAsText,
} from '../src/library.js';

const mk = () => ([
  { id: 'a', name: 'Alpha', questions: [
    { id: 'q1', question: 'How do you delegate?', answer: 'Clear outcomes.', topic: 'People', level: 'easy' },
    { id: 'q2', question: 'Describe a conflict', answer: '', topic: '', level: '' },
    { id: 'q3', question: 'Design a cache', answer: 'LRU.', topic: 'Technical', level: 'hard' },
    { id: 'q4', question: 'Why management?', answer: 'Impact.', topic: 'people', level: '' },
  ] },
  { id: 'b', name: 'Beta', questions: [{ id: 'b1', question: 'why   MANAGEMENT?', answer: 'Beta copy', topic: '', level: '' }] },
]);
const qs = (sets, id) => sets.find((s) => s.id === id).questions.map((q) => q.id).join();

test('questions without an ID get one, and existing IDs are kept', () => {
  const sets = [{ id: 's', name: 'S', questions: [{ question: 'x' }, { id: 'keep', question: 'y' }] }];
  assert.equal(ensureIds(sets), true);
  assert.ok(sets[0].questions[0].id && sets[0].questions[1].id === 'keep');
  assert.equal(ensureIds(sets), false);
});

test('search matches question text and topic, ignoring case and spacing', () => {
  const q = mk()[0].questions;
  assert.equal(filterQuestions(q, { search: 'DELEGATE' }).map((x) => x.id).join(), 'q1');
  assert.equal(filterQuestions(q, { search: 'technical' }).map((x) => x.id).join(), 'q3'); // topic
  assert.equal(filterQuestions(q, { search: '  design   a ' }).map((x) => x.id).join(), 'q3');
  assert.equal(filterQuestions(q, { search: 'nothing like this' }).length, 0);
});

test('topic and complexity filters, including untagged and no topic', () => {
  const q = mk()[0].questions;
  assert.equal(filterQuestions(q, { topic: 'People' }).map((x) => x.id).join(), 'q1');
  assert.equal(filterQuestions(q, { topic: NO_TOPIC }).map((x) => x.id).join(), 'q2');
  assert.equal(filterQuestions(q, { level: 'hard' }).map((x) => x.id).join(), 'q3');
  assert.equal(filterQuestions(q, { level: NOT_TAGGED }).map((x) => x.id).join(), 'q2,q4');
  assert.equal(filterQuestions(q, { level: NOT_TAGGED, topic: 'people' }).map((x) => x.id).join(), 'q4');
  assert.deepEqual(topicsOf(q), ['people', 'People', 'Technical']);
});

test('clearing the filters restores the saved order, and filtering never changes the questions', () => {
  const sets = mk(); const before = JSON.stringify(sets);
  const all = filterQuestions(sets[0].questions, {});
  assert.equal(all.map((x) => x.id).join(), 'q1,q2,q3,q4');
  filterQuestions(sets[0].questions, { search: 'a', topic: 'People', level: 'easy' });
  assert.equal(JSON.stringify(sets), before);
  assert.equal(hasFilters({}), false); assert.equal(hasFilters({ search: ' x ' }), true);
});

test('the match line says what is showing', () => {
  assert.equal(describeMatches({ total: 0, shown: 0, filtered: false }), 'No questions in this set yet.');
  assert.equal(describeMatches({ total: 4, shown: 4, filtered: false }), '4 questions');
  assert.equal(describeMatches({ total: 4, shown: 2, filtered: true }), '2 of 4 match');
  assert.equal(describeMatches({ total: 4, shown: 0, filtered: true }), 'No questions match these filters.');
});

test('titles are shortened for rows only', () => {
  assert.equal(titleOf({ question: '  a   b ' }), 'a b');
  assert.ok(titleOf({ question: 'x'.repeat(200) }).length <= 90 && titleOf({ question: 'x'.repeat(200) }).endsWith('…'));
});

test('validation: empty question, duplicate within the set (normalised), allowed in another set, may keep its own text', () => {
  const sets = mk(); const alpha = sets[0];
  assert.equal(validateDraft({ question: '   ' }, alpha, null).ok, false);
  const dup = validateDraft({ question: '  HOW do you   delegate? ' }, alpha, null);
  assert.equal(dup.ok, false); assert.match(dup.message, /"Alpha" already has this question/);
  assert.equal(validateDraft({ question: 'How do you delegate?' }, alpha, 'q1').ok, true); // editing itself
  assert.equal(validateDraft({ question: 'Design a cache' }, alpha, 'q1').ok, false); // another question's text
  assert.equal(validateDraft({ question: 'Describe a conflict' }, sets[1], null).ok, true); // same text is fine in a different set
  assert.equal(validateDraft({ question: 'why management?' }, sets[1], null).ok, false);
});

test('dirty means different from the saved question; a new draft is dirty once something is typed', () => {
  const saved = mk()[0].questions[0];
  assert.equal(isDirty({ ...saved }, saved), false);
  assert.equal(isDirty({ ...saved, answer: ' Clear outcomes. ' }, saved), false); // spacing only
  assert.equal(isDirty({ ...saved, topic: 'Other' }, saved), true);
  assert.equal(isDirty({ question: '', answer: '', topic: '', level: '' }, null), false);
  assert.equal(isDirty({ question: 'x', answer: '', topic: '', level: '' }, null), true);
});

test('edit, add, delete work on copies: the originals are never mutated', () => {
  const sets = mk(); const before = JSON.stringify(sets);
  const edited = withEdit(sets, 'a', 'q2', { question: ' New wording ', answer: 'A', topic: 'T', level: 'hard' });
  assert.equal(JSON.stringify(sets), before);
  assert.deepEqual(edited[0].questions[1], { id: 'q2', question: 'New wording', answer: 'A', topic: 'T', level: 'hard' });
  assert.equal(withEdit(sets, 'a', 'missing', { question: 'x' }), null);
  const added = withAdded(sets, 'a', { question: 'Added?', level: 'bogus' }, 'new1');
  assert.equal(qs(added, 'a'), 'q1,q2,q3,q4,new1'); assert.equal(added[0].questions[4].level, '');
  assert.equal(JSON.stringify(sets), before);
  assert.equal(withAdded(sets, 'zzz', { question: 'x' }), null);
});

test('delete then undo restores the same ID, content and position; undo is refused when it would conflict', () => {
  const sets = mk();
  const { sets: after, removed } = withDeleted(sets, 'a', 'q2');
  assert.equal(qs(after, 'a'), 'q1,q3,q4'); assert.equal(removed.index, 1);
  const back = withRestored(after, removed);
  assert.equal(qs(back.sets, 'a'), 'q1,q2,q3,q4');
  assert.deepEqual(back.sets[0].questions[1], sets[0].questions[1]);
  assert.equal(withRestored(back.sets, removed).error, 'exists');
  assert.equal(withRestored(after.filter((s) => s.id !== 'a'), removed).error, 'set-gone');
  const dupAfter = withAdded(after, 'a', { question: 'describe a CONFLICT' }, 'other').slice();
  assert.equal(withRestored(dupAfter, removed).error, 'duplicate');
  const short = withDeleted(sets, 'a', 'q4'); short.sets[0].questions.length = 1; // the set shrank meanwhile
  assert.equal(withRestored(short.sets, short.removed).sets[0].questions.length, 2);
  assert.equal(withDeleted(sets, 'a', 'nope'), null);
});

test('moving: a conflict is reported first; the destination copy is kept', () => {
  const sets = mk();
  assert.equal(moveConflict(sets, 'a', 'q4', 'b'), true); // "Why management?" is in Beta already (different spacing and case)
  assert.equal(moveConflict(sets, 'a', 'q1', 'b'), false);
  const merged = withMoved(sets, 'a', 'q4', 'b');
  assert.equal(merged.result, 'merged'); assert.equal(merged.sets[1].questions[0].answer, 'Beta copy'); assert.equal(qs(merged.sets, 'a'), 'q1,q2,q3');
  const moved = withMoved(sets, 'a', 'q1', 'b');
  assert.equal(moved.result, 'moved'); assert.equal(qs(moved.sets, 'b'), 'b1,q1');
  assert.equal(withMoved(sets, 'a', 'q1', 'a'), null);
  assert.equal(sets[0].questions.length, 4); // untouched
});

test('clearing a set works on a copy', () => {
  const sets = mk();
  assert.equal(withClearedSet(sets, 'a')[0].questions.length, 0);
  assert.equal(sets[0].questions.length, 4);
  assert.equal(withClearedSet(sets, 'x'), null);
});

test('import preview marks existing and repeated questions, and only new ones are selected', () => {
  const sets = mk();
  const items = previewImport(sets, 'a', [
    { question: 'Brand new?', answer: 'x' }, { question: 'how do you DELEGATE?' }, { question: 'Brand   new?' }, { question: '  ' }, { question: 'Another', level: 'hard' },
  ]);
  assert.deepEqual(items.map((i) => i.status), ['new', 'existing', 'repeated', 'empty', 'new']);
  assert.deepEqual(items.map((i) => i.selected), [true, false, false, false, true]);
  assert.deepEqual(importCounts(items), { found: 5, selected: 2, existing: 1, repeated: 1 });
  // the same text is fine for a different destination
  assert.equal(previewImport(sets, 'b', [{ question: 'How do you delegate?' }])[0].status, 'new');
});

test('confirming rechecks against the current data, honours deselection, and does not touch the input', () => {
  const sets = mk();
  const items = previewImport(sets, 'a', [{ question: 'Fresh one' }, { question: 'Fresh two' }, { question: 'Fresh three' }]);
  items[2].selected = false;
  const current = withAdded(sets, 'a', { question: 'FRESH ONE' }, 'x'); // someone added it after the preview
  const before = JSON.stringify(current);
  const result = commitImport(current, 'a', items);
  assert.equal(result.added, 1); assert.equal(result.skipped.length, 1); assert.equal(result.skipped[0].setName, 'Alpha');
  assert.deepEqual(result.sets[0].questions.slice(-1)[0].question, 'Fresh two');
  assert.equal(JSON.stringify(current), before);
  assert.equal(commitImport(sets.filter((s) => s.id !== 'a'), 'a', items).error, 'set-gone');
  assert.ok(result.sets[0].questions.every((q) => q.id));
});

test('unsaved text can be copied out', () => {
  assert.equal(draftAsText({ question: 'Q?', answer: 'A', topic: 'T', level: 'hard' }), 'Question: Q?\nReference answer: A\nTopic: T\nComplexity: Hard');
});
test('clone is a deep copy', () => { const s = mk(); const c = clone(s); c[0].questions[0].question = 'changed'; assert.equal(s[0].questions[0].question, 'How do you delegate?'); });
