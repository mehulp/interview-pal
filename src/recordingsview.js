// Recordings view: draws saved attempts (under the current question, and on the History tab),
// plays them, downloads them and deletes them. All text is set with textContent.
// Audio is read from the store only when an attempt is played or downloaded.
import { listAttempts, getAudio, deleteAttempt, usage, persistenceStatus } from './recordstore.js';
import { createPlayer } from './playback.js';
import {
  groupByQuestion, formatClock, targetLabel, downloadName, describePersistence, describeStoreError,
} from './recordings.js';

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

// Save a Blob as a file. The temporary address is released shortly after the download starts.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- One player at a time ---------- */
let active = null; // { id, player, audioEl, button }

export function closeActivePlayer() {
  if (!active) return;
  active.player.clear(); // releases the temporary address
  active.audioEl.remove();
  active.button.textContent = 'Play';
  active = null;
}

async function togglePlay(attempt, row, button, setStatus) {
  if (active && active.id === attempt.id) { closeActivePlayer(); return; }
  closeActivePlayer(); // the previous player is replaced: let go of its audio
  button.disabled = true;
  try {
    const blob = await getAudio(attempt.id); // the audio is read now, and only now
    if (!blob) { setStatus('That recording is no longer stored.'); return; }
    const audioEl = el('audio', { controls: true, preload: 'auto' });
    const player = createPlayer(audioEl, { onProblem: setStatus });
    row.insertBefore(audioEl, row.querySelector('.buttons'));
    active = { id: attempt.id, player, audioEl, button };
    button.textContent = 'Close player';
    setStatus('');
    await player.load(blob);
    audioEl.play().catch(() => {}); // the browser may want a click on the player first
  } catch (err) {
    setStatus(describeStoreError(err.kind));
  } finally {
    button.disabled = false;
  }
}

function attemptRow(attempt, { onChanged, setStatus }) {
  const when = new Date(attempt.createdAt).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const detail = [
    `Target: ${targetLabel(attempt.targetSec)}`,
    `Actual: ${formatClock(attempt.durationMs)}`,
    attempt.deviceLabel && `Microphone: ${attempt.deviceLabel}`,
  ].filter(Boolean).join(' · ');

  const playBtn = el('button', { type: 'button', className: 'small', textContent: 'Play' });
  const downloadBtn = el('button', { type: 'button', className: 'small', textContent: 'Download' });
  const deleteBtn = el('button', { type: 'button', className: 'small danger', textContent: 'Delete' });
  const row = el('div', { className: 'rec-attempt' }, [
    el('p', { className: 'rec-attempt-title', textContent: when }),
    el('p', { className: 'hint', textContent: detail }),
    el('div', { className: 'buttons' }, [playBtn, downloadBtn, deleteBtn]),
  ]);

  playBtn.addEventListener('click', () => togglePlay(attempt, row, playBtn, setStatus));
  downloadBtn.addEventListener('click', async () => {
    try {
      const blob = await getAudio(attempt.id);
      if (blob) downloadBlob(blob, downloadName(attempt));
      else setStatus('That recording is no longer stored.');
    } catch (err) {
      setStatus(describeStoreError(err.kind));
    }
  });
  deleteBtn.addEventListener('click', async () => {
    if (!window.confirm('Delete this recording? This cannot be undone.')) return;
    if (active && active.id === attempt.id) closeActivePlayer();
    try {
      await deleteAttempt(attempt.id);
      onChanged?.();
    } catch (err) {
      setStatus(describeStoreError(err.kind));
    }
  });
  return row;
}

// Draw a list of attempts (details only) into `container`.
export function renderAttemptList(container, attempts, { onChanged } = {}) {
  closeActivePlayer();
  const status = el('p', { className: 'status', role: 'status' });
  const setStatus = (text) => { status.textContent = text; };
  container.replaceChildren(...attempts.map((a) => attemptRow(a, { onChanged, setStatus })), status);
}

/* ---------- The Recordings card on the History tab ---------- */
let cardLoad = 0;

export async function renderRecordingsCard(container) {
  const mine = ++cardLoad;
  closeActivePlayer();
  container.replaceChildren(el('h2', { textContent: 'Recordings' }), el('p', { className: 'hint', textContent: 'Loading…' }));
  let attempts;
  let totals;
  let persisted;
  try {
    attempts = await listAttempts(); // details only, no audio
    totals = await usage();
    persisted = await persistenceStatus();
  } catch (err) {
    if (mine !== cardLoad) return;
    container.replaceChildren(el('h2', { textContent: 'Recordings' }), el('p', { className: 'hint', textContent: describeStoreError(err.kind) }));
    return;
  }
  if (mine !== cardLoad) return; // a newer refresh is on its way

  const parts = [el('h2', { textContent: 'Recordings' })];
  if (!attempts.length) {
    parts.push(el('p', { className: 'hint', textContent: 'No saved recordings yet. On the Interview tab, press Record while you answer, then Save.' }));
  } else {
    const mb = (totals.bytes / (1024 * 1024)).toFixed(1);
    parts.push(el('p', { className: 'hint', textContent: `${totals.count} recording(s), about ${mb} MB, kept in this browser at this address only.` }));
    for (const group of groupByQuestion(attempts)) {
      const holder = el('div');
      const refresh = () => renderRecordingsCard(container);
      renderAttemptList(holder, group.attempts, { onChanged: refresh });
      parts.push(el('div', { className: 'rec-group' }, [
        el('h3', { textContent: `${group.questionText.trim()} (${group.attempts.length})` }),
        holder,
      ]));
    }
  }
  parts.push(el('p', { className: 'hint', textContent: describePersistence(persisted) }));
  container.replaceChildren(...parts);
}
