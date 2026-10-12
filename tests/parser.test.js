import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/parser.js';

test('Q: / A: lines with a level tag and a topic line', () => {
  const { pairs } = parseText('Q1. What is X? [hard]\nA: It is X.\nTopic: Core');
  assert.deepEqual(pairs, [{ question: 'What is X?', answer: 'It is X.', topic: 'Core', level: 'hard' }]);
});

test('Question: / Answer: lines, with an answer over several lines', () => {
  const { pairs } = parseText('Question: Why?\nAnswer: Because\nstill because');
  assert.equal(pairs[0].question, 'Why?');
  assert.equal(pairs[0].answer, 'Because\nstill because');
});

test('headings become questions', () => {
  const { pairs } = parseText('## How do you delegate?\nBy trust.\n\n## Describe feedback?\nBe kind.');
  assert.deepEqual(pairs.map((p) => p.question), ['How do you delegate?', 'Describe feedback?']);
  assert.equal(pairs[1].answer, 'Be kind.');
});

test('numbered questions', () => {
  const { pairs } = parseText('1. First question?\nanswer one\n2. Second question?\nanswer two');
  assert.deepEqual(pairs.map((p) => p.answer), ['answer one', 'answer two']);
});

test('plain question lines followed by their answers', () => {
  const { pairs } = parseText('How do you do X?\nLike this.\n\nWhy Y?\nBecause.');
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].answer, 'Like this.');
});

test('Windows line endings are read the same way', () => {
  const { pairs } = parseText('Q: One?\r\nA: First\r\n\r\nQ: Two?\r\nA: Second');
  assert.equal(pairs.length, 2);
});

test('text that matches no pattern is returned as unplaced, not lost', () => {
  const result = parseText('Hello there\n\nrandom text');
  assert.deepEqual(result.pairs, []);
  assert.deepEqual(result.unplaced, ['Hello there', 'random text']);
});

test('empty text gives nothing', () => {
  const result = parseText('');
  assert.deepEqual(result.pairs, []);
});
