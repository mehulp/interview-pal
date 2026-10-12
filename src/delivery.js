// Delivery: how an answer was delivered, worked out from its text and timings only.
// No page code and no audio: it never hears anything, it only counts words and seconds.
//
// For one answer, analyzeAnswer() needs:
//   answer         the final answer text (what the user submitted)
//   spokenText     the part that came from speech recognition ('' if the user only typed)
//   spokenSeconds  how long the microphone was on for this answer
//   seconds        how long the answer took, from the end of the question to the end
//   timerSeconds   the timer for this question (0 if there was no timer)

export const MIN_PACE_WORDS = 10; // a pace from fewer words than this means little
export const MIN_PACE_SECONDS = 5;
export const PACE_SLOW = 110; // words per minute: below this is slow, above PACE_FAST is fast
export const PACE_FAST = 170;

// Filler words and phrases to count. Longest first, so "you know" is found before "know".
// Note: Chrome's recogniser often drops "um" and "uh", so those counts can be too low.
// "like" is left out on purpose, because it is too often a normal word ("I would like to").
export const FILLERS = [
  'you know', 'i mean', 'sort of', 'kind of',
  'basically', 'actually', 'literally', 'erm', 'um', 'uh', 'er', 'ah', 'hmm',
];

const wordsOf = (text) => String(text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
export const countWords = (text) => wordsOf(text).length;

// Count the fillers in a text. Returns { total, found: { word: count } }.
export function countFillers(text) {
  const words = wordsOf(text);
  const phrases = FILLERS.map((f) => f.split(' '));
  const found = {};
  let total = 0;
  for (let i = 0; i < words.length;) {
    // Does a filler start here? (FILLERS is longest first, so "you know" wins over a shorter match.)
    const hit = phrases.find((p) => p.every((w, k) => words[i + k] === w));
    if (hit) {
      const name = hit.join(' ');
      found[name] = (found[name] || 0) + 1;
      total++;
      i += hit.length;
    } else {
      i++;
    }
  }
  return { total, found };
}

// The delivery numbers for one answer, or null if there was no answer to look at.
export function analyzeAnswer({ answer, spokenText = '', spokenSeconds = 0, seconds = 0, timerSeconds = 0 }) {
  const words = countWords(answer);
  if (!words) return null;

  const fillers = countFillers(answer);
  const spokenWords = countWords(spokenText);
  const spoken = spokenWords > 0;
  // Pace only for spoken answers, and only when there is enough speech to measure
  const wpm = spoken && spokenWords >= MIN_PACE_WORDS && spokenSeconds >= MIN_PACE_SECONDS
    ? Math.round(spokenWords / (spokenSeconds / 60))
    : null;

  return {
    spoken,
    words,
    spokenWords,
    spokenSeconds: Math.round(spokenSeconds),
    wpm,
    fillers: fillers.total,
    fillerWords: fillers.found,
    seconds: Math.round(seconds),
    timerSeconds: timerSeconds || 0,
    timerUsed: timerSeconds ? Math.round((seconds / timerSeconds) * 100) : null, // percent of the timer
  };
}

export function paceLabel(wpm) {
  if (wpm === null || wpm === undefined) return '';
  if (wpm < PACE_SLOW) return 'on the slow side';
  if (wpm > PACE_FAST) return 'on the fast side';
  return 'a steady pace';
}

// Totals for a whole session, from its results. Returns null if no answer has delivery numbers.
export function summarizeDelivery(results) {
  const rows = results.map((r) => r.delivery).filter(Boolean);
  if (!rows.length) return null;

  const paced = rows.filter((d) => d.wpm !== null);
  const pacedWords = paced.reduce((n, d) => n + d.spokenWords, 0);
  const pacedSeconds = paced.reduce((n, d) => n + d.spokenSeconds, 0);
  const timed = rows.filter((d) => d.timerUsed !== null);

  const fillerWords = {};
  rows.forEach((d) => Object.entries(d.fillerWords).forEach(([w, n]) => { fillerWords[w] = (fillerWords[w] || 0) + n; }));
  const words = rows.reduce((n, d) => n + d.words, 0);
  const fillers = rows.reduce((n, d) => n + d.fillers, 0);

  return {
    answers: rows.length,
    spokenAnswers: rows.filter((d) => d.spoken).length,
    words,
    fillers,
    fillersPer100: words ? Math.round((fillers / words) * 1000) / 10 : 0,
    fillerWords,
    wpm: paced.length ? Math.round(pacedWords / (pacedSeconds / 60)) : null, // total words over total time
    pacedAnswers: paced.length,
    timerUsed: timed.length ? Math.round(timed.reduce((n, d) => n + d.timerUsed, 0) / timed.length) : null,
  };
}

// Short plain-language lines for one answer's numbers (used by the summary).
export function describeDelivery(d) {
  if (!d) return [];
  const lines = [`${d.words} word${d.words === 1 ? '' : 's'}`];
  if (d.wpm !== null) lines.push(`${d.wpm} words per minute (${paceLabel(d.wpm)})`);
  else if (d.spoken) lines.push('too short to measure your pace');
  else lines.push('typed, so no pace');
  lines.push(d.fillers ? `${d.fillers} filler word${d.fillers === 1 ? '' : 's'} (${listFillers(d.fillerWords)})` : 'no filler words');
  if (d.timerUsed !== null) lines.push(`used ${d.seconds} of ${d.timerSeconds} seconds (${d.timerUsed}% of the timer)`);
  return lines;
}

export const listFillers = (found) =>
  Object.entries(found).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ×${n}`).join(', ');
