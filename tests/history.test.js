import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionRecord, addSession, removeSession, MAX_SESSIONS, summarize, isWeak, weakSpots,
  formatDuration, describeSession,
} from '../src/history.js';

const options = { mode: 'practice', difficulty: 'medium', order: 'serial', level: 'all' };
const results = [
  { question: 'a?', topic: 'People', set: 'Lead', answer: 'x', mark: 'got' },
  { question: 'b?', topic: 'People', set: 'Lead', answer: 'y', mark: 'missed' },
  { question: 'c?', topic: 'Tech', set: 'Tech', answer: 'z', mark: 'partly' },
  { question: 'd?', topic: 'Tech', set: 'Tech', skipped: true },
];
const record = (extra = {}) => buildSessionRecord({ options, results, total: 5, startedAt: 1000, endedAt: 61000, completed: false, ...extra });

test('a record keeps only the useful fields and works out the duration', () => {
  const r = record();
  assert.equal(r.durationSec, 60);
  assert.deepEqual(r.sets, ['Lead', 'Tech']);
  assert.equal(r.results[0].score, null);
  assert.equal(r.results[3].skipped, true);
  assert.equal(r.results[0].delivery, null); // older style results have none
});

test('delivery numbers are kept in the record', () => {
  const delivery = { words: 12, wpm: 130 };
  const r = buildSessionRecord({ options, results: [{ question: 'a?', delivery }], total: 1, startedAt: 0, completed: true });
  assert.deepEqual(r.results[0].delivery, delivery);
});

test('summarize counts marks, skips and Coach scores', () => {
  const s = summarize(record());
  assert.deepEqual(s.marks, { got: 1, partly: 1, missed: 1 });
  assert.equal(s.markedCount, 3);
  assert.equal(s.skipped, 1);
  assert.equal(s.asked, 4);
  assert.equal(s.average, null);

  const coach = summarize({ results: [{ score: 8 }, { score: 4 }, { score: null }], total: 3, durationSec: 5 });
  assert.equal(coach.average, 6);
  assert.equal(coach.scoredCount, 2);
});

test('weak means a low score, Partly or Missed', () => {
  assert.equal(isWeak({ score: 5, mark: '' }), true);
  assert.equal(isWeak({ score: 6, mark: '' }), false);
  assert.equal(isWeak({ score: null, mark: 'partly' }), true);
  assert.equal(isWeak({ score: null, mark: 'got' }), false);
  assert.equal(isWeak({ score: null, mark: '' }), false);
});

test('topics to revisit are grouped, most questions first', () => {
  const spots = weakSpots([
    { question: 'a', topic: 'A', mark: 'missed', score: null },
    { question: 'b', topic: 'B', mark: 'missed', score: null },
    { question: 'c', topic: 'B', mark: 'partly', score: null },
    { question: 'd', topic: 'C', mark: 'got', score: null },
  ]);
  assert.deepEqual(spots.map((s) => [s.topic, s.questions.length]), [['B', 2], ['A', 1]]);
});

test('newest session goes first and only the latest 200 are kept', () => {
  let history = [];
  for (let i = 0; i < MAX_SESSIONS + 5; i++) history = addSession(history, { id: String(i) });
  assert.equal(history.length, MAX_SESSIONS);
  assert.equal(history[0].id, String(MAX_SESSIONS + 4));
});

test('removeSession removes only that one', () => {
  assert.deepEqual(removeSession([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
});

test('formatDuration', () => {
  assert.equal(formatDuration(45), '45 sec');
  assert.equal(formatDuration(120), '2 min');
  assert.equal(formatDuration(125), '2 min 5 sec');
});

test('describeSession mentions an early end', () => {
  const { detail } = describeSession(record());
  assert.match(detail, /Practice · Medium · 4 of 5 questions/);
  assert.match(detail, /ended early/);
});

test('a session is flagged when the model answer was visible for any question', () => {
  const withShown = buildSessionRecord({
    options, results: [{ question: 'a?' }, { question: 'b?', answerShown: true }], total: 2, startedAt: 0, completed: true,
  });
  assert.equal(withShown.answersVisible, true);
  assert.equal(withShown.results[0].answerShown, false);
  assert.equal(withShown.results[1].answerShown, true);

  const without = buildSessionRecord({ options, results: [{ question: 'a?' }], total: 1, startedAt: 0, completed: true });
  assert.equal(without.answersVisible, false);
});

test('describeSession says when the model answer was visible; old records have no flag', () => {
  const flagged = buildSessionRecord({ options, results: [{ question: 'a?', answerShown: true }], total: 1, startedAt: 0, completed: true });
  assert.match(describeSession(flagged).detail, /model answer visible/);
  const { answersVisible, ...old } = flagged; // a record saved before v1.2
  assert.doesNotMatch(describeSession(old).detail, /model answer visible/);
});
