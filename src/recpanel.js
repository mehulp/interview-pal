// Recorder panel and the shared "unsaved recording" panel.
//
// The Interview screen has a small recorder panel (target length, Include video, Record, Stop,
// clock). With video on, a small mirrored preview of the camera shows in the panel; nothing
// else on screen changes and nothing goes full screen. A
// finished recording becomes an UNSAVED ATTEMPT, shown in a panel at the top of the page that
// stays visible on every tab. It has Save, Download, Discard and (sometimes) Retry.
//
// Rules this file keeps:
//   - the question is captured when Record is pressed and travels with the attempt, so an attempt
//     can never end up attached to a question that came later;
//   - recording stops when the question stops being the one being answered (Next, Skip, End
//     session, time up, switching tabs);
//   - only one unsaved attempt at a time; a failed save keeps the audio so it can be retried;
//   - a VIDEO is never stored by the app: no Save, only Download, with warnings until it is downloaded.
import { createRecorder, recordingProblem } from './recorder.js';
import { createPlayer } from './playback.js';
import { saveAttempt, listAttempts, requestPersistence } from './recordstore.js';
import { loadSettings, saveSettings } from './storage.js';
import { renderAttemptList, closeActivePlayer, downloadBlob } from './recordingsview.js';
import {
  TARGET_PRESETS, clampTarget, targetLabel, formatClock, timeState, makeSnapshot, questionKey, canRetry,
  recordAvailability, validateAttempt, downloadName, describeStoreError, canSaveInBrowser, isAtRisk,
} from './recordings.js';

const $ = (id) => document.getElementById(id);

let context = null; // the question on screen: { token, question, set, topic, canRecord } or null
let recording = null; // captured when Record is pressed: { snapshot, targetSec }
let pending = null; // the unsaved attempt: { snapshot, blob, mimeType, durationMs, startedAt, targetSec, deviceLabel, notice, reason, saveState, message }
let savedNote = ''; // a short "saved" message shown in the panel after saving
let savedNoteTimer = null;
let tickTimer = null;
let reachedAnnounced = false;
let persistenceAsked = false;
let savedLoad = 0;
let cameraSource = null; // () => self-view's live camera track or null (set by the practice screen)

const onPlayerProblem = (message) => { if (pending) { pending.message = message; renderDock(); } };
const player = createPlayer($('rec-audio'), { onProblem: onPlayerProblem });
const videoPlayer = createPlayer($('rec-video-player'), { onProblem: onPlayerProblem });

/* ---------- The recorder ---------- */
const recorder = createRecorder({
  onState: (state) => {
    if (state === 'recording') startTicking();
    else stopTicking();
    if (state === 'idle' || state === 'stopping') hidePreview();
    updatePanel();
  },
  onStarted: ({ deviceLabel, notice, kind, stream }) => {
    reachedAnnounced = false;
    const text = `Recording ${kind === 'video' ? 'video ' : ''}with: ${deviceLabel}.${notice ? ' ' + notice : ''}`;
    $('rec-device').textContent = text;
    $('rec-status').textContent = '';
    if (kind === 'video') showPreview(stream);
    tick();
  },
  onFinished: (result) => {
    if (!recording) return; // nothing is waiting for it
    const reasons = {
      limit: result.kind === 'video' ? 'It stopped by itself at the 7-minute limit.' : 'It stopped by itself at the 10-minute limit.',
      'device-lost': 'The microphone was disconnected, so the recording ends where it stopped.',
      error: 'The recorder had a problem, so the recording ends where it stopped.',
    };
    pending = {
      snapshot: recording.snapshot, targetSec: recording.targetSec, ...result,
      saveState: 'review', downloaded: false,
      message: [result.kind === 'video' ? 'This video is not stored in the browser. Download it to keep it.' : '', reasons[result.reason] || ''].filter(Boolean).join(' '),
    };
    recording = null;
    $('rec-status').textContent = '';
    renderDock();
    updatePanel();
    // The panel is at the top of the page: bring it into view so a finished recording is not missed
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    $('rec-dock').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    (pending.kind === 'video' ? videoPlayer : player).load(pending.blob);
  },
  onError: (message) => {
    recording = null;
    hidePreview();
    $('rec-status').textContent = message;
    updatePanel();
  },
});

