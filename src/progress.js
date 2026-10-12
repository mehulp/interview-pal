// Progress: turns the saved history into the numbers for the Progress view.
// No page code here, so it is easy to test. "now" can be passed in, so tests are repeatable.
import { summarize, isWeak } from './history.js';

export const NO_TOPIC = 'No topic set';

// A day as text, in the user's own time zone, for example "2026-10-12".
export function dayKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The day before / after a day key. Done with calendar dates, so clock changes do not matter.
function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days).getTime());
}

// How well a session went, as 0 to 100, from its self-marks (Got it = 1, Partly = half, Missed = 0).
function markPercent(summary) {
  if (!summary.markedCount) return null;
  return Math.round(((summary.marks.got + summary.marks.partly / 2) / summary.markedCount) * 100);
}

// One point per session, oldest first, for the trend chart.
//   coach: Coach average score as a percentage (7.5 out of 10 is 75), or null
//   mark:  self-mark result as a percentage, or null
export function trendPoints(history) {
  return [...history]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((record) => {
      const s = summarize(record);
      return {
        t: record.startedAt,
        coach: s.average === null ? null : Math.round(s.average * 10),
        mark: markPercent(s),
      };
    })
    .filter((p) => p.coach !== null || p.mark !== null);
}

// Sessions per day for the last `days` days (today last), including days with none.
export function sessionsPerDay(history, days = 14, now = Date.now()) {
  const counts = new Map();
  history.forEach((r) => counts.set(dayKey(r.startedAt), (counts.get(dayKey(r.startedAt)) || 0) + 1));
  const result = [];
  let key = dayKey(now);
  for (let i = 0; i < days; i++) {
    result.unshift({ day: key, count: counts.get(key) || 0 });
    key = shiftDay(key, -1);
  }
  return result;
}

// Weak-topics heat map: for each topic, how many scored or self-marked answers there were
// and how many of them were weak. Weakest first.
export function topicHeat(history, limit = 12) {
  const topics = new Map();
  for (const record of history) {
    for (const r of record.results) {
      if (r.skipped || (r.score === null && !r.mark)) continue; // nothing was judged
      const name = r.topic || NO_TOPIC;
      const t = topics.get(name) || { topic: name, answered: 0, weak: 0 };
      t.answered++;
      if (isWeak(r)) t.weak++;
      topics.set(name, t);
    }
  }
  return [...topics.values()]
    .map((t) => ({ ...t, weakRate: t.weak / t.answered }))
    .sort((a, b) => b.weakRate - a.weakRate || b.answered - a.answered)
    .slice(0, limit);
}

// The daily streak: how many days in a row have at least one session.
// The current streak is still alive if the last session was yesterday (today is not over yet).
export function streak(history, now = Date.now()) {
  const days = new Set(history.map((r) => dayKey(r.startedAt)));
  if (!days.size) return { current: 0, longest: 0, practisedToday: false };

  const today = dayKey(now);
  let key = days.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (days.has(key)) {
    current++;
    key = shiftDay(key, -1);
  }

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = shiftDay(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest, practisedToday: days.has(today) };
}
