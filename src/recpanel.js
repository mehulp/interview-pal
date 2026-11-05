// Recorder panel and the shared "unsaved recording" panel.
//
// The Interview screen has a small recorder panel (Off / Audio / Video, target length, Stop, clock).
// Recording is driven by the answer: Start answer begins the chosen recording and Finish answer stops it and
// waits for the result (`beginForAnswer` / `finishForAnswer`, below). "Record again" in the review is the
// only other way to start one. With video on, a small mirrored preview of the camera shows in the corner of the
// portrait (the only live camera picture; nothing else on screen changes, nothing goes full
// screen). A finished recording becomes an UNSAVED ATTEMPT with a review panel (one panel, reused):
// it lives inside the answer workspace during a session, and otherwise in a tray at the foot of the
// page, with a one-line indicator in the header and a button to open it. It has Save, Download,
// Discard and (sometimes) Retry. A finishing recording never moves the page or the focus.
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
let trayOpen = false; // outside a session: has the user opened the review from the header indicator?
let previewHidden = false; // the user hid the recording preview (the recording itself is not affected)
let answerRec = null; // this answer's recording request: { mode, token, failure } (set by beginForAnswer)
let continueWithout = null; // set by the practice screen: called when "Continue without recording" is pressed
const FINALISE_MS = 5000; // the longest Finish answer waits for a recording; the recorder has its own, shorter, bound

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
    previewHidden = false;
    showLive(kind);
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
    $('rec-status').textContent = result.reason === 'limit' ? 'The recording reached its length limit and stopped. The interview carries on.' : '';
    // The review appears where it belongs (in the workspace, or announced by the header indicator). The page does
    // not scroll and focus does not move: the person may be reading or typing.
    renderDock();
    updatePanel();
    (pending.kind === 'video' ? videoPlayer : player).load(pending.blob);
  },
  onError: (message) => {
    recording = null;
    hidePreview();
    $('rec-status').textContent = message;
    if (answerRec) answerRec.failure = message; // remembered so the review can say the recording did not happen
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

/* ---------- The camera preview and the "recording" line ---------- */
// While video records, the one live camera picture is the stream being recorded (muted, so no echo, and
// mirrored by CSS; the recorded file is not mirrored). Self-view's own picture is hidden meanwhile by CSS
// (.recording-video) but its camera and state are untouched. The "Recording video" line stays whatever
// the preview is doing.
function showLive(kind) {
  $('rec-live-text').textContent = kind === 'video'
    ? '● Recording video (the file has only your camera and microphone)'
    : '● Recording audio';
  $('rec-preview-toggle').hidden = kind !== 'video';
  $('rec-live').hidden = false;
  syncPreviewToggle();
}
function syncPreviewToggle() {
  $('rec-preview-toggle').textContent = previewHidden ? 'Show preview' : 'Hide preview';
  $('rec-preview-toggle').setAttribute('aria-pressed', String(previewHidden));
}
function showPreview(stream) {
  const preview = $('rec-preview');
  preview.srcObject = stream;
  preview.play().catch(() => {});
  $('rec-preview-box').hidden = previewHidden;
  document.querySelector('.stage').classList.add('recording-video');
}
function hidePreview() {
  $('rec-preview').srcObject = null;
  $('rec-preview-box').hidden = true;
  $('rec-live').hidden = true;
  document.querySelector('.stage').classList.remove('recording-video');
}
$('rec-preview-toggle').addEventListener('click', () => {
  previewHidden = !previewHidden;
  $('rec-preview-box').hidden = previewHidden || !$('rec-preview').srcObject;
  syncPreviewToggle();
});
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
  $('rec-stop').hidden = !busy;
  $('rec-stop').disabled = state === 'stopping';
  $('rec-stop').textContent = state === 'requesting' ? 'Cancel' : '■ Stop recording';
  $('rec-target').disabled = busy;
  $('rec-custom').disabled = busy;
  for (const r of document.querySelectorAll('input[name="rec-mode"]')) r.disabled = busy;
  renderBlocked();
  // After the answer is handed in the recorder panel is out of the way, unless a recording is being retaken
  $('rec-panel').hidden = Boolean(context && context.phase === 'review') && !busy;
  $('rec-panel').classList.toggle('recording', state === 'recording');
  if (state === 'idle') {
    $('rec-clock').hidden = true;
    $('rec-panel').classList.remove('rec-reached');
    $('rec-device').textContent = avail.ok ? '' : avail.reason;
  } else if (state === 'requesting') {
    $('rec-device').textContent = 'Waiting for the microphone. Allow it in the browser prompt.';
  }
}

