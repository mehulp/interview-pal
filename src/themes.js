// Themes: which colour themes exist, and which saved value counts as valid. No page code here, so it
// is easy to test. The colours themselves live in styles.css (one block per theme, same variables in each).
// src/theme-boot.js keeps its own copy of the ID list, because it must run before modules load; a test
// checks the two lists match.

export const DEFAULT_THEME = 'sage';

export const THEMES = [
  { id: 'sage', name: 'Sage & Forest', note: 'Calm greens. The default.' },
  { id: 'teal', name: 'Warm Teal', note: 'Soft teal on a cool white.' },
  { id: 'plum', name: 'Muted Plum', note: 'Quiet purple, gentle contrast.' },
  { id: 'blue', name: 'Classic Blue', note: 'The original blue look.' },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export const isValidTheme = (id) => typeof id === 'string' && THEME_IDS.includes(id);

// A saved value (anything at all, from storage) turned into a theme that exists.
export const resolveTheme = (id) => (isValidTheme(id) ? id : DEFAULT_THEME);
