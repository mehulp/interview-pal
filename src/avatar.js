// Avatar: the interviewer's face. It comes in three kinds:
//   1. A drawn SVG face. Always available, and the fallback.
//   2. Photos of a real-looking person that you supply, swapped to blink and talk.
//   3. Video clips that you supply.
// See assets/interviewers/README.md for 2 and 3.
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

/* ---------- Photo face (a few still photos of one person) ---------- */

const BLINK_MS = 140;
const rand = (min, max) => min + Math.random() * (max - min);

// Swaps between your photos: slow expression changes and blinks while listening,
// quick mouth-open and closed frames while talking. (Exported so it can be tested.)
export function createPhotoFace(entry) {
  const dir = `${CLIPS_DIR}/${entry.folder}`;
  const f = entry.frames;
  const files = [...new Set([f.neutral, f.neutral2, f.blink, ...f.talk].filter(Boolean))];

  const element = document.createElement('div');
  element.className = 'photo-face';
  const images = {};
  for (const file of files) {
    const img = new Image();
    img.className = 'photo-frame';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.src = `${dir}/${file}`;
    images[file] = img;
    element.append(img);
  }

  let z = 0;
  let current = null; // the frame on top right now
  let wanted = f.neutral; // the frame the state wants (a blink returns to it)
  let state = 'listening';
  let stepTimer = null;
  let blinkTimer = null;

  // Put a frame on top of the others and fade it in. The frames underneath stay fully visible,
  // so the picture never dips to the dark background in the middle of a fade.
  function show(file, fadeMs = 90) {
    if (current === file) return;
    current = file;
    const img = images[file];
    const ms = reducedMotion() ? 0 : fadeMs;
    img.style.transition = 'none';
    img.style.opacity = '0';
    img.style.zIndex = String(++z);
    void img.offsetWidth; // make the browser notice the start point before fading
    img.style.transition = `opacity ${ms}ms linear`;
    img.style.opacity = '1';
  }

  function stopLoops() {
    clearTimeout(stepTimer);
    clearTimeout(blinkTimer);
  }

  // Blink now and then (not when reduced motion is on)
  function scheduleBlink() {
    blinkTimer = setTimeout(() => {
      show(f.blink, 40);
      setTimeout(() => show(wanted, 60), BLINK_MS);
      scheduleBlink();
    }, rand(2500, 6000));
  }

  // Listening: mostly the neutral frame, sometimes the second one for a small change of expression
  function listenStep() {
    wanted = wanted === f.neutral && f.neutral2 ? f.neutral2 : f.neutral;
    show(wanted, 500);
    stepTimer = setTimeout(listenStep, rand(3000, 7000));
  }

  // Talking: open-mouth frames mixed with the closed (neutral) one, never the same frame twice in a row
  function talkStep() {
    const pool = Math.random() < 0.3 ? [f.neutral] : f.talk;
    const choices = pool.filter((file) => file !== wanted);
    wanted = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))];
    show(wanted, 90);
    stepTimer = setTimeout(talkStep, rand(110, 240));
  }

  return {
    element,
    async ready() {
      await Promise.all(Object.values(images).map((img) => new Promise((resolve, reject) => {
        if (img.complete && img.naturalWidth) return resolve();
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', () => reject(new Error('image error')), { once: true });
        setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
      })));
    },
    setState(next) {
      const nextState = next === 'talking' ? 'talking' : 'listening';
      if (nextState === state && current) return;
      state = nextState;
      stopLoops();
      if (reducedMotion()) { // no movement: one still frame for each state
        wanted = state === 'talking' ? f.talk[0] : f.neutral;
        show(wanted, 0);
        return;
      }
      if (state === 'talking') talkStep();
      else { wanted = f.neutral; show(f.neutral, 200); stepTimer = setTimeout(listenStep, rand(3000, 7000)); }
      scheduleBlink();
    },
    destroy() {
      stopLoops();
      Object.values(images).forEach((img) => img.removeAttribute('src'));
    },
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

  // Switch to an installed interviewer (photos or clips), or back to the drawn face (null).
  // Returns true on success, false if the files could not be loaded (the drawn face is used).
  async function useInterviewer(entry) {
    const mine = ++loadId;
    removeVideoFace();
    if (!entry) return true;

    const candidate = entry.frames ? createPhotoFace(entry) : createVideoFace(entry.folder);
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
