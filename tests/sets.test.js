import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSet, nameTaken, findInSet, addQuestions, moveQuestion, describeSkipped,
  buildExport, parseImport, mergeImport,
} from '../src/sets.js';

const twoSets = () => [createSet('Leadership'), createSet('Technical')];

test('adds questions and cleans them', () => {
  const sets = twoSets();
  const r = addQuestions(sets, sets[0].id, [{ question: '  Why?  ', answer: 'Because', level: 'medium' }, { question: '   ' }]);
  assert.equal(r.added, 1);
  assert.equal(sets[0].questions[0].question, 'Why?');
  assert.equal(sets[0].questions[0].level, ''); // only easy or hard are kept
});

test('a question already in the SAME set is skipped, ignoring case and extra spaces', () => {
  const sets = twoSets();
  addQuestions(sets, sets[0].id, [{ question: 'How do you delegate?' }]);
  const r = addQuestions(sets, sets[0].id, [{ question: 'how  do you   DELEGATE?' }]);
  assert.equal(r.added, 0);
  assert.deepEqual(r.skipped, [{ question: 'how  do you   DELEGATE?', setName: 'Leadership' }]);
  assert.equal(findInSet(sets[0], 'HOW DO YOU DELEGATE?').question, 'How do you delegate?');
  assert.equal(findInSet(sets[1], 'How do you delegate?'), undefined);
});

test('the same question can be in two different sets, each with its own answer', () => {
  const sets = twoSets();
  addQuestions(sets, sets[0].id, [{ question: 'How do you delegate?', answer: 'Demo answer' }]);
  const r = addQuestions(sets, sets[1].id, [{ question: 'How do you delegate?', answer: 'My own answer' }]);
  assert.equal(r.added, 1);
  assert.equal(r.skipped.length, 0);
  assert.equal(sets[0].questions[0].answer, 'Demo answer');
  assert.equal(sets[1].questions[0].answer, 'My own answer');
});

test('the same question twice in one batch is added once', () => {
  const sets = twoSets();
  const r = addQuestions(sets, sets[0].id, [{ question: 'Q?' }, { question: ' q? ' }]);
  assert.equal(r.added, 1);
  assert.equal(r.skipped.length, 1);
});

test('move takes the question out of the old set', () => {
  const sets = twoSets();
  addQuestions(sets, sets[0].id, [{ question: 'Q1?' }]);
  const id = sets[0].questions[0].id;
  assert.equal(moveQuestion(sets, sets[0].id, id, sets[1].id), 'moved');
  assert.equal(sets[0].questions.length, 0);
  assert.equal(sets[1].questions.length, 1);
  assert.equal(moveQuestion(sets, sets[1].id, id, sets[1].id), false); // same set
  assert.equal(moveQuestion(sets, sets[0].id, 'nope', sets[1].id), false);
});

test('moving into a set that already has the question only removes it from the old set', () => {
  const sets = twoSets();
  addQuestions(sets, sets[0].id, [{ question: 'Q1?', answer: 'old answer' }]);
  addQuestions(sets, sets[1].id, [{ question: 'q1?', answer: 'target answer' }]);
  assert.equal(moveQuestion(sets, sets[0].id, sets[0].questions[0].id, sets[1].id), 'merged');
  assert.equal(sets[0].questions.length, 0);
  assert.equal(sets[1].questions.length, 1);
  assert.equal(sets[1].questions[0].answer, 'target answer'); // the target's copy is untouched
});

test('set names are unique, ignoring case', () => {
  const sets = twoSets();
  assert.equal(nameTaken(sets, ' leadership '), true);
  assert.equal(nameTaken(sets, 'Leadership', sets[0].id), false); // may keep its own name
  assert.equal(nameTaken(sets, 'Other'), false);
});

test('describeSkipped names the sets', () => {
  assert.equal(describeSkipped([]), '');
  assert.equal(describeSkipped([{ setName: 'A' }]), 'Skipped 1 that was already in "A".');
  assert.equal(describeSkipped([{ setName: 'A' }, { setName: 'A' }, { setName: 'B' }]), 'Skipped 3 that were already in "A", "B".');
});

test('export then import gives the same questions', () => {
  const sets = twoSets();
  addQuestions(sets, sets[0].id, [{ question: 'Q1?', answer: 'A1', topic: 'T', level: 'easy' }]);
  const text = JSON.stringify(buildExport(sets));
  const imported = parseImport(text);
  const fresh = [createSet('Leadership')];
  const r = mergeImport(fresh, imported);
  assert.equal(r.added, 1);
  assert.equal(r.created, 1); // "Technical" is new
  assert.deepEqual(fresh[0].questions[0], { ...fresh[0].questions[0], question: 'Q1?', answer: 'A1', topic: 'T', level: 'easy' });
});

test('importing a set does not skip a question that only exists in another set', () => {
  const sets = [createSet('Demo'), createSet('Mine')];
  addQuestions(sets, sets[0].id, [{ question: 'Q1?' }]);
  const r = mergeImport(sets, [{ name: 'Mine', questions: [{ question: 'Q1?', answer: 'mine' }] }]);
  assert.equal(r.added, 1);
  assert.equal(sets[1].questions[0].answer, 'mine');
});

test('importing twice adds nothing the second time', () => {
  const sets = twoSets();
  const data = [{ name: 'Leadership', questions: [{ question: 'Q1?' }] }];
  mergeImport(sets, data);
  const again = mergeImport(sets, data);
  assert.equal(again.added, 0);
  assert.equal(again.skipped.length, 1);
});

test('bad import files are rejected with a plain message', () => {
  assert.throws(() => parseImport('not json'), /not valid JSON/);
  assert.throws(() => parseImport('{"app":"other"}'), /not made by InterviewPal/);
  assert.throws(() => parseImport('{"app":"interviewpal","version":2,"sets":[]}'), /different version/);
  assert.throws(() => parseImport('{"app":"interviewpal","version":1,"sets":[]}'), /no sets/);
  assert.throws(() => parseImport('{"app":"interviewpal","version":1,"sets":[{"name":"","questions":[]}]}'), /not in the expected format/);
  assert.throws(() => parseImport('x'.repeat(6 * 1024 * 1024)), /too big/);
});
