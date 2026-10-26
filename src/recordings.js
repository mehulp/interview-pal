// Recordings: the rules for recording and saving spoken answers. No page code and no browser
// APIs here, so everything can be tested in Node. The microphone is in recorder.js and the
// saved audio is in recordstore.js.
import { normalize } from './sets.js';

export const MAX_RECORDING_MS = 10 * 60 * 1000; // an audio recording stops by itself after 10 minutes
export const MAX_VIDEO_MS = 7 * 60 * 1000; // a video recording stops by itself after 7 minutes
export const AUDIO_BITS_PER_SECOND = 64000;
export const VIDEO_BITS_PER_SECOND = 1000000; // modest quality: about 7 MB a minute
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // refuse to save anything bigger than this
export const TARGET_PRESETS = [0, 60, 90, 120, 180]; // seconds; 0 = no target
export const MIN_CUSTOM_TARGET = 10;
export const MAX_CUSTOM_TARGET = 600;

// Formats to try, best first. The first one this browser can record is used; the browser's own
// default is the last resort. Nothing is hard-coded: the format that was really used is saved.
export const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
];

// 'audio' or 'video', from the format the browser really used.
export const kindOf = (mimeType) => (String(mimeType || '').toLowerCase().startsWith('video/') ? 'video' : 'audio');
export const mimeCandidatesFor = (kind) => (kind === 'video' ? VIDEO_MIME_CANDIDATES : MIME_CANDIDATES);
export const maxDurationMs = (kind) => (kind === 'video' ? MAX_VIDEO_MS : MAX_RECORDING_MS);
// Videos are never kept by the app: the only way to keep one is the user's own Download.
export const canSaveInBrowser = (kind) => kind !== 'video';
// Something the user would lose by leaving the page or discarding: anything not yet saved or downloaded.
export const isAtRisk = (attempt) => Boolean(attempt) && !attempt.downloaded;


// isSupported(type) is MediaRecorder.isTypeSupported. Returns '' to let the browser choose.
export function pickMimeType(isSupported, candidates = MIME_CANDIDATES) {
  return candidates.find((type) => { try { return isSupported(type); } catch { return false; } }) || '';
}

// A file extension for a saved format.
export function extensionFor(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('webm')) return 'webm';
  if (type.startsWith('video/') && type.includes('mp4')) return 'mp4';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return 'audio';
}

/* ---------- Target length and the clock ---------- */

// A target in seconds: 0 (off), or a whole number from 10 to 600.
export function clampTarget(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_CUSTOM_TARGET, Math.max(MIN_CUSTOM_TARGET, n));
}

