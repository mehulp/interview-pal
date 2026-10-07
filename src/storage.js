// Storage: settings, question sets and the API key, kept in this browser only (localStorage).
import { createSet, DEFAULT_SET_NAME } from './sets.js';

const SETTINGS_KEY = 'interviewpal.settings';

export const DEFAULT_MODEL = 'claude-sonnet-5-5'; // a current Sonnet model; changeable in Settings

const DEFAULTS = {
  mode: 'practice', // 'practice' or 'coach'
  model: DEFAULT_MODEL,
  voiceLang: 'en-IN', // accent of the interviewer's voice
  recognitionLang: 'en-IN', // accent you speak in
  practiceOrder: 'serial', // 'serial' or 'random'
  practiceLevel: 'all', // 'all', 'easy' or 'hard' (question level)
  practiceDifficulty: 'medium', // 'easy', 'medium' or 'hard'
  practiceCount: 10,
  practiceSelfMark: false,
  practiceEasyTimer: false,
  coachSpeak: true, // speak the AI feedback aloud
  practiceSets: [], // ids of the sets ticked for a session (empty = all sets)
  activeSetId: '', // the set open on the Questions screen
  interviewer: 'auto', // 'auto' = picked by difficulty, '' = the drawn face, or a folder name
  selfView: false, // show your own camera during the interview
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULTS }; // storage blocked or corrupted: use defaults
  }
}

// Save some settings. Only the keys you pass change; the rest are kept.
export function saveSettings(changes) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...changes }));
  } catch {
    // storage unavailable: the app still works, settings just won't be remembered
  }
}

/* ---------- Question sets (your notes, as question/answer pairs) ---------- */

const SETS_KEY = 'interviewpal.sets';
const OLD_QUESTIONS_KEY = 'interviewpal.questions'; // before sets existed there was one list

// Load all sets. There is always at least one.
export function loadSets() {
  let raw = null;
  try {
    raw = localStorage.getItem(SETS_KEY);
    const data = JSON.parse(raw);
    if (Array.isArray(data?.sets) && data.sets.length) return data.sets;
  } catch {
    // unreadable data: fall through to a default set (and do not overwrite it on load)
  }

  const first = createSet(DEFAULT_SET_NAME);
  if (raw !== null) return [first]; // saved data exists but could not be read: leave it alone

  // First run with sets: move any questions saved by the older version into the default set
  try {
    const old = JSON.parse(localStorage.getItem(OLD_QUESTIONS_KEY));
    if (Array.isArray(old)) first.questions = old;
  } catch {
    // no old questions
  }
  if (saveSets([first])) {
    try { localStorage.removeItem(OLD_QUESTIONS_KEY); } catch { /* fine */ }
  }
  return [first];
}

// Returns true if saved.
export function saveSets(sets) {
  try {
    localStorage.setItem(SETS_KEY, JSON.stringify({ sets }));
    return true;
  } catch {
    return false; // storage unavailable: sets stay on screen but won't be remembered
  }
}

// All questions from the chosen sets (or from every set if none are named), as one flat list.
// Each question also carries the name of its set.
export function loadQuestions(setIds) {
  return loadSets()
    .filter((set) => !setIds || setIds.includes(set.id))
    .flatMap((set) => set.questions.map((q) => ({ ...q, set: set.name })));
}

/* ---------- API key (kept in this browser only, never in code) ---------- */

const API_KEY_KEY = 'interviewpal.apiKey';

export function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_KEY) || '';
  } catch {
    return '';
  }
}

export function saveApiKey(key) {
  localStorage.setItem(API_KEY_KEY, key); // may throw if storage is blocked; the caller shows a message
}

export function clearApiKey() {
  try {
    localStorage.removeItem(API_KEY_KEY);
  } catch {
    // nothing to remove
  }
}
