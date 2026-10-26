// Recordstore: saved recordings, kept in this browser's IndexedDB (audio does not fit in localStorage).
// This is the only file that touches IndexedDB. Two stores, saved and deleted together:
//   attempts : the details (question, dates, lengths, format, microphone). Small, so lists are quick.
//   audio    : { id, blob }. Read only when a recording is played or downloaded.
// Failures are turned into an Error with a `kind`: 'unavailable', 'quota' or 'failed'.
import { newId } from './sets.js';

const DB_NAME = 'interviewpal-recordings';
const DB_VERSION = 1;

export class StoreError extends Error {
  constructor(kind, cause) {
    super(`recordstore: ${kind}`);
    this.kind = kind;
    this.cause = cause;
  }
}

// What went wrong, in terms the page can explain.
function classify(err) {
  if (err instanceof StoreError) return err;
  const name = err?.name || '';
  if (name === 'QuotaExceededError') return new StoreError('quota', err);
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'UnknownError' || name === 'NotAllowedError') return new StoreError('unavailable', err);
  return new StoreError('failed', err);
}

export const isStoreAvailable = () => typeof indexedDB !== 'undefined' && indexedDB !== null;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!isStoreAvailable()) { reject(new StoreError('unavailable')); return; }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(classify(err));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
      attempts.createIndex('questionKey', 'questionKey');
      db.createObjectStore('audio', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; }; // another tab upgraded the store
      resolve(db);
    };
    request.onerror = () => reject(classify(request.error));
    request.onblocked = () => reject(new StoreError('unavailable'));
  }).catch((err) => {
    dbPromise = null; // try again next time
    throw err;
  });
  return dbPromise;
}

// Run work inside one transaction. `work(stores)` may start requests; resolves with its return
// value once the transaction has really been committed.
async function transaction(storeNames, mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    let result;
    try {
      tx = db.transaction(storeNames, mode);
      const stores = Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]));
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(classify(tx.error));
      tx.onerror = () => {}; // the abort handler reports it
      result = work(stores, (value) => { result = value; });
    } catch (err) {
      try { tx?.abort(); } catch { /* already finished */ }
      reject(classify(err));
    }
  });
}

const requestValue = (request, set) => { request.onsuccess = () => set(request.result); };

// Save one attempt: the details and the audio, together or not at all.
// `details` has questionKey, questionText, setName, topic, createdAt, targetSec, durationMs,
// mimeType, deviceLabel. Returns the details as saved (with id and size).
export async function saveAttempt(details, blob) {
  const saved = { ...details, id: newId(), size: blob.size };
  await transaction(['attempts', 'audio'], 'readwrite', (stores) => {
    stores.attempts.put(saved);
    stores.audio.put({ id: saved.id, blob });
  });
  return saved;
}

// The details of saved attempts, newest first. Never loads any audio.
// With { questionKey }, only that question's attempts.
export async function listAttempts({ questionKey } = {}) {
  const rows = await transaction(['attempts'], 'readonly', ({ attempts }, set) => {
    const request = questionKey ? attempts.index('questionKey').getAll(questionKey) : attempts.getAll();
    requestValue(request, set);
  });
  return (rows || []).sort((a, b) => b.createdAt - a.createdAt);
}

// The audio of one attempt, or null. Call this only when it is needed (playing, downloading).
export async function getAudio(id) {
  const row = await transaction(['audio'], 'readonly', ({ audio }, set) => requestValue(audio.get(id), set));
  return row ? row.blob : null;
}

// Delete one attempt: details and audio together.
export async function deleteAttempt(id) {
  await transaction(['attempts', 'audio'], 'readwrite', (stores) => {
    stores.attempts.delete(id);
    stores.audio.delete(id);
  });
}

// How many attempts and how many bytes of audio are saved (from the details; no audio is read).
export async function usage() {
  const rows = await listAttempts();
  return { count: rows.length, bytes: rows.reduce((sum, r) => sum + (r.size || 0), 0) };
}

/* ---------- Asking the browser to keep the recordings ---------- */
// Returns 'granted', 'denied', 'unsupported' or 'unknown'. Never throws.
export async function persistenceStatus() {
  try {
    if (!navigator.storage?.persisted) return 'unsupported';
    return (await navigator.storage.persisted()) ? 'granted' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted?.()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}
