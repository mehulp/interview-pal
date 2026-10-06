// Avatar: a simple SVG interviewer with three states: idle, talking, listening.
// The state is set as a CSS class on the SVG; the animations live in styles.css.

export const STATES = ['idle', 'talking', 'listening'];

const SVG = `
<svg viewBox="0 0 200 200" role="img" aria-label="Interviewer avatar" class="avatar avatar--idle">
  <!-- Pulsing ring, only visible while listening -->
  <circle class="av-ring" cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="4"/>
  <!-- Head -->
  <g class="av-head">
    <circle cx="100" cy="100" r="80" fill="#f2c9a0"/>
    <!-- Hair -->
    <path d="M22 95 Q25 25 100 22 Q175 25 178 95 Q150 55 100 55 Q50 55 22 95Z" fill="#3a2a22"/>
    <!-- Eyebrows -->
    <g class="av-brows" stroke="#3a2a22" stroke-width="5" stroke-linecap="round">
      <line x1="58" y1="68" x2="86" y2="68"/>
      <line x1="114" y1="68" x2="142" y2="68"/>
    </g>
    <!-- Eyes (they blink while idle and listening) -->
    <g class="av-eyes" fill="#333">
      <ellipse class="av-eye" cx="72" cy="88" rx="8" ry="9"/>
      <ellipse class="av-eye" cx="128" cy="88" rx="8" ry="9"/>
    </g>
    <!-- Mouth: a smile line for idle/listening, an open mouth for talking -->
    <path class="av-smile" d="M72 130 Q100 150 128 130" stroke="#333" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse class="av-mouth" cx="100" cy="136" rx="16" ry="12" fill="#7a2e2e"/>
  </g>
</svg>`;

// Put the avatar inside `container` and return a small controller.
export function createAvatar(container) {
  container.innerHTML = SVG;
  const svg = container.querySelector('svg');
  let state = 'idle';

  function setState(next) {
    if (!STATES.includes(next)) return;
    state = next;
    // Swap the avatar--<state> class
    STATES.forEach((s) => svg.classList.toggle(`avatar--${s}`, s === next));
  }

  return { setState, getState: () => state };
}
