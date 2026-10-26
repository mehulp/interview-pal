// Recorder: the microphone, the camera (when video is asked for) and MediaRecorder. This is the only file that records.
// It never saves anything: it hands the finished recording to the page, which decides.
//
// The tricky part is timing. Permission can be answered late, Stop can be pressed twice, the
// microphone can be unplugged, the recorder's last data arrives after Stop. So:
//   - `generation` is bumped whenever a recording is cancelled or replaced. Anything that
//     finishes for an older generation is ignored, and its microphone tracks are released.
//   - the state names and which events are allowed come from recordings.js (tested in Node).
import {
  pickMimeType, mimeCandidatesFor, maxDurationMs, kindOf, nextRecorderState, canRecorderDo, describeMediaError,
  AUDIO_BITS_PER_SECOND, VIDEO_BITS_PER_SECOND,
} from './recordings.js';

const STOP_WAIT_MS = 3000; // if the recorder never says it has stopped, use what we have
const VIDEO_CONSTRAINTS = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

export function recordingProblem() {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'Unsupported';
  if (window.isSecureContext === false) return 'InsecureContext';
  return null;
}
export const isRecordingSupported = () => recordingProblem() === null;

// Open the microphone (and the camera, if `video` constraints are given). With a chosen device,
// try it first. If that device cannot be opened (it was unplugged, say) fall back to the default,
// and say so. Permission being refused is never worked around.
async function openMicrophone(deviceId, video = false) {
  if (deviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video });
      return { stream, fellBack: false };
    } catch (err) {
      if (err.name !== 'NotFoundError' && err.name !== 'OverconstrainedError') throw err;
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  return { stream, fellBack: Boolean(deviceId) };
}

// The stream to record. For video: if self-view's camera is already on, take a COPY of its track
// (no second camera opening, and stopping the copy leaves self-view running). Otherwise ask for
// the camera together with the microphone, so there is one permission prompt.
async function openMedia(deviceId, { video, videoTrack }) {
  if (!video) return openMicrophone(deviceId, false);
  if (videoTrack && videoTrack.readyState === 'live') {
    const opened = await openMicrophone(deviceId, false);
    opened.stream.addTrack(videoTrack.clone());
    return opened;
  }
  return openMicrophone(deviceId, VIDEO_CONSTRAINTS);
}

// handlers:
//   onState(state)            'idle' | 'requesting' | 'recording' | 'stopping'
//   onStarted(info)           recording began: { startedAt, deviceLabel, notice, kind, stream }
//                             (`stream` is for a muted preview; the recorder still owns it)
//   onFinished(result)        { blob, mimeType, kind, durationMs, startedAt, deviceLabel, notice, reason }
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

    const blob = new Blob(s.chunks, { type: s.rec.mimeType || s.mimeType || (s.kind === 'video' ? 'video/webm' : 'audio/webm') });
    if (!blob.size) { handlers.onError?.('Nothing was recorded. Check the microphone and try again.'); return; }
    const durationMs = Math.round(Math.min(maxDurationMs(s.kind), Math.max(1, (s.stoppedAt || performance.now()) - s.clockStart)));
    handlers.onFinished?.({
      blob, mimeType: blob.type, kind: kindOf(blob.type), durationMs, startedAt: s.startedAt,
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
    // With `video: true` the camera is recorded too (`videoTrack` is self-view's live track, if any).
    async start({ deviceId = '', video = false, videoTrack = null } = {}) {
      if (!canRecorderDo(state, 'start')) return false; // already busy: repeated clicks do nothing
      const problem = recordingProblem();
      const kind = video ? 'video' : 'audio';
      if (problem) { handlers.onError?.(describeMediaError(problem, kind)); return false; }

      const gen = ++generation;
      move('start');
      let opened;
      try {
        opened = await openMedia(deviceId, { video, videoTrack });
      } catch (err) {
        if (gen !== generation) return false; // cancelled while waiting: nothing to report
        move('denied');
        handlers.onError?.(describeMediaError(err?.name, kind));
        return false;
      }
      // Permission may have been answered after the user moved on: release the microphone and stop.
      if (gen !== generation || state !== 'requesting') { release(opened.stream); return false; }

      const track = opened.stream.getAudioTracks()[0];
      const deviceLabel = track?.label || 'Default microphone';
      const hasVideo = opened.stream.getVideoTracks().length > 0;
      const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t), mimeCandidatesFor(hasVideo ? 'video' : 'audio'));
      let rec;
      try {
        rec = new MediaRecorder(opened.stream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
          ...(hasVideo ? { videoBitsPerSecond: VIDEO_BITS_PER_SECOND } : {}),
        });
      } catch (err) {
        release(opened.stream);
        move('denied');
        handlers.onError?.(describeMediaError(err?.name, kind));
        return false;
      }

      const s = {
        gen, stream: opened.stream, rec, chunks: [], mimeType, deviceLabel, kind: hasVideo ? 'video' : 'audio', startedAt: Date.now(), clockStart: performance.now(),
        notice: opened.fellBack ? `The microphone you chose could not be opened, so "${deviceLabel}" is being used instead.` : '',
        finalized: false, ending: false, cancelled: false, reason: 'user', stoppedAt: 0,
      };
      current = s;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) s.chunks.push(e.data); };
      rec.onstop = () => finalize(s);
      rec.onerror = () => endRecording(s, 'error');
      // Unplugged or taken away: the microphone or the camera
      opened.stream.getTracks().forEach((t) => t.addEventListener('ended', () => endRecording(s, 'device-lost')));
      s.limitTimer = setTimeout(() => endRecording(s, 'limit'), maxDurationMs(s.kind));

      move('granted');
      rec.start(1000); // a piece every second, so little is lost if something goes wrong
      handlers.onStarted?.({ startedAt: s.startedAt, deviceLabel, notice: s.notice, kind: s.kind, stream: s.stream });
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
