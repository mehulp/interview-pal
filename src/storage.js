// Storage: settings kept in this browser only (localStorage).

const SETTINGS_KEY = 'interviewpal.settings';

const DEFAULTS = {
  voiceLang: 'en-IN', // accent of the interviewer's voice
  recognitionLang: 'en-IN', // accent you speak in
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
