// Recorder: the microphone and MediaRecorder. This is the only file that records audio.
// It never saves anything: it hands the finished recording to the page, which decides.
//
// The tricky part is timing. Permission can be answered late, Stop can be pressed twice, the
// microphone can be unplugged, the recorder's last data arrives after Stop. So:
//   - `generation` is bumped whenever a recording is cancelled or replaced. Anything that
//     finishes for an older generation is ignored, and its microphone tracks are released.
//   - the state names and which events are allowed come from recordings.js (tested in Node).
import {
  MAX_RECORDING_MS, pickMimeType, nextRecorderState, canRecorderDo, describeMicError,
} from './recordings.js';

const STOP_WAIT_MS = 3000; // if the recorder never says it has stopped, use what we have

export function recordingProblem() {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'Unsupported';
  if (window.isSecureContext === false) return 'InsecureContext';
  return null;
}
export const isRecordingSupported = () => recordingProblem() === null;

// Open the microphone. With a chosen device, try it first. If that device cannot be opened (it
// was unplugged, say) fall back to the default, and say so. Permission being refused is never
// worked around.
async function openMicrophone(deviceId) {
  if (deviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      return { stream, fellBack: false };
    } catch (err) {
      if (err.name !== 'NotFoundError' && err.name !== 'OverconstrainedError') throw err;
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return { stream, fellBack: Boolean(deviceId) };
}

// handlers:
//   onState(state)            'idle' | 'requesting' | 'recording' | 'stopping'
//   onStarted(info)           recording began: { startedAt, deviceLabel, notice }
//   onFinished(result)        { blob, mimeType, durationMs, startedAt, deviceLabel, notice, reason }
//                             reason: 'user' | 'limit' | 'device-lost' | 'error'
//   onError(message)          the recording could not start, or produced nothing
export function createRecorder(handlers = {}) {
  let state = 'idle';
  let generation = 0;
  let current = null; // the recording in progress: { gen, stream, rec, chunks, ... }

  function move(event) {
    const next = nextRecorderState(state, event);
    if (next !== state) {
      state = next;
      handlers.onState?.(state);
    }
  }

  const release = (stream) => stream?.getTracks().forEach((t) => t.stop()); // the microphone light goes off

  // End a recording and hand over what was captured (unless it was cancelled meanwhile).
  function finalize(s) {
    if (s.finalized) return;
    s.finalized = true;
    clearTimeout(s.limitTimer);
    clearTimeout(s.stopTimer);
    release(s.stream);
    if (current === s) current = null;
    const wasCurrent = s.gen === generation;
    if (wasCurrent) move('stopped');
    if (!wasCurrent || s.cancelled) return;

    const blob = new Blob(s.chunks, { type: s.rec.mimeType || s.mimeType || 'audio/webm' });
    if (!blob.size) { handlers.onError?.('Nothing was recorded. Check the microphone and try again.'); return; }
    const durationMs = Math.round(Math.min(MAX_RECORDING_MS, Math.max(1, (s.stoppedAt || performance.now()) - s.clockStart)));
    handlers.onFinished?.({
      blob, mimeType: blob.type, durationMs, startedAt: s.startedAt,
      deviceLabel: s.deviceLabel, notice: s.notice, reason: s.reason,
    });
  }

  // Ask the recorder to stop. The data arrives in a moment, so finalize() runs from onstop (or
  // from a safety timer if that never comes).
  function endRecording(s, reason) {
    if (s.finalized || s.ending) return;
    s.ending = true;
    s.reason = reason;
    s.stoppedAt = performance.now();
    move('stop');
    s.stopTimer = setTimeout(() => finalize(s), STOP_WAIT_MS);
    try {
      if (s.rec.state !== 'inactive') s.rec.stop();
      else finalize(s);
    } catch {
      finalize(s);
    }
  }

  return {
    getState: () => state,
    isBusy: () => state !== 'idle',
    // Time since recording began. performance.now() cannot jump when the computer's clock is corrected.
    elapsedMs: () => (current && state === 'recording' ? performance.now() - current.clockStart : 0),

    // Start recording from the chosen microphone ('' = the default). Returns true if it began.
    async start({ deviceId = '' } = {}) {
      if (!canRecorderDo(state, 'start')) return false; // already busy: repeated clicks do nothing
      const problem = recordingProblem();
      if (problem) { handlers.onError?.(describeMicError(problem)); return false; }

      const gen = ++generation;
      move('start');
      let opened;
      try {
        opened = await openMicrophone(deviceId);
      } catch (err) {
        if (gen !== generation) return false; // cancelled while waiting: nothing to report
        move('denied');
        handlers.onError?.(describeMicError(err?.name));
        return false;
      }
      // Permission may have been answered after the user moved on: release the microphone and stop.
      if (gen !== generation || state !== 'requesting') { release(opened.stream); return false; }

      const track = opened.stream.getAudioTracks()[0];
      const deviceLabel = track?.label || 'Default microphone';
      const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
      let rec;
      try {
        rec = new MediaRecorder(opened.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      } catch (err) {
        release(opened.stream);
        move('denied');
        handlers.onError?.(describeMicError(err?.name));
        return false;
      }

      const s = {
        gen, stream: opened.stream, rec, chunks: [], mimeType, deviceLabel, startedAt: Date.now(), clockStart: performance.now(),
        notice: opened.fellBack ? `The microphone you chose could not be opened, so "${deviceLabel}" is being used instead.` : '',
        finalized: false, ending: false, cancelled: false, reason: 'user', stoppedAt: 0,
      };
      current = s;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) s.chunks.push(e.data); };
      rec.onstop = () => finalize(s);
      rec.onerror = () => endRecording(s, 'error');
      track?.addEventListener('ended', () => endRecording(s, 'device-lost')); // unplugged or taken away
      s.limitTimer = setTimeout(() => endRecording(s, 'limit'), MAX_RECORDING_MS);

      move('granted');
      rec.start(1000); // a piece every second, so little is lost if something goes wrong
      handlers.onStarted?.({ startedAt: s.startedAt, deviceLabel, notice: s.notice });
      return true;
    },

    // Stop and keep what was recorded. While still waiting for permission this just cancels.
    stop() {
      if (state === 'requesting') { generation++; move('stop'); return; }
      if (state === 'recording' && current) endRecording(current, 'user');
    },

    // Throw everything away (no result is delivered). Used when the page is being torn down.
    cancel() {
      generation++;
      const s = current;
      if (s && !s.finalized) {
        s.cancelled = true;
        s.finalized = true;
        clearTimeout(s.limitTimer);
        clearTimeout(s.stopTimer);
        try { if (s.rec.state !== 'inactive') s.rec.stop(); } catch { /* already stopped */ }
        release(s.stream);
        current = null;
      }
      if (state !== 'idle') { state = 'idle'; handlers.onState?.(state); }
    },
  };
}
