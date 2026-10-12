import test from 'node:test';
import assert from 'node:assert/strict';
import { keyTerms } from '../src/vocabulary.js';

const terms = (text, limit) => keyTerms(text, limit).map((t) => t.term);

test('picks acronyms, long words and hyphenated terms', () => {
  const found = terms('We agree an SLA with every stakeholder and run a cross-functional retrospective.');
  assert.ok(found.includes('SLA'));
  assert.ok(found.includes('stakeholder'));
  assert.ok(found.includes('cross-functional'));
  assert.ok(found.includes('retrospective'));
});

test('skips everyday words, short words and plain numbers', () => {
  const found = terms('This is a good team and we work with them 2024 times');
  assert.deepEqual(found, []);
});

test('acronyms rank above long ordinary words', () => {
  assert.equal(keyTerms('stakeholder API')[0].term, 'API');
});

test('a repeated term is listed once, and the limit is respected', () => {
  assert.equal(terms('stakeholder stakeholder STAKEHOLDER').length, 1);
  assert.equal(terms('alpha-one beta-two gamma-three delta-four', 2).length, 2);
});

test('empty or missing text gives an empty list', () => {
  assert.deepEqual(keyTerms(''), []);
  assert.deepEqual(keyTerms(undefined), []);
});