const readMode = () => document.querySelector('input[name="rec-mode"]:checked')?.value || 'off';
function resetMode() { $('rec-mode-off').checked = true; }
// The setup screen's Recording choice becomes the starting value here. It starts nothing: only Start answer does.
function setMode(mode) { const radio = $(`rec-mode-${mode}`); if (radio) radio.checked = true; else resetMode(); }

function startRecording(video) {
  const avail = recordAvailability({ supported: !recordingProblem(), recState: recorder.getState(), hasPending: Boolean(pending), current: context });
  if (!avail.ok) return false;
  // Captured now, before anything asynchronous happens, and kept with the attempt from here on
  recording = { snapshot: makeSnapshot(context, context.token), targetSec: readTarget(), kind: video ? 'video' : 'audio' };
  savedNote = ''; // a new recording started: the old "saved" message is out of date
  renderDock();
  $('rec-status').textContent = '';
  recorder.start({ deviceId: loadSettings().micDeviceId || '', video, videoTrack: video && cameraSource ? cameraSource() : null }).then((began) => {
    if (!began && recorder.getState() === 'idle' && !pending) { recording = null; hidePreview(); }
    updatePanel();
  });
  updatePanel();
  return true;
}

// ---- The answer drives the recording ----
// Start answer: begin the chosen recording. It does not wait for the microphone permission (the answer and its
// clocks carry on, and typing always works). Returns { state } where state is
//   'off' | 'skipped' (continue without recording) | 'starting' | 'blocked' (an earlier recording is waiting) |
//   'unsupported' | 'unavailable'
function beginForAnswer({ withoutRecording = false } = {}) {
  const mode = readMode();
  answerRec = { mode, token: context ? context.token : null, failure: '' };
  if (mode === 'off') { $('rec-status').textContent = 'Recording is off.'; return { state: 'off' }; }
  if (withoutRecording) {
    answerRec.mode = 'off';
    $('rec-status').textContent = 'This answer is not being recorded.';
    return { state: 'skipped' };
  }
  if (recordingProblem()) {
    const reason = recordAvailability({ supported: false }).reason;
    answerRec.failure = reason;
    $('rec-status').textContent = `${reason} You can still type your answer.`;
    return { state: 'unsupported' };
  }
  if (pending) { answerRec = null; renderBlocked(true); return { state: 'blocked' }; }
  if (!startRecording(mode === 'video')) { answerRec.failure = 'Recording could not start.'; return { state: 'unavailable' }; }
  return { state: 'starting' };
}

// Finish answer: stop the recording and wait (a bounded time) for the result to arrive. Never rejects.
// Returns { mode, recorded, failure }: `recorded` means an unsaved attempt for this question now exists.
async function finishForAnswer() {
  const request = answerRec;
  const state = recorder.getState();
  let failure = request ? request.failure : '';
  if (state !== 'idle') {
    if (state === 'requesting') { recording = null; hidePreview(); failure = failure || 'The microphone permission was still waiting, so nothing was recorded.'; }
    let timer;
    const outcome = await Promise.race([
      recorder.stop(),
      new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), FINALISE_MS); }),
    ]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      recording = null;
      recorder.cancel(); // let go of the microphone; no result will arrive
      hidePreview();
      failure = 'The recording could not be finished, so it was not kept.';
      $('rec-status').textContent = failure;
    }
    if (request && request.failure) failure = request.failure;
    else if (outcome === 'empty') failure = $('rec-status').textContent || 'Nothing was recorded.';
  }
  const recorded = Boolean(pending && request && pending.snapshot.token === request.token);
  updatePanel();
  return { mode: request ? request.mode : 'off', recorded, failure: recorded ? '' : failure };
}

// An earlier recording is still unsaved, so a new one is not started. Explain, and offer to carry on
// without recording for this answer only (the Off/Audio/Video choice is left as it was).
function renderBlocked(show) {
  if (show !== undefined) blockedShown = show;
  if (!pending) blockedShown = false;
  $('rec-blocked').hidden = !blockedShown;
  if (blockedShown) {
    $('rec-blocked-text').textContent = 'An earlier recording is still waiting: save it, download it or discard it (in the review below), then press Start answer again. Or carry on without recording this answer.';
  }
}
let blockedShown = false;
$('rec-continue-without').addEventListener('click', () => { blockedShown = false; renderBlocked(); continueWithout?.(); });

