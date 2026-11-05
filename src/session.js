// Session: choosing and ordering questions, difficulty rules, and the answer timer.
// No page code here, so it is easy to test.
import { normalize } from './sets.js';

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

// Drop repeats, so a question that is in several ticked sets (or twice in one) is asked once.
// The copy kept is the first one, in the order given, that has a model answer; if none has
// one, the first. It stays where the first copy was.
export function removeRepeats(pairs) {
  const kept = new Map(); // normalised question -> index in `result`
  const result = [];
  for (const p of pairs) {
    const key = normalize(p.question);
    if (!kept.has(key)) {
      kept.set(key, result.length);
      result.push(p);
    } else if (!(result[kept.get(key)].answer || '').trim() && (p.answer || '').trim()) {
      result[kept.get(key)] = p; // this copy has a model answer and the one kept does not
    }
  }
  return result;
}

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
  const matching = removeRepeats(filterByLevel(usableQuestions(pairs), level));
  const ordered = order === 'random' ? shuffle(matching) : matching;
  const n = Math.max(1, Math.min(Number(count) || ordered.length, ordered.length));
  return ordered.slice(0, n);
}

/* ---------- Running a session ---------- */

// The phases of one question, in order:
//   asking     the interviewer is asking the question (nothing is captured)
//   ready      the question has been asked; the user thinks or types; nothing is captured yet
//   answering  Start answer was pressed: the chosen response method and recording are on
//   finishing  the answer is being handed in: listening and recording are stopped and awaited
//   review     the handed-in response, recording, reference, self-marking or Coach feedback
// then 'ending' and 'finished' for the whole session, and 'setup' before it. Leaving the page's
// Interview tab in any of the first five ends the session, so it asks first.
export const ACTIVE_PHASES = ['asking', 'ready', 'answering', 'finishing', 'review'];
export const needsLeaveConfirmation = (phase) => ACTIVE_PHASES.includes(phase);

// What may follow what. An event that does not fit the current phase changes nothing, which is what
// keeps a double click or a late callback from handing an answer in twice or moving on early.
//   spoken   the question has been spoken            start    Start answer was pressed
//   finish   Finish answer was pressed               timeup   the interview countdown ran out
//   skip     Skip was pressed                        handed   the answer became a result (go to review)
//   advance  a skipped answer moves straight on      next     Next question was pressed
//   end      End session (or leaving) was triggered  done     ending finished
const PHASE_TRANSITIONS = {
  asking: { spoken: 'ready', skip: 'finishing', end: 'ending' },
  ready: { start: 'answering', timeup: 'finishing', skip: 'finishing', end: 'ending' },
  answering: { finish: 'finishing', timeup: 'finishing', skip: 'finishing', end: 'ending' },
  finishing: { handed: 'review', advance: 'asking', end: 'ending' },
  review: { next: 'asking', end: 'ending' },
  ending: { done: 'finished' },
};
export const nextPhase = (phase, event) => PHASE_TRANSITIONS[phase]?.[event] ?? phase;
export const phaseAllows = (phase, event) => Boolean(PHASE_TRANSITIONS[phase]?.[event]);

// The one main button, for each phase. `isLast` is true on the final question; `waitingForFeedback`
// is true in review while Coach feedback is loading or has failed and needs a choice.
export function primaryAction({ phase, isLast = false, waitingForFeedback = false }) {
  switch (phase) {
    case 'asking': return { label: 'Start answer', disabled: true, kind: 'start' };
    case 'ready': return { label: 'Start answer', disabled: false, kind: 'start' };
    case 'answering': return { label: 'Finish answer', disabled: false, kind: 'finish' };
    case 'finishing': return { label: 'Finishing…', disabled: true, kind: 'wait' };
    case 'review': return { label: isLast ? 'Finish session' : 'Next question', disabled: waitingForFeedback, kind: 'next' };
    default: return { label: 'Start answer', disabled: true, kind: 'none' };
  }
}

// Repeat is only offered before the answer starts (nothing is being captured then, so the interviewer's
// voice can never be taken for the answer); Skip is offered until it is handed in.
export const canRepeat = (phase, allowRepeat) => Boolean(allowRepeat) && phase === 'ready';
export const canSkip = (phase, allowSkip) => Boolean(allowSkip) && (phase === 'asking' || phase === 'ready' || phase === 'answering');

// The words of an answer that was started but never handed in, or null. Only while the question is
// being asked or answered: once an answer has been submitted (`submitted`) it is a real result and
// must not be counted a second time, and a recording without words is not an answer.
export function unfinishedAnswer({ phase, text, submitted = false }) {
  if (submitted || (phase !== 'asking' && phase !== 'ready' && phase !== 'answering')) return null;
  const words = String(text || '').trim();
  return words || null;
}

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
