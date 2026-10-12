import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countWords, countFillers, analyzeAnswer, summarizeDelivery, paceLabel, describeDelivery,
} from '../src/delivery.js';

test('countWords ignores punctuation and extra spaces', () => {
  assert.equal(countWords("  Well, it's  fine. "), 3);
  assert.equal(countWords(''), 0);
  assert.equal(countWords(null), 0);
});

test('fillers: single words and phrases are counted, ordinary "like" is not', () => {
  const r = countFillers('Um, basically I would, you know, like to say that, uh, actually it is kind of fine');
  assert.equal(r.total, 6); // um, basically, you know, uh, actually, kind of
  assert.deepEqual(r.found, { 'you know': 1, 'kind of': 1, basically: 1, actually: 1, um: 1, uh: 1 });
});

test('fillers are matched as whole words only', () => {
  assert.equal(countFillers('The umbrella is a perfect example of terror').total, 0);
});

test('the same filler twice in a row is counted twice', () => {
  assert.deepEqual(countFillers('um um well you know you know'), { total: 4, found: { 'you know': 2, um: 2 } });
});

test('no answer gives no numbers', () => {
  assert.equal(analyzeAnswer({ answer: '   ' }), null);
});

test('a spoken answer gets pace, fillers and timer use', () => {
  const text = 'one two three four five six seven eight nine ten um';
  const d = analyzeAnswer({ answer: text, spokenText: text, spokenSeconds: 6, seconds: 30, timerSeconds: 60 });
  assert.equal(d.spoken, true);
  assert.equal(d.words, 11);
  assert.equal(d.wpm, 110); // 11 words in 6 seconds
  assert.equal(d.fillers, 1);
  assert.equal(d.timerUsed, 50);
});

test('a typed answer has no pace, but still has fillers and timer use', () => {
  const d = analyzeAnswer({ answer: 'basically yes', seconds: 15, timerSeconds: 60 });
  assert.equal(d.spoken, false);
  assert.equal(d.wpm, null);
  assert.equal(d.fillers, 1);
  assert.equal(d.timerUsed, 25);
});

test('too little speech gives no pace', () => {
  const few = analyzeAnswer({ answer: 'one two three', spokenText: 'one two three', spokenSeconds: 20 });
  assert.equal(few.wpm, null);
  const quick = analyzeAnswer({ answer: 'a b c d e f g h i j k', spokenText: 'a b c d e f g h i j k', spokenSeconds: 2 });
  assert.equal(quick.wpm, null);
});

test('no timer means no timer percentage', () => {
  assert.equal(analyzeAnswer({ answer: 'hi there', seconds: 4, timerSeconds: 0 }).timerUsed, null);
});

test('only the spoken part counts for pace when the user also typed', () => {
  const d = analyzeAnswer({
    answer: 'one two three four five six seven eight nine ten and some typed extra words',
    spokenText: 'one two three four five six seven eight nine ten',
    spokenSeconds: 5,
  });
  assert.equal(d.wpm, 120);
  assert.equal(d.words, 15);
});

test('paceLabel', () => {
  assert.equal(paceLabel(90), 'on the slow side');
  assert.equal(paceLabel(140), 'a steady pace');
  assert.equal(paceLabel(190), 'on the fast side');
  assert.equal(paceLabel(null), '');
});

test('session totals: pace is total words over total time, typed answers are left out', () => {
  const spoken1 = analyzeAnswer({ answer: 'a b c d e f g h i j', spokenText: 'a b c d e f g h i j', spokenSeconds: 5, seconds: 10, timerSeconds: 100 });
  const spoken2 = analyzeAnswer({ answer: 'a b c d e f g h i j um um', spokenText: 'a b c d e f g h i j um um', spokenSeconds: 10, seconds: 30, timerSeconds: 100 });
  const typed = analyzeAnswer({ answer: 'typed words only', seconds: 50, timerSeconds: 100 });
  const t = summarizeDelivery([{ delivery: spoken1 }, { delivery: spoken2 }, { delivery: typed }, { delivery: null }, {}]);
  assert.equal(t.answers, 3);
  assert.equal(t.spokenAnswers, 2);
  assert.equal(t.wpm, 88); // 22 words in 15 seconds
  assert.equal(t.fillers, 2);
  assert.deepEqual(t.fillerWords, { um: 2 });
  assert.equal(t.timerUsed, 30); // average of 10, 30 and 50
});

test('totals are null when nothing has delivery numbers (for example old history)', () => {
  assert.equal(summarizeDelivery([{}, { delivery: null }]), null);
  assert.deepEqual(describeDelivery(null), []);
});
