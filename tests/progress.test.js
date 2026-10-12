import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, trendPoints, sessionsPerDay, topicHeat, streak, NO_TOPIC } from '../src/progress.js';

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).getTime();
// Saved results always have score and mark filled in (see cleanResult in history.js)
const full = (r) => ({ score: null, mark: '', skipped: false, topic: '', ...r });
const session = (t, results) => ({ startedAt: t, results: results.map(full), total: results.length, durationSec: 60 });
const now = at(2026, 10, 12, 20);

test('dayKey uses the local date', () => {
  assert.equal(dayKey(at(2026, 1, 5, 23)), '2026-01-05');
});

test('trend: Coach average and self-mark result as percentages, oldest first', () => {
  const history = [
    session(at(2026, 10, 12), [{ score: 8 }, { score: 6 }]),
    session(at(2026, 10, 10), [{ mark: 'got' }, { mark: 'partly' }, { mark: 'missed' }, { mark: 'got' }]),
    session(at(2026, 10, 11), [{ answer: 'x' }]), // nothing scored: left out
  ];
  assert.deepEqual(trendPoints(history).map((p) => [p.coach, p.mark]), [[null, 63], [70, null]]);
});

test('sessions per day covers the days asked for, with zeros', () => {
  const history = [session(at(2026, 10, 12, 8), []), session(at(2026, 10, 12, 9), []), session(at(2026, 10, 10), [])];
  assert.deepEqual(sessionsPerDay(history, 4, now), [
    { day: '2026-10-09', count: 0 }, { day: '2026-10-10', count: 1 },
    { day: '2026-10-11', count: 0 }, { day: '2026-10-12', count: 2 },
  ]);
});

test('sessions per day gives a day for every date across a clock change', () => {
  const days = sessionsPerDay([], 5, at(2026, 3, 30)).map((d) => d.day);
  assert.deepEqual(days, ['2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30']);
});

test('weak topics: weakest first, skipped and unjudged answers ignored', () => {
  const history = [session(at(2026, 10, 10), [
    { topic: 'A', score: 8 }, { topic: 'A', score: 3 }, { topic: 'A', skipped: true },
    { topic: 'B', mark: 'missed' }, { topic: 'B', mark: 'partly' },
    { topic: '', mark: 'got' },
    { topic: 'C' }, // no score, no mark
  ])];
  const heat = topicHeat(history);
  assert.deepEqual(heat.map((t) => [t.topic, t.weak, t.answered]), [['B', 2, 2], ['A', 1, 2], [NO_TOPIC, 0, 1]]);
  assert.equal(heat[0].weakRate, 1);
});

test('weak topics respect the limit', () => {
  const results = Array.from({ length: 20 }, (_, i) => ({ topic: `T${i}`, mark: 'missed' }));
  assert.equal(topicHeat([session(at(2026, 10, 1), results)], 5).length, 5);
});

test('streak counts consecutive days ending today', () => {
  const history = [at(2026, 10, 12), at(2026, 10, 11), at(2026, 10, 10), at(2026, 10, 5)].map((t) => session(t, []));
  assert.deepEqual(streak(history, now), { current: 3, longest: 3, practisedToday: true });
});

test('streak is still alive if the last session was yesterday', () => {
  const history = [at(2026, 10, 11), at(2026, 10, 10)].map((t) => session(t, []));
  assert.deepEqual(streak(history, now), { current: 2, longest: 2, practisedToday: false });
});

test('streak is 0 after a missed day, and the longest one is remembered', () => {
  const history = [at(2026, 10, 9), at(2026, 10, 8), at(2026, 10, 7), at(2026, 10, 1)].map((t) => session(t, []));
  assert.deepEqual(streak(history, now), { current: 0, longest: 3, practisedToday: false });
});

test('two sessions in one day count as one day; no history is zero', () => {
  const history = [session(at(2026, 10, 12, 8), []), session(at(2026, 10, 12, 18), [])];
  assert.equal(streak(history, now).current, 1);
  assert.deepEqual(streak([], now), { current: 0, longest: 0, practisedToday: false });
});