export function targetLabel(sec) {
  if (!sec) return 'No target';
  if (sec < 60 || sec % 60) return sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60} sec` : `${sec} sec`;
  return `${sec / 60} min`;
}

// m:ss, counting whole seconds (never rounds up, so "0:59" does not show as "1:00").
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Where a recording is against its target. Worked out from elapsed time, so it is right even
// if the page was in a background tab and its timers ran slowly.
export function timeState(elapsedMs, targetSec) {
  const elapsed = Math.max(0, elapsedMs);
  if (!targetSec) return { elapsedMs: elapsed, remainingMs: null, overMs: 0, reached: false };
  const targetMs = targetSec * 1000;
  return {
    elapsedMs: elapsed,
    remainingMs: Math.max(0, targetMs - elapsed),
    overMs: Math.max(0, elapsed - targetMs),
    reached: elapsed >= targetMs,
  };
}

/* ---------- The question an attempt belongs to ---------- */

export const questionKey = (text) => normalize(text);

// Captured when recording STARTS and kept with the attempt from then on. `token` identifies
// which asking of which question this was, so a later question is never mixed up with it.
export function makeSnapshot({ question, set = '', topic = '' }, token) {
  return { token, questionKey: questionKey(question), questionText: String(question), setName: set, topic };
}

// Retry only makes sense while the question the attempt was recorded for is still the active
// one, and the practice state lets the user record. `current` is { token, canRecord } or null.
export function canRetry(snapshot, current) {
  return Boolean(snapshot && current && current.canRecord && current.token === snapshot.token);
}

// Can a new recording be started right now? Returns { ok, reason }.
export function recordAvailability({ supported, recState, hasPending, current }) {
  if (!supported) return { ok: false, reason: 'This browser cannot record audio here. Recording needs Chrome or similar, on localhost or HTTPS.' };
  if (hasPending) return { ok: false, reason: 'Save or discard your last recording first.' };
  if (recState !== 'idle') return { ok: false, reason: '' };
  if (!current || !current.canRecord) return { ok: false, reason: 'You can record once the question has been asked.' };
  return { ok: true, reason: '' };
}

/* ---------- The recorder's states ---------- */
// idle -> requesting (waiting for the microphone permission) -> recording -> stopping -> idle.
// An event that makes no sense in the current state changes nothing, which is what makes
// repeated clicks and late callbacks harmless.
const TRANSITIONS = {
  idle: { start: 'requesting' },
  requesting: { granted: 'recording', denied: 'idle', cancel: 'idle', stop: 'idle' },
  recording: { stop: 'stopping', error: 'stopping', cancel: 'idle' },
  stopping: { stopped: 'idle', cancel: 'idle' },
};

export const nextRecorderState = (state, event) => TRANSITIONS[state]?.[event] ?? state;
export const canRecorderDo = (state, event) => Boolean(TRANSITIONS[state]?.[event]);

/* ---------- Plain messages for failures ---------- */

// The same, when the camera was being opened as well.
export function describeMediaError(name, kind = 'audio') {
  if (kind !== 'video') return describeMicError(name);
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera or microphone access was blocked. Allow both in the address bar, then try again. Audio-only recording is still available.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone was found. Connect one, or record audio only.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera or microphone could not be started. Another program may be using it.';
    default:
      return describeMicError(name);
  }
}

// error name -> something safe to show. `name` is the DOMException name.
export function describeMicError(name) {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was blocked. Allow it in the address bar, then try again. Typing still works.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one, or pick another in the Microphone list.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone could not be started. Another program may be using it.';
    case 'InsecureContext':
      return 'Recording needs the app to be opened from localhost or an https address.';
    case 'Unsupported':
      return 'This browser cannot record audio.';
    default:
      return 'The microphone could not be used.';
  }
}

// Saving to the browser's storage failed. kind: 'unavailable' | 'quota' | anything else.
export function describeStoreError(kind) {
  if (kind === 'unavailable') return 'This browser is not letting the app store recordings (private mode, or storage blocked). Download the recording instead.';
  if (kind === 'quota') return 'The browser has no room left to store this recording. Delete old recordings or free some disk space, or Download it instead.';
  return 'The recording could not be saved. Try Save again, or Download it so it is not lost.';
}

// What the browser said when asked to keep storage ("persistent storage").
export function describePersistence(status) {
  if (status === 'granted') return 'Your browser has agreed to keep recordings unless you clear site data.';
  if (status === 'denied') return 'Your browser has not promised to keep recordings. It may clear them if the disk is nearly full. Download important attempts.';
  if (status === 'unsupported') return 'This browser cannot promise to keep recordings. Download important attempts.';
  return 'Download any attempt you want to be sure to keep. Clearing site data deletes recordings.';
}

/* ---------- Checking and naming an attempt ---------- */

// Check a finished recording before it is saved. Returns { ok: true } or { ok: false, message }.
export function validateAttempt({ mimeType, size, durationMs }) {
  if (!canSaveInBrowser(kindOf(mimeType))) return { ok: false, message: 'Videos are not stored in this browser. Download it to keep it.' };
  if (!String(mimeType || '').toLowerCase().startsWith('audio/')) return { ok: false, message: 'That is not an audio recording, so it was not saved.' };
  if (!size || size <= 0) return { ok: false, message: 'The recording is empty, so there is nothing to save.' };
  if (size > MAX_AUDIO_BYTES) return { ok: false, message: 'The recording is too big to save (over 25 MB).' };
  if (!(durationMs > 0)) return { ok: false, message: 'The recording has no length, so it was not saved.' };
  return { ok: true };
}

const pad = (n) => String(n).padStart(2, '0');

// A safe file name for Download: letters, numbers and dashes only, no path characters.
export function downloadName({ questionText, createdAt, mimeType }) {
  const slug = String(questionText || 'answer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'answer';
  const d = new Date(createdAt);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `interviewpal-${slug}-${stamp}.${extensionFor(mimeType)}`;
}

// Group saved attempts by question, for the History list. Newest attempt first inside a group,
// and the group with the newest attempt first. Attempts of the same question are joined by
// their key, even if one was recorded under slightly different capitals or spaces.
export function groupByQuestion(attempts) {
  const groups = new Map();
  for (const a of [...attempts].sort((x, y) => y.createdAt - x.createdAt)) {
    if (!groups.has(a.questionKey)) groups.set(a.questionKey, { questionKey: a.questionKey, questionText: a.questionText, attempts: [] });
    groups.get(a.questionKey).attempts.push(a);
  }
  return [...groups.values()];
}
