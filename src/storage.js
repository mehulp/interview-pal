// Storage: settings kept in this browser only (localStorage).

const SETTINGS_KEY = 'interviewpal.settings';

const DEFAULTS = {
  voiceLang: 'en-IN', // accent of the interviewer's voice
  recognitionLang: 'en-IN', // accent you speak in
  practiceOrder: 'serial', // 'serial' or 'random'
  practiceLevel: 'all', // 'all', 'easy' or 'hard' (question level)
  practiceDifficulty: 'medium', // 'easy', 'medium' or 'hard'
  practiceCount: 10,
  practiceSelfMark: false,
  practiceEasyTimer: false,
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULTS }; // storage blocked or corrupted: use defaults
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
