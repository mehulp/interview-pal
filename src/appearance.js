// Appearance: putting a theme on the page. The colours are in styles.css; this just says which one.
import { resolveTheme } from './themes.js';

// Show a theme (any value is accepted; an unknown one becomes the default). Returns the theme used.
export function applyTheme(id) {
  const theme = resolveTheme(id);
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}