/* ---------- The clock (from timestamps, so a background tab stays right) ---------- */
function tick() {
  if (recorder.getState() !== 'recording' || !recording) return;
  const ms = recorder.elapsedMs();
  const t = timeState(ms, recording.targetSec);
  const clock = $('rec-clock');
  clock.hidden = false;
  if (!recording.targetSec) clock.textContent = `${formatClock(ms)} (no target)`;
  else if (t.reached) clock.textContent = `${formatClock(ms)} · target reached (+${formatClock(t.overMs)} over)`;
  else clock.textContent = `${formatClock(ms)} · ${formatClock(t.remainingMs)} left of ${targetLabel(recording.targetSec)}`;
  $('rec-panel').classList.toggle('rec-reached', t.reached);
  if (t.reached && !reachedAnnounced) {
    reachedAnnounced = true;
    $('rec-status').textContent = 'Target reached. Recording continues.';
  }
}

/* ---------- The small camera preview (video only) ---------- */
// The preview is the stream that is being recorded, muted so there is no echo and mirrored by CSS
// (the recorded file is not mirrored). It lives in the recorder panel; nothing else changes.
function showPreview(stream) {
  const preview = $('rec-preview');
  preview.srcObject = stream;
  preview.play().catch(() => {});
  $('rec-preview-box').hidden = false;
}
function hidePreview() {
  $('rec-preview').srcObject = null;
  $('rec-preview-box').hidden = true;
}
function startTicking() { stopTicking(); tickTimer = setInterval(tick, 250); }
function stopTicking() { clearInterval(tickTimer); tickTimer = null; }
document.addEventListener('visibilitychange', tick); // catch up straight away when you come back to the tab

/* ---------- The recorder panel ---------- */
function readTarget() {
  const choice = $('rec-target').value;
  return choice === 'custom' ? clampTarget($('rec-custom').value) : Number(choice);
}

function setupTarget() {
  const saved = clampTarget(loadSettings().answerTargetSec);
  if (TARGET_PRESETS.includes(saved)) $('rec-target').value = String(saved);
  else { $('rec-target').value = 'custom'; $('rec-custom').value = String(saved); }
  $('rec-custom-row').hidden = $('rec-target').value !== 'custom';
}
$('rec-target').addEventListener('change', () => {
  const custom = $('rec-target').value === 'custom';
  $('rec-custom-row').hidden = !custom;
  if (custom && !$('rec-custom').value) $('rec-custom').value = '90';
  saveSettings({ answerTargetSec: readTarget() });
});
$('rec-custom').addEventListener('change', () => {
  $('rec-custom').value = String(clampTarget($('rec-custom').value) || '');
  saveSettings({ answerTargetSec: readTarget() });
});

function updatePanel() {
  const state = recorder.getState();
  const avail = recordAvailability({ supported: !recordingProblem(), recState: state, hasPending: Boolean(pending), current: context });
  const busy = state !== 'idle';
  $('rec-btn').hidden = busy;
  $('rec-btn').disabled = !avail.ok;
  $('rec-stop').hidden = !busy;
  $('rec-stop').disabled = state === 'stopping';
  $('rec-stop').textContent = state === 'requesting' ? 'Cancel' : '■ Stop recording';
  $('rec-target').disabled = busy;
  $('rec-custom').disabled = busy;
  $('rec-video').disabled = busy || Boolean(pending);
  $('rec-panel').classList.toggle('recording', state === 'recording');
  if (state === 'idle') {
    $('rec-clock').hidden = true;
    $('rec-panel').classList.remove('rec-reached');
    $('rec-device').textContent = avail.ok ? '' : avail.reason;
  } else if (state === 'requesting') {
    $('rec-device').textContent = 'Waiting for the microphone. Allow it in the browser prompt.';
  }
}

