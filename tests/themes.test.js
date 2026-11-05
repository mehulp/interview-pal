import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { THEMES, THEME_IDS, DEFAULT_THEME, isValidTheme, resolveTheme } from '../src/themes.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const bootSource = readFileSync(new URL('../src/theme-boot.js', import.meta.url), 'utf8');

/* ---------- Which themes exist ---------- */

test('four themes, Sage & Forest first and the default', () => {
  assert.deepEqual(THEME_IDS, ['sage', 'teal', 'plum', 'blue']);
  assert.equal(DEFAULT_THEME, 'sage');
  assert.deepEqual(THEMES.map((t) => t.name), ['Sage & Forest', 'Warm Teal', 'Muted Plum', 'Classic Blue']);
  assert.ok(THEMES.every((t) => t.note.length > 5));
});

test('only a known ID is valid; anything else becomes the default', () => {
  for (const id of THEME_IDS) { assert.equal(isValidTheme(id), true); assert.equal(resolveTheme(id), id); }
  for (const bad of [undefined, null, '', 'dark', 'SAGE', ' sage', 'sage ', 7, {}, [], ['sage'], '__proto__', 'constructor', true]) {
    assert.equal(isValidTheme(bad), false, String(bad));
    assert.equal(resolveTheme(bad), DEFAULT_THEME, String(bad));
  }
});

/* ---------- The boot script that runs before the page is drawn ---------- */

// Run src/theme-boot.js against a pretend page and storage. `stored` is what localStorage holds (or a function that throws).
function boot(stored) {
  const attrs = {};
  const sandbox = {
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
    localStorage: { getItem: () => { if (typeof stored === 'function') return stored(); return stored; } },
  };
  vm.runInNewContext(bootSource, sandbox);
  return attrs;
}

test('boot: a saved valid theme is applied', () => {
  for (const id of THEME_IDS) assert.deepEqual(boot(JSON.stringify({ mode: 'practice', theme: id })), { 'data-theme': id });
});

test('boot: nothing saved, an unknown or odd value, or broken data leaves the default alone', () => {
  assert.deepEqual(boot(null), {});
  assert.deepEqual(boot(JSON.stringify({ theme: 'dark' })), {});
  assert.deepEqual(boot(JSON.stringify({ theme: 7 })), {});
  assert.deepEqual(boot(JSON.stringify({ theme: ['sage'] })), {});
  assert.deepEqual(boot(JSON.stringify({ theme: '__proto__' })), {});
  assert.deepEqual(boot(JSON.stringify({ mode: 'coach' })), {}); // no theme key
  assert.deepEqual(boot('not json at all'), {});
  assert.deepEqual(boot('null'), {});
  assert.deepEqual(boot('"sage"'), {}); // JSON, but not an object
});

test('boot: storage that throws (blocked) is harmless', () => {
  assert.deepEqual(boot(() => { throw new DOMException('blocked', 'SecurityError'); }), {});
});

