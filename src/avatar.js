// Avatar: the interviewer's face. It comes in two kinds:
//   1. A drawn SVG face. Always available, and the fallback.
//   2. Real-looking video clips that you supply (see assets/interviewers/README.md).
// Either way, the rest of the app only calls setState('idle' | 'talking' | 'listening').
import { CLIPS_DIR } from './interviewers.js';

export const STATES = ['idle', 'talking', 'listening'];

const FADE_MS = 600; // cross-fade time between clips and at the loop point
const LOAD_TIMEOUT_MS = 10000;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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


/* ---------- Video face ---------- */

function makeVideo(src) {
  const v = document.createElement('video');
  v.className = 'clip-video';
  v.muted = true; // the voice is the browser's speech, never the clip
  v.playsInline = true;
  v.preload = 'auto';
  v.disablePictureInPicture = true;
  v.setAttribute('aria-hidden', 'true');
  v.src = src;
  return v;
}

const startPlaying = (video) => video.play().catch(() => {}); // autoplay can be refused; ignore

// A clip that loops smoothly. Two copies of the video take turns: near the end of one,
// the other starts from the beginning and the two cross-fade.
function createLoopingClip(src) {
  const videos = [makeVideo(src), makeVideo(src)];
  let current = 0;
  let watcher = null;
  const element = document.createElement('div');
  element.className = 'clip';
  element.append(...videos);
  videos[0].classList.add('on');

  function swap() {
    const from = videos[current];
    const to = videos[1 - current];
    to.currentTime = 0;
    startPlaying(to);
    to.classList.add('on');
    from.classList.remove('on');
    current = 1 - current;
    setTimeout(() => from.pause(), FADE_MS + 50);
  }
  function watch() {
    const v = videos[current];
    if (v.duration && v.duration - v.currentTime < FADE_MS / 1000 + 0.2) swap();
  }

  return {
    element,
    firstVideo: videos[0],
    play() {
      clearInterval(watcher);
      if (reducedMotion()) { // no movement: show the first frame
        videos.forEach((v) => v.pause());
        videos[current].currentTime = 0;
        return;
      }
      startPlaying(videos[current]);
      watcher = setInterval(watch, 100);
    },
    pause() {
      clearInterval(watcher);
      videos.forEach((v) => v.pause());
    },
    destroy() {
      clearInterval(watcher);
      videos.forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    },
  };
}

// Resolves when the video has its first frame. Rejects on error or timeout.
function whenLoaded(video) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve();
    video.addEventListener('loadeddata', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('video error')), { once: true });
    setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
  });
}

// The face made from the two clips in assets/interviewers/<folder>/
function createVideoFace(folder) {
  const clips = {
    listening: createLoopingClip(`${CLIPS_DIR}/${folder}/listening.mp4`),
    talking: createLoopingClip(`${CLIPS_DIR}/${folder}/talking.mp4`),
  };
  const element = document.createElement('div');
  element.className = 'video-face';
  element.append(clips.listening.element, clips.talking.element);
  let showing = null;

  // Show one clip and fade out the other
  function show(which) {
    if (showing === which) return;
    const other = which === 'talking' ? 'listening' : 'talking';
    showing = which;
    clips[which].play();
    clips[which].element.classList.add('on');
    clips[other].element.classList.remove('on');
    setTimeout(() => { if (showing !== other) clips[other].pause(); }, FADE_MS + 50);
  }

  return {
    element,
    async ready() {
      await Promise.all([whenLoaded(clips.listening.firstVideo), whenLoaded(clips.talking.firstVideo)]);
      // Match the shape of the clip (landscape or portrait), within sensible limits
      const { videoWidth: w, videoHeight: h } = clips.listening.firstVideo;
      if (w && h) element.style.aspectRatio = String(Math.min(16 / 9, Math.max(3 / 4, w / h)));
    },
    setState(state) { show(state === 'talking' ? 'talking' : 'listening'); },
    destroy() { clips.listening.destroy(); clips.talking.destroy(); },
  };
}

/* ---------- The avatar the page uses ---------- */

// Put the avatar inside `container` and return a small controller.
export function createAvatar(container) {
  container.innerHTML = `<div class="avatar-drawn">${SVG}</div>`;
  const drawnBox = container.firstElementChild;
  const svg = container.querySelector('svg');
  let state = 'idle';
  let face = null; // the video face, when one is in use
  let loadId = 0; // so a slow load cannot replace a newer choice

  function setState(next) {
    if (!STATES.includes(next)) return;
    state = next;
    // Swap the avatar--<state> class on the drawn face (it keeps up even when hidden)
    STATES.forEach((s) => svg.classList.toggle(`avatar--${s}`, s === next));
    face?.setState(next);
  }

  function removeVideoFace() {
    face?.destroy();
    face?.element.remove();
    face = null;
    container.classList.remove('has-video');
    drawnBox.hidden = false;
  }

  // Switch to an interviewer's clips (folder name), or back to the drawn face (empty folder).
  // Returns true on success, false if the clips could not be loaded (the drawn face is used).
  async function useInterviewer(folder) {
    const mine = ++loadId;
    removeVideoFace();
    if (!folder) return true;

    const candidate = createVideoFace(folder);
    candidate.element.hidden = true; // loads in the background; shown when ready
    container.append(candidate.element);
    try {
      await candidate.ready();
    } catch {
      candidate.destroy();
      candidate.element.remove();
      return false;
    }
    if (mine !== loadId) { // a newer choice arrived while this one was loading
      candidate.destroy();
      candidate.element.remove();
      return false;
    }
    face = candidate;
    drawnBox.hidden = true;
    candidate.element.hidden = false;
    container.classList.add('has-video');
    face.setState(state);
    return true;
  }

  return { setState, getState: () => state, useInterviewer };
}
