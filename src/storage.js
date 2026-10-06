// Storage: settings kept in this browser only (localStorage).

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

/* ---------- Questions (your notes, as question/answer pairs) ---------- */

const QUESTIONS_KEY = 'interviewpal.questions';

export function loadQuestions() {
  try {
    const list = JSON.parse(localStorage.getItem(QUESTIONS_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveQuestions(pairs) {
  try {
    localStorage.setItem(QUESTIONS_KEY, JSON.stringify(pairs));
  } catch {
    // storage unavailable: pairs stay on screen but won't be remembered
  }
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