function startRecording() {
  const avail = recordAvailability({ supported: !recordingProblem(), recState: recorder.getState(), hasPending: Boolean(pending), current: context });
  if (!avail.ok) return;
  // Captured now, before anything asynchronous happens, and kept with the attempt from here on
  const video = $('rec-video').checked;
  recording = { snapshot: makeSnapshot(context, context.token), targetSec: readTarget(), kind: video ? 'video' : 'audio' };
  savedNote = ''; // a new recording started: the old "saved" message is out of date
  renderDock();
  $('rec-status').textContent = '';
  recorder.start({ deviceId: loadSettings().micDeviceId || '', video, videoTrack: video && cameraSource ? cameraSource() : null }).then((began) => {
    if (!began && recorder.getState() === 'idle' && !pending) { recording = null; hidePreview(); }
    updatePanel();
  });
  updatePanel();
}

function stopRecording() {
  if (recorder.getState() === 'requesting') { recording = null; hidePreview(); } // permission was still pending: nothing will come of it
  recorder.stop();
  updatePanel();
}

$('rec-btn').addEventListener('click', startRecording);
$('rec-stop').addEventListener('click', stopRecording);

/* ---------- The unsaved recording panel ---------- */
function renderDock() {
  const dock = $('rec-dock');
  if (!pending && !savedNote) { dock.hidden = true; return; }
  dock.hidden = false;
  const has = Boolean(pending);
  const isVideo = has && pending.kind === 'video';
  $('rec-audio').hidden = !has || isVideo;
  $('rec-video-player').hidden = !isVideo;
  $('rec-save').hidden = !has || !canSaveInBrowser(pending.kind); // a video has no Save: Download is the only way to keep it
  $('rec-download').hidden = !has;
  $('rec-download').textContent = isVideo ? 'Download video' : 'Download';
  $('rec-download').className = isVideo ? 'big' : 'small';
  $('rec-discard').hidden = !has;
  $('rec-dock-hint').textContent = isVideo
    ? 'This video exists only on this page. Download it to keep it: closing the page or discarding loses it.'
    : 'Saved recordings stay in this browser, on this address. An unsaved recording is lost if you close the page.';
  if (!has) {
    $('rec-dock').querySelector('h2').textContent = 'Recording saved';
    $('rec-dock-question').textContent = '';
    $('rec-dock-meta').textContent = '';
    $('rec-retry').hidden = true;
    $('rec-dock-status').textContent = savedNote;
    return;
  }
  $('rec-dock').querySelector('h2').textContent = isVideo ? 'Video recording (not saved)' : 'Unsaved recording';
  const s = pending.snapshot;
  $('rec-dock-question').textContent = `For: "${s.questionText.trim()}"${s.setName ? ` (${s.setName})` : ''}`;
  const moved = context && context.token !== s.token ? ' You have moved on to another question.' : '';
  const where = !context ? ' It is from an earlier question.' : '';
  $('rec-dock-meta').textContent =
    `Length ${formatClock(pending.durationMs)} · target ${targetLabel(pending.targetSec)} · microphone: ${pending.deviceLabel || 'unknown'}.${moved}${where}`
    + (pending.notice ? ` ${pending.notice}` : '');
  const saving = pending.saveState === 'saving';
  $('rec-save').disabled = saving;
  $('rec-save').textContent = saving ? 'Saving…' : pending.saveState === 'failed' ? 'Try saving again' : 'Save';
  $('rec-discard').disabled = saving;
  const retryOk = canRetry(s, context) && recorder.getState() === 'idle' && !saving;
  $('rec-retry').hidden = !retryOk;
  $('rec-dock-status').textContent = pending.message || '';
}

function clearPending() {
  pending = null;
  player.clear(); // releases the temporary address of the audio or video
  videoPlayer.clear();
  renderDock();
  updatePanel();
}

