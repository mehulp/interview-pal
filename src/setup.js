// Setup rules (UX redesign Step 5). Pure: no page, no storage, so it can be tested on its own with Node.
// The screen in practice.js reads and writes the controls; this file decides what the choices mean.
import { DIFFICULTY, timerSecondsFor, formatTime } from './session.js';

/* ---------- Presets ---------- */
// Presets are convenient starting points for setup choices. They are applied only when chosen (or on a new
// installation), never by a refresh, and they never touch History. Recording is not part of a preset: it is
// Off at the start of every session.
export const PRESETS = {
  guided: { label: 'Guided rehearsal', difficulty: 'easy', easyTimer: false, showAnswer: true, feedback: 'self' },
  mock: { label: 'Mock interview', difficulty: 'medium', easyTimer: false, showAnswer: false, feedback: 'self' },
};
export const PRESET_IDS = Object.keys(PRESETS);
export const isPreset = (id) => PRESET_IDS.includes(id);

// The saved settings a preset sets (merged with saveSettings, so nothing else changes)
export function presetSettings(id) {
  const p = PRESETS[id];
  return {
    preset: id,
    practiceDifficulty: p.difficulty,
    practiceEasyTimer: p.easyTimer,
    showModelAnswer: p.showAnswer,
    ...feedbackToSettings(p.feedback),
  };
}

// Which saved keys mean "the person has used setup before". If none exists this is a genuinely new installation.
const PRACTICE_KEYS = ['mode', 'practiceOrder', 'practiceLevel', 'practiceDifficulty', 'practiceCount', 'practiceSelfMark',
  'showModelAnswer', 'practiceEasyTimer', 'practiceSets', 'coachSpeak', 'selfView', 'preset', 'answerMethod'];
export function isNewInstall(stored) {
  if (!stored || typeof stored !== 'object') return true;
  return !PRACTICE_KEYS.some((key) => key in stored);
}

// Does the current setup differ from the chosen preset? `current` = { difficulty, easyTimer, showAnswer, feedback }
export function differsFromPreset(id, current) {
  const p = PRESETS[id];
  if (!p) return false;
  return current.difficulty !== p.difficulty
    || Boolean(current.easyTimer) !== p.easyTimer
    || Boolean(current.showAnswer) !== p.showAnswer
    || current.feedback !== p.feedback;
}

// The line shown beside the presets: the chosen preset (and whether it has been customised)
export function presetStatus(id, current) {
  if (!isPreset(id)) return { label: 'Your own settings', customised: false };
  return differsFromPreset(id, current)
    ? { label: `${PRESETS[id].label} (customised)`, customised: true }
    : { label: PRESETS[id].label, customised: false };
}

/* ---------- Feedback: No feedback / Self-review / AI Coach ---------- */
// They map onto the existing settings: Coach = mode 'coach'; Self-review = Practice with self-marking;
// No feedback = Practice without. There is no separate AI mode.
export function feedbackFromSettings({ mode, practiceSelfMark }, hasKey) {
  if (mode === 'coach' && hasKey) return 'coach';
  return practiceSelfMark ? 'self' : 'none';
}
export function feedbackToSettings(feedback) {
  if (feedback === 'coach') return { mode: 'coach' }; // the self-mark choice is left as it was
  return { mode: 'practice', practiceSelfMark: feedback === 'self' };
}
export const FEEDBACK_LABELS = { none: 'No feedback', self: 'Self-review', coach: 'AI Coach' };

/* ---------- Interview pressure ---------- */
export const PRESSURE_LABELS = { easy: 'Relaxed', medium: 'Standard', hard: 'Challenging' };

const minutesOrSeconds = (secs) => (secs >= 120 ? `${Math.round(secs / 60)} min` : `${secs} sec`);

// "No limit", or "2 min per answer"
export function timeLimitLabel(difficulty, easyTimer) {
  const secs = timerSecondsFor(difficulty, easyTimer);
  return secs ? `${minutesOrSeconds(secs)} per answer` : 'none';
}

// An accurate sentence about the rules for this pressure (they are the existing difficulty rules)
export function describePressure(difficulty, easyTimer) {
  const d = DIFFICULTY[difficulty];
  const secs = timerSecondsFor(difficulty, easyTimer);
  const limit = secs
    ? `Time limit: ${minutesOrSeconds(secs)} per answer, counted from when the question has been asked (it does not pause when you press Start answer). When it ends, what you have is handed in for review.`
    : 'No time limit.';
  const pace = d.rate < 1 ? 'The interviewer speaks a little slower.' : d.rate > 1 ? 'The interviewer speaks a little faster.' : '';
  const repeat = d.allowRepeat ? 'Repeat is allowed before you start answering.' : 'No repeat.';
  const skip = d.allowSkip ? 'Skip is allowed.' : 'No skip.';
  return [limit, pace, repeat, skip].filter(Boolean).join(' ');
}

/* ---------- Questions: counts and what to tell the person ---------- */
// all      questions in the ticked sets, after removing repeats
// matching those that also fit the complexity filter
// everything  how many usable questions exist in all sets
export function countNote({ everything, setsTicked, all, matching, requested, level = 'all' }) {
  if (!everything) return { text: 'No questions saved yet.', needsQuestions: true, session: 0 };
  if (!setsTicked) return { text: 'Tick at least one set.', needsQuestions: false, session: 0 };
  if (!all) return { text: 'The ticked sets have no usable questions. Tick another set, or add questions.', needsQuestions: true, session: 0 };
  if (!matching) {
    const word = level === 'easy' ? 'easy' : level === 'hard' ? 'hard' : 'matching';
    return { text: `${all} question(s) in the ticked sets, but none are marked ${word}. Choose All, or tick more sets.`, needsQuestions: false, session: 0 };
  }
  const want = Math.max(1, Number(requested) || matching);
  const session = Math.min(want, matching);
  let text = `${matching} question(s) available${level !== 'all' ? ` (${all} before the complexity filter)` : ''}; a question in two ticked sets counts once.`;
  if (want > matching) text += ` You asked for ${want}, but only ${matching} match, so the session will have ${matching}.`;
  return { text, needsQuestions: false, session };
}

// Start is off only when practice is genuinely impossible. Returns { ok, reason }.
export function startBlock({ everything, setsTicked, matching }) {
  if (!everything) return { ok: false, reason: 'Add some questions first (Questions tab).' };
  if (!setsTicked) return { ok: false, reason: 'Tick at least one question set.' };
  if (!matching) return { ok: false, reason: 'No questions match these choices. Tick another set or change Question complexity.' };
  return { ok: true, reason: '' };
}

/* ---------- The start summary ---------- */
export function setsLabel(names) {
  if (!names.length) return 'no sets';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more sets`;
}

// Two short lines. `method` is 'speak' or 'type'; `recording` is 'off' | 'audio' | 'video'.
export function summaryLines({ count, setNames, preset, customised, method, recording, difficulty, easyTimer, feedback }) {
  const approach = isPreset(preset) ? PRESETS[preset].label + (customised ? ' (customised)' : '') : 'Your own settings';
  const first = [
    `${count} question${count === 1 ? '' : 's'}`,
    setsLabel(setNames),
    approach,
    method === 'speak' ? 'Speak' : 'Type',
    `Recording ${recording}`,
  ].join(' · ');
  const second = `Pressure: ${PRESSURE_LABELS[difficulty]} · Time limit: ${timeLimitLabel(difficulty, easyTimer)} · Feedback: ${FEEDBACK_LABELS[feedback]}`;
  return { first, second };
}

export { formatTime };