test('boot: its ID list is the same as themes.js', () => {
  const listed = bootSource.match(/var IDS = \[([^\]]*)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(listed, THEME_IDS);
});

/* ---------- The colours in styles.css ---------- */

// Read the colour roles of one theme out of the stylesheet.
function rolesOf(id) {
  const out = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const mine = selectors.includes(`[data-theme-preview="${id}"]`);
    if (!mine) continue;
    for (const [, name, value] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[name] = value.toUpperCase();
  }
  return out;
}
function statusColours() {
  const out = {};
  const root = css.match(/\/\* The same in every theme[\s\S]*?:root\s*\{([^}]*)\}/)[1];
  for (const [, name, value] of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[name] = value.toUpperCase();
  return out;
}
const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const ROLES = ['page', 'surface', 'surface-subtle', 'reference', 'text', 'text-muted', 'border', 'border-strong', 'accent', 'accent-hover', 'accent-fg', 'selected-bg', 'selected-border', 'focus'];
const GIVEN = { // the values the owner chose
  sage: { page: '#F6F7F2', text: '#24332C', accent: '#35634D' },
  teal: { page: '#F5F7F7', text: '#243438', accent: '#176B70' },
  plum: { page: '#F7F5F8', text: '#332D3B', accent: '#715185' },
  blue: { page: '#F6F7FB', text: '#1D2433', accent: '#3B5BDB' },
};

test('every theme defines every colour role, and the cards are white', () => {
  for (const id of THEME_IDS) {
    const roles = rolesOf(id);
    for (const role of ROLES) assert.match(roles[role] || '', /^#[0-9A-F]{6}$/, `${id} is missing --${role}`);
    assert.equal(roles.surface, '#FFFFFF', `${id} cards`);
    assert.equal(roles['accent-fg'], '#FFFFFF', `${id} text on the accent`);
  }
});

test('each theme uses the page, text and accent colours it was given', () => {
  for (const [id, given] of Object.entries(GIVEN)) {
    const roles = rolesOf(id);
    assert.equal(roles.page, given.page, `${id} page`);
    assert.equal(roles.text, given.text, `${id} text`);
    assert.equal(roles.accent, given.accent, `${id} accent`);
  }
});

test('the default (no data-theme) is Sage & Forest', () => {
  assert.match(css, /:root,\s*:root\[data-theme="sage"\],\s*\[data-theme-preview="sage"\]/);
});

test('contrast: text, supporting text, accent, buttons, selection and focus meet their targets in every theme', () => {
  for (const id of THEME_IDS) {
    const r = rolesOf(id);
    const surfaces = ['page', 'surface', 'surface-subtle', 'reference', 'selected-bg'];
    for (const bg of surfaces) {
      assert.ok(contrast(r.text, r[bg]) >= 7, `${id}: text on ${bg} is ${contrast(r.text, r[bg]).toFixed(2)}`);
      assert.ok(contrast(r['text-muted'], r[bg]) >= 4.5, `${id}: muted text on ${bg} is ${contrast(r['text-muted'], r[bg]).toFixed(2)}`);
      assert.ok(contrast(r.accent, r[bg]) >= 4.5, `${id}: accent text on ${bg} is ${contrast(r.accent, r[bg]).toFixed(2)}`);
      assert.ok(contrast(r.focus, r[bg]) >= 3, `${id}: focus ring on ${bg} is ${contrast(r.focus, r[bg]).toFixed(2)}`);
    }
    assert.ok(contrast(r['accent-fg'], r.accent) >= 4.5, `${id}: white on accent`);
    assert.ok(contrast(r['accent-fg'], r['accent-hover']) >= 4.5, `${id}: white on accent hover`);
    assert.ok(contrast(r['border-strong'], r.surface) >= 3, `${id}: control border on cards`);
    assert.ok(contrast(r['border-strong'], r.page) >= 3, `${id}: control border on the page`);
    assert.ok(contrast(r['selected-border'], r.surface) >= 3, `${id}: selected border`);
  }
});

test('contrast: status colours read on white, on the page and on their own tint', () => {
  const s = statusColours();
  for (const name of ['danger', 'warning', 'success']) {
    assert.ok(contrast(s[name], '#FFFFFF') >= 4.5, `${name} on white`);
    assert.ok(contrast(s[name], s[`${name}-subtle`]) >= 4.5, `${name} on its tint`);
    for (const id of THEME_IDS) {
      const r = rolesOf(id);
      assert.ok(contrast(s[name], r.page) >= 4.5, `${name} on ${id} page`);
      assert.ok(contrast(s[name], r['surface-subtle']) >= 4.5, `${name} on ${id} subtle surface`);
    }
  }
  assert.ok(contrast(s['warning-border'], '#FFFFFF') >= 3, 'warning border');
  assert.ok(contrast(s['chart-2'], '#FFFFFF') >= 3, 'second chart colour');
});

test('the status colours are the same in every theme (defined once, outside the theme blocks)', () => {
  for (const id of THEME_IDS) {
    const r = rolesOf(id);
    for (const name of ['danger', 'warning', 'success']) assert.equal(r[name], undefined, `${id} should not redefine --${name}`);
  }
});