function stopRecording() {
  if (recorder.getState() === 'requesting') { // permission was still pending: nothing will come of it
    recording = null;
    hidePreview();
    if (answerRec && !answerRec.failure) answerRec.failure = 'The microphone permission was still waiting.';
  }
  recorder.stop();
  updatePanel();
}

$('rec-stop').addEventListener('click', stopRecording);

/* ---------- The unsaved recording panel ---------- */
// Where the review lives. During a session it is inside the answer workspace (so it is reachable while marking
// or reading feedback). Otherwise it is in the tray at the foot of the page, and the header shows a one-line
// indicator instead. It is always the same element, moved, so there is only ever one player of each kind.
const inWorkspace = () => context !== null;

function placeDock() {
  const host = inWorkspace() ? $('rec-review-slot') : $('rec-tray');
  const dock = $('rec-dock');
  if (dock.parentElement !== host) host.append(dock);
  dock.classList.toggle('rec-dock--inline', inWorkspace());
}

// "Earlier question" when the recording belongs to a question that is no longer the one on screen
const isEarlier = () => Boolean(pending) && (!context || context.token !== pending.snapshot.token);

function renderIndicator() {
  const needed = !inWorkspace() && Boolean(pending || savedNote);
  $('rec-indicator').hidden = !needed;
  if (!needed) return;
  const open = $('rec-indicator-open');
  if (pending) {
    const kind = pending.kind === 'video' ? 'video' : 'audio';
    const words = pending.snapshot.questionText.trim();
    $('rec-indicator-text').textContent = pending.saveState === 'failed'
      ? `Unsaved ${kind} recording (not saved: see the review) for "${words}"`
      : `Unsaved ${kind} recording for "${words}"`;
    open.hidden = false;
    open.textContent = trayOpen ? 'Hide review' : 'Open review';
    open.setAttribute('aria-expanded', String(trayOpen));
  } else {
    $('rec-indicator-text').textContent = savedNote;
    open.hidden = true;
  }
}

function renderDock() {
  placeDock();
  renderIndicator();
  const dock = $('rec-dock');
  const something = Boolean(pending || savedNote);
  // In a session the review is simply there; outside one it appears only when the user opens it
  dock.hidden = !something || (!inWorkspace() && !(trayOpen && pending));
  if (dock.hidden) return;
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
  const earlier = isEarlier() ? ' (earlier question)' : '';
  $('rec-dock').querySelector('h2').textContent = (isVideo ? 'Video recording (not saved)' : 'Unsaved recording') + earlier;
  const s = pending.snapshot;
  $('rec-dock-question').textContent = `For: "${s.questionText.trim()}"${s.setName ? ` (${s.setName})` : ''}`;
  const moved = context && context.token !== s.token ? ' This is not the question on screen now: you have moved on.' : '';
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
  $('rec-retry').textContent = 'Record again';
  if (retryOk) $('rec-dock-hint').textContent += ' Record again replaces only this recording: your answer text stays as handed in.';
  $('rec-dock-status').textContent = pending.message || '';
}

// The header indicator's button: show or put away the review (outside a session). Opening moves focus to the
// review, because the person asked for it.
$('rec-indicator-open').addEventListener('click', () => {
  trayOpen = !trayOpen;
  renderDock();
  if (trayOpen) $('rec-dock').querySelector('h2').focus();
  else $('rec-indicator-open').focus();
});

function clearPending() {
  pending = null;
  trayOpen = false;
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
  pending.message = 'Download started. Check your browser\'s downloads: this page cannot confirm the file was kept. You can keep replaying it here until you leave this page.';
  renderDock();
});
$('rec-retry').addEventListener('click', () => {
  // Only for the original question, while recording is allowed (checked again here, not just in the button)
  if (!pending || pending.saveState === 'saving' || !canRetry(pending.snapshot, context)) return;
  const again = pending.kind === 'video'; // retry the same kind of recording
  if (again && isAtRisk(pending) && !window.confirm('This video has not been downloaded. Discard it and record again?')) return;
  clearPending();
  startRecording(again);
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
  beginForAnswer,
  finishForAnswer,
  resetMode,
  setMode,
  mode: readMode,
  onContinueWithout: (fn) => { continueWithout = fn; },
  hasUnsaved: () => Boolean(pending),
  isRecording: () => recorder.isBusy(),
};