async function savePending() {
  if (!pending || pending.saveState === 'saving') return; // repeated clicks do nothing
  if (!canSaveInBrowser(pending.kind)) return; // a video is never stored: Download is the only way
  const check = validateAttempt({ mimeType: pending.mimeType, size: pending.blob.size, durationMs: pending.durationMs });
  if (!check.ok) { pending.message = check.message; renderDock(); return; }
  const attempt = pending; // keep this one, even if something changes while saving
  attempt.saveState = 'saving';
  attempt.message = '';
  renderDock();
  const s = attempt.snapshot;
  try {
    await saveAttempt({
      questionKey: s.questionKey, questionText: s.questionText, setName: s.setName, topic: s.topic,
      createdAt: attempt.startedAt, targetSec: attempt.targetSec, durationMs: attempt.durationMs,
      mimeType: attempt.mimeType, deviceLabel: attempt.deviceLabel,
    }, attempt.blob);
  } catch (err) {
    attempt.saveState = 'failed'; // the audio is still here: try again, or Download
    attempt.message = describeStoreError(err.kind);
    renderDock();
    return;
  }
  if (pending === attempt) clearPending();
  showSavedNote('Saved. Find it under the question, or on the History tab.');
  refreshSaved();
  if (!persistenceAsked) { persistenceAsked = true; requestPersistence(); } // ask the browser to keep it, once
}

function showSavedNote(text) {
  savedNote = text;
  clearTimeout(savedNoteTimer);
  savedNoteTimer = setTimeout(() => { savedNote = ''; renderDock(); }, 5000);
  renderDock();
  $('rec-status').textContent = text;
}

$('rec-save').addEventListener('click', savePending);
$('rec-discard').addEventListener('click', () => {
  if (!pending || pending.saveState === 'saving') return;
  // A video that has not been downloaded would be lost for good: make sure that is what was meant
  if (pending.kind === 'video' && isAtRisk(pending) && !window.confirm('This video has not been downloaded. Discard it and lose it?')) return;
  clearPending();
});
$('rec-download').addEventListener('click', () => {
  if (!pending) return;
  downloadBlob(pending.blob, downloadName({ questionText: pending.snapshot.questionText, createdAt: pending.startedAt, mimeType: pending.mimeType }));
  pending.downloaded = true;
  pending.message = 'Downloaded. Check your browser\'s downloads. You can keep replaying it here until you leave this page.';
  renderDock();
});
$('rec-retry').addEventListener('click', () => {
  // Only for the original question, while recording is allowed (checked again here, not just in the button)
  if (!pending || pending.saveState === 'saving' || !canRetry(pending.snapshot, context)) return;
  const again = pending.kind === 'video'; // retry the same kind of recording
  if (again && isAtRisk(pending) && !window.confirm('This video has not been downloaded. Discard it and record again?')) return;
  $('rec-video').checked = again;
  clearPending();
  startRecording();
});

/* ---------- Saved attempts for the current question ---------- */
async function refreshSaved() {
  const mine = ++savedLoad;
  const box = $('rec-saved');
  if (!context) { box.hidden = true; closeActivePlayer(); return; }
  let attempts;
  try {
    attempts = await listAttempts({ questionKey: questionKey(context.question) }); // details only
  } catch {
    if (mine === savedLoad) box.hidden = true; // storage not available: the panel just does not show this list
    return;
  }
  if (mine !== savedLoad) return;
  box.hidden = attempts.length === 0;
  $('rec-saved-summary').textContent = `Saved recordings for this question (${attempts.length})`;
  renderAttemptList($('rec-saved-list'), attempts, { onChanged: refreshSaved });
}

/* ---------- Called by the practice screen ---------- */
// The question now on screen, or null when there is no session. Recording is only valid while this
// question is the one being answered, so anything else stops it.
function setContext(next) {
  const previous = context;
  context = next;
  const stillValid = next && next.canRecord && (!recording || recording.snapshot.token === next.token);
  if (recorder.isBusy() && !stillValid) stopRecording();
  if ((previous && previous.token) !== (next && next.token)) refreshSaved();
  renderDock();
  updatePanel();
}

// Warn before leaving while recording or with an unsaved attempt. This is only a warning: an
// unsaved recording is not recovered after a crash or a forced close.
window.addEventListener('beforeunload', (event) => {
  if (recorder.isBusy() || isAtRisk(pending)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => recorder.cancel()); // always let go of the microphone

setupTarget();
updatePanel();

export const recPanel = {
  setContext,
  setCameraSource: (fn) => { cameraSource = fn; }, // where to find self-view's camera track
  stopRecording,
  hasUnsaved: () => Boolean(pending),
  isRecording: () => recorder.isBusy(),
};
