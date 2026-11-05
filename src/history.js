// History: building, summarising and keeping finished sessions. No page code here,
// so it is easy to test.
//
// A session record looks like:
//   { id, startedAt, endedAt, durationSec, completed, mode, difficulty, order, level, total, answersVisible,
//     sets: [names], results: [ one entry per question that was answered, skipped or timed out ] }
import { newId } from './sets.js';

export const MAX_SESSIONS = 200; // only the latest sessions are kept
export const WEAK_SCORE = 5; // a Coach score at or below this goes on the "to revisit" list

export const MARK_TEXT = { got: 'Got it', partly: 'Partly', missed: 'Missed' };
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// How a result ended, in words. A recording alone is not words, so a response with no text is "no response".
// (Old records have no `incomplete`, and an old empty answer reads as no response too.)
export function outcomeOf(r) {
  if (r.incomplete) return { key: 'incomplete', label: 'incomplete, not scored' };
  if (r.skipped) return { key: 'skipped', label: 'skipped' };
  const words = Boolean(String(r.answer || '').trim());
  if (r.timedOut) return words ? { key: 'timed-out', label: 'timed out' } : { key: 'timed-out-no-response', label: 'timed out, no response' };
  if (!words) return { key: 'no-response', label: 'no response' };
  return { key: 'answered', label: 'answered' };
}

// One answered question, with only the fields worth keeping.
function cleanResult(r) {
  return {
    question: r.question,
    topic: r.topic || '',
    level: r.level || '',
    set: r.set || '',
    answer: r.answer || '',
    skipped: Boolean(r.skipped),
    timedOut: Boolean(r.timedOut),
    seconds: r.seconds || 0, // time since the question was spoken (the countdown's own clock)
    prepSeconds: r.prepSeconds || 0, // v1.5 Step 4: from the question being spoken to Start answer
    answerSeconds: r.answerSeconds || 0, // from Start answer to Finish answer
    // v1.1: filler words, pace, timer use (older records have none). Never for an incomplete answer.
    delivery: r.incomplete ? null : (r.delivery || null),
    // An answer that was started but not handed in before the session ended: kept, never scored
    incomplete: Boolean(r.incomplete),
    answerShown: Boolean(r.answerShown), // v1.2: the model answer was on screen for this question
    mark: r.incomplete ? '' : (r.mark || ''), // Practice self-mark: 'got' | 'partly' | 'missed'
    score: r.incomplete ? null : (r.score ?? null), // Coach score out of 10
    covered: r.incomplete ? [] : (r.covered || []),
    missed: r.incomplete ? [] : (r.missed || []),
    tip: r.incomplete ? '' : (r.tip || ''),
    noAnswer: Boolean(r.noAnswer),
    noReference: Boolean(r.noReference),
    feedbackSkipped: Boolean(r.feedbackSkipped),
  };
}

export function buildSessionRecord({ options, results, total, startedAt, completed, endedAt = Date.now() }) {
  return {
    id: newId(),
    startedAt,
    endedAt,
    durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    completed,
    mode: options.mode,
    difficulty: options.difficulty,
    order: options.order,
    level: options.level,
    total,
    answersVisible: results.some((r) => r.answerShown), // v1.2: the model answer was visible at some point (so charts can leave it out)
    sets: [...new Set(results.map((r) => r.set).filter(Boolean))],
    results: results.map(cleanResult),
  };
}

// The new session goes first (newest first). Older ones beyond the limit are dropped.
export const addSession = (history, record) => [record, ...history].slice(0, MAX_SESSIONS);
export const removeSession = (history, id) => history.filter((s) => s.id !== id);

/* ---------- Numbers for the summary ---------- */

export function summarize(record) {
  const results = record.results;
  // An incomplete answer is never part of a score, an average or the self-mark totals
  const judged = results.filter((r) => !r.incomplete);
  const scored = judged.filter((r) => r.score !== null);
  const marks = { got: 0, partly: 0, missed: 0 };
  judged.forEach((r) => { if (marks[r.mark] !== undefined) marks[r.mark]++; });
  return {
    asked: results.length,
    total: record.total,
    skipped: judged.filter((r) => r.skipped).length,
    timedOut: judged.filter((r) => r.timedOut).length,
    incomplete: results.length - judged.length,
    noResponse: judged.filter((r) => !r.skipped && !String(r.answer || '').trim()).length, // handed in with no words
    scoredCount: scored.length,
    average: scored.length ? scored.reduce((sum, r) => sum + r.score, 0) / scored.length : null,
    marks,
    markedCount: marks.got + marks.partly + marks.missed,
    durationSec: record.durationSec,
  };
}

// Needs another look: a low Coach score, or a self-mark of Missed or Partly.
export const isWeak = (r) =>
  !r.incomplete && ((r.score !== null && r.score <= WEAK_SCORE) || r.mark === 'missed' || r.mark === 'partly');

// Topics to revisit: [{ topic, questions: [text, ...] }], the topic with most questions first.
export function weakSpots(results) {
  const byTopic = new Map();
  for (const r of results.filter(isWeak)) {
    const topic = r.topic || '';
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(r.question);
  }
  return [...byTopic].map(([topic, questions]) => ({ topic, questions }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

export function formatDuration(sec) {
  if (sec < 60) return `${sec} sec`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min} min ${rest} sec` : `${min} min`;
}

export const formatDate = (ms) =>
  new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Two short lines for a row in the History list.
export function describeSession(record) {
  const s = summarize(record);
  const parts = [cap(record.mode), cap(record.difficulty), `${s.asked} of ${s.total} questions`];
  if (s.average !== null) parts.push(`average ${s.average.toFixed(1)}/10`);
  else if (s.markedCount) parts.push(`${s.marks.got} got it, ${s.marks.partly} partly, ${s.marks.missed} missed`);
  if (record.answersVisible) parts.push('model answer visible');
  if (s.incomplete) parts.push(`${s.incomplete} incomplete`);
  if (s.noResponse) parts.push(`${s.noResponse} no response`);
  if (!record.completed) parts.push('ended early');
  return { title: formatDate(record.startedAt), detail: parts.join(' · ') };
}
