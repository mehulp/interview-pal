// Session: choosing and ordering questions, difficulty rules, and the answer timer.
// No page code here, so it is easy to test.

/* ---------- Difficulty rules ---------- */

export const DIFFICULTY = {
  easy: {
    label: 'Easy',
    timerSeconds: 300, // only used if the "timer on Easy" box is ticked
    timerOptional: true,
    rate: 0.9, // speech speed: slower
    allowRepeat: true,
    allowSkip: true,
  },
  medium: {
    label: 'Medium',
    timerSeconds: 120,
    timerOptional: false,
    rate: 1.0,
    allowRepeat: true,
    allowSkip: true,
  },
  hard: {
    label: 'Hard',
    timerSeconds: 90,
    timerOptional: false,
    rate: 1.1, // faster
    allowRepeat: false,
    allowSkip: false,
  },
};

// Seconds allowed per answer (0 means no timer).
export function timerSecondsFor(difficulty, easyTimerOn) {
  const d = DIFFICULTY[difficulty];
  if (d.timerOptional && !easyTimerOn) return 0;
  return d.timerSeconds;
}

// A plain-language line describing the rules of a difficulty.
export function describeDifficulty(difficulty, easyTimerOn) {
  const d = DIFFICULTY[difficulty];
  const secs = timerSecondsFor(difficulty, easyTimerOn);
  const timer = secs ? `about ${secs >= 120 ? Math.round(secs / 60) + ' min' : secs + ' sec'} per answer` : 'no timer';
  const pace = d.rate < 1 ? 'slower speech' : d.rate > 1 ? 'faster speech' : 'normal speech';
  const repeat = d.allowRepeat ? 'repeat allowed' : 'no repeat';
  const skip = d.allowSkip ? 'skip allowed' : 'no skip';
  return `${timer}, ${pace}, ${repeat}, ${skip}.`;
}

/* ---------- Choosing questions ---------- */

// Questions with some text in them.
export const usableQuestions = (pairs) => pairs.filter((p) => p.question && p.question.trim());

// level: 'all' keeps everything (including untagged); 'easy' / 'hard' keep only tagged ones.
export function filterByLevel(pairs, level) {
  return level === 'all' ? pairs : pairs.filter((p) => p.level === level);
}

// Fisher-Yates shuffle (returns a new array).
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// order: 'serial' or 'random'. count: how many to ask (at most what is available).
export function buildQuestionList(pairs, { order, level, count }) {
  const matching = filterByLevel(usableQuestions(pairs), level);
  const ordered = order === 'random' ? shuffle(matching) : matching;
  const n = Math.max(1, Math.min(Number(count) || ordered.length, ordered.length));
  return ordered.slice(0, n);
}

/* ---------- Running a session ---------- */

export function createSession(questions) {
  let index = 0;
  const results = []; // one record per question, filled in as you go
  return {
    total: questions.length,
    results,
    current: () => questions[index],
    position: () => index + 1,
    record: (result) => results.push(result),
    // Move to the next question. Returns false when there are no more.
    advance() {
      index++;
      return index < questions.length;
    },
  };
}

/* ---------- Timer ---------- */

export const formatTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// Counts down from `seconds`. Uses the clock, so it stays right even if the tab is throttled.
export function createTimer(seconds, { onTick, onDone }) {
  let id = null;
  let deadline = 0;

  function stop() {
    clearInterval(id);
    id = null;
  }
  function tick() {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    onTick(left);
    if (left === 0) {
      stop();
      onDone();
    }
  }
  return {
    start() {
      deadline = Date.now() + seconds * 1000;
      tick();
      id = setInterval(tick, 250);
    },
    stop,
  };
}
