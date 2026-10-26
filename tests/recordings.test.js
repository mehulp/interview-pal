import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIME_CANDIDATES, MAX_AUDIO_BYTES, pickMimeType, extensionFor, clampTarget, targetLabel, formatClock, timeState,
  questionKey, makeSnapshot, canRetry, recordAvailability, nextRecorderState, canRecorderDo, describeMicError,
  describeStoreError, describePersistence, validateAttempt, downloadName, groupByQuestion,
  kindOf, mimeCandidatesFor, maxDurationMs, canSaveInBrowser, isAtRisk, describeMediaError,
  MAX_RECORDING_MS, MAX_VIDEO_MS, VIDEO_MIME_CANDIDATES,
} from '../src/recordings.js';

test('the first supported format is used, in order, and nothing is hard-coded', () => {
  assert.equal(pickMimeType((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickMimeType(() => true), MIME_CANDIDATES[0]);
  assert.equal(pickMimeType((t) => t === 'audio/webm'), 'audio/webm');
  assert.equal(pickMimeType(() => false), ''); // let the browser choose
  assert.equal(pickMimeType(() => { throw new Error('boom'); }), '');
});

test('file extensions follow the real format', () => {
  assert.equal(extensionFor('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionFor('audio/mp4;codecs=opus'), 'm4a');
  assert.equal(extensionFor('audio/ogg'), 'ogg');
  assert.equal(extensionFor(''), 'audio');
});

test('targets are off or a whole number of seconds from 10 to 600', () => {
  assert.equal(clampTarget(0), 0);
  assert.equal(clampTarget('abc'), 0);
  assert.equal(clampTarget(-5), 0);
  assert.equal(clampTarget(3), 10);
  assert.equal(clampTarget(90.4), 90);
  assert.equal(clampTarget(5000), 600);
  assert.equal(targetLabel(0), 'No target');
  assert.equal(targetLabel(90), '1 min 30 sec');
  assert.equal(targetLabel(120), '2 min');
  assert.equal(targetLabel(45), '45 sec');
});

test('formatClock counts whole seconds without rounding up', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(59999), '0:59');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(-5), '0:00');
});

test('timeState: before, at and after the target, worked out from elapsed time alone', () => {
  assert.deepEqual(timeState(30000, 90), { elapsedMs: 30000, remainingMs: 60000, overMs: 0, reached: false });
  const at = timeState(90000, 90);
  assert.equal(at.reached, true);
  assert.equal(at.remainingMs, 0);
  const over = timeState(102000, 90);
  assert.equal(over.overMs, 12000);
  assert.equal(over.remainingMs, 0);
  // a background tab that did not tick for a minute still gives the right answer
  assert.equal(timeState(150000, 90).overMs, 60000);
  assert.deepEqual(timeState(5000, 0), { elapsedMs: 5000, remainingMs: null, overMs: 0, reached: false });
});

test('the snapshot keeps the question, set and a normalised key', () => {
  const s = makeSnapshot({ question: '  How do you  Delegate? ', set: 'Mine', topic: 'T' }, 7);
  assert.equal(s.questionKey, questionKey('how do you delegate?'));
  assert.equal(s.questionText, '  How do you  Delegate? ');
  assert.equal(s.setName, 'Mine');
  assert.equal(s.token, 7);
});

test('retry is offered only for the same asking of the question, while recording is allowed', () => {
  const snap = makeSnapshot({ question: 'Q?' }, 3);
  assert.equal(canRetry(snap, { token: 3, canRecord: true }), true);
  assert.equal(canRetry(snap, { token: 4, canRecord: true }), false); // moved on to another question
  assert.equal(canRetry(snap, { token: 3, canRecord: false }), false); // not in the answering phase
  assert.equal(canRetry(snap, null), false); // no session
  assert.equal(canRetry(null, { token: 3, canRecord: true }), false);
});

test('the same question text asked again later is a different token, so no Retry', () => {
  const snap = makeSnapshot({ question: 'Same?' }, 3);
  assert.equal(canRetry(snap, { token: 9, canRecord: true }), false);
});

test('record availability: unsupported, pending, busy, and not yet asked', () => {
  const ok = { supported: true, recState: 'idle', hasPending: false, current: { token: 1, canRecord: true } };
  assert.equal(recordAvailability(ok).ok, true);
  assert.equal(recordAvailability({ ...ok, supported: false }).ok, false);
  assert.match(recordAvailability({ ...ok, hasPending: true }).reason, /Save or discard/);
  assert.equal(recordAvailability({ ...ok, recState: 'recording' }).ok, false);
  assert.equal(recordAvailability({ ...ok, current: { token: 1, canRecord: false } }).ok, false);
  assert.equal(recordAvailability({ ...ok, current: null }).ok, false);
});

test('recorder states follow the plan and ignore events that make no sense', () => {
  assert.equal(nextRecorderState('idle', 'start'), 'requesting');
  assert.equal(nextRecorderState('requesting', 'granted'), 'recording');
  assert.equal(nextRecorderState('recording', 'stop'), 'stopping');
  assert.equal(nextRecorderState('stopping', 'stopped'), 'idle');
  // rapid repeated clicks and late callbacks do nothing
  assert.equal(nextRecorderState('requesting', 'start'), 'requesting');
  assert.equal(nextRecorderState('recording', 'start'), 'recording');
  assert.equal(nextRecorderState('stopping', 'stop'), 'stopping');
  assert.equal(nextRecorderState('idle', 'granted'), 'idle'); // permission answered after cancel
  assert.equal(nextRecorderState('idle', 'stopped'), 'idle');
  // a permission request that is cancelled or denied goes back to idle
  assert.equal(nextRecorderState('requesting', 'cancel'), 'idle');
  assert.equal(nextRecorderState('requesting', 'denied'), 'idle');
  assert.equal(nextRecorderState('requesting', 'stop'), 'idle');
  assert.equal(nextRecorderState('recording', 'error'), 'stopping');
  assert.equal(canRecorderDo('idle', 'granted'), false);
  assert.equal(canRecorderDo('recording', 'stop'), true);
});

test('plain messages for microphone, storage and persistence', () => {
  assert.match(describeMicError('NotAllowedError'), /blocked/);
  assert.match(describeMicError('NotFoundError'), /No microphone/);
  assert.match(describeMicError('NotReadableError'), /another program|Another program/);
  assert.match(describeMicError('InsecureContext'), /localhost/);
  assert.match(describeMicError('Whatever'), /could not be used/);
  assert.match(describeStoreError('quota'), /no room/);
  assert.match(describeStoreError('unavailable'), /not letting/);
  assert.match(describeStoreError('other'), /Try Save again/);
  assert.match(describePersistence('granted'), /agreed/);
  assert.match(describePersistence('denied'), /not promised/);
  assert.match(describePersistence('unsupported'), /cannot promise/);
  assert.match(describePersistence('unknown'), /Download/);
});

test('an attempt is checked before it is saved', () => {
  assert.equal(validateAttempt({ mimeType: 'audio/webm', size: 1000, durationMs: 5000 }).ok, true);
  assert.equal(validateAttempt({ mimeType: 'video/webm', size: 1000, durationMs: 5000 }).ok, false);
  assert.equal(validateAttempt({ mimeType: '', size: 1000, durationMs: 5000 }).ok, false);
  assert.equal(validateAttempt({ mimeType: 'audio/webm', size: 0, durationMs: 5000 }).ok, false);
  assert.equal(validateAttempt({ mimeType: 'audio/webm', size: MAX_AUDIO_BYTES + 1, durationMs: 5000 }).ok, false);
  assert.equal(validateAttempt({ mimeType: 'audio/webm', size: 1000, durationMs: 0 }).ok, false);
});

test('download names are safe: no slashes, dots or odd characters, and the right extension', () => {
  const name = downloadName({ questionText: '../../etc/passwd: How do you  "delegate"?', createdAt: new Date(2026, 9, 26, 14, 5).getTime(), mimeType: 'audio/webm;codecs=opus' });
  assert.equal(name, 'interviewpal-etc-passwd-how-do-you-delegate-2026-10-26-1405.webm');
  assert.doesNotMatch(name, /[\\/]|\.\./);
  assert.equal(downloadName({ questionText: '???', createdAt: 0, mimeType: 'audio/mp4' }).startsWith('interviewpal-answer-'), true);
  assert.ok(downloadName({ questionText: 'x'.repeat(300), createdAt: 0, mimeType: 'audio/ogg' }).length < 90);
});

test('attempts are grouped by question, newest first, joined by the normalised key', () => {
  const a = (id, text, createdAt) => ({ id, questionText: text, questionKey: questionKey(text), createdAt });
  const groups = groupByQuestion([a(1, 'One?', 100), a(2, 'Two?', 300), a(3, 'one?  ', 200), a(4, 'Two?', 50)]);
  assert.deepEqual(groups.map((g) => g.attempts.map((x) => x.id)), [[2, 4], [3, 1]]);
  assert.equal(groups[1].questionText, 'one?  '); // the newest attempt's wording is shown
  assert.deepEqual(groupByQuestion([]), []);
});

/* ---------- Video (v1.4) ---------- */

test('the kind comes from the format the browser really used', () => {
  assert.equal(kindOf('video/webm;codecs=vp9,opus'), 'video');
  assert.equal(kindOf('video/mp4'), 'video');
  assert.equal(kindOf('audio/webm;codecs=opus'), 'audio');
  assert.equal(kindOf(''), 'audio');
  assert.equal(kindOf(undefined), 'audio');
});

test('video uses its own format list and the first supported one wins', () => {
  assert.equal(mimeCandidatesFor('video'), VIDEO_MIME_CANDIDATES);
  assert.equal(mimeCandidatesFor('audio'), MIME_CANDIDATES);
  assert.equal(pickMimeType((t) => t === 'video/webm', VIDEO_MIME_CANDIDATES), 'video/webm');
  assert.equal(pickMimeType((t) => t.startsWith('video/mp4'), VIDEO_MIME_CANDIDATES), 'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  assert.equal(pickMimeType(() => false, VIDEO_MIME_CANDIDATES), '');
});

test('video is limited to 7 minutes, audio to 10', () => {
  assert.equal(maxDurationMs('video'), 7 * 60 * 1000);
  assert.equal(maxDurationMs('audio'), 10 * 60 * 1000);
  assert.equal(MAX_VIDEO_MS < MAX_RECORDING_MS, true);
});

test('video is never saved in the browser, and is refused if something tries', () => {
  assert.equal(canSaveInBrowser('video'), false);
  assert.equal(canSaveInBrowser('audio'), true);
  const refused = validateAttempt({ mimeType: 'video/webm;codecs=vp9,opus', size: 1000, durationMs: 5000 });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Download/);
  assert.equal(validateAttempt({ mimeType: 'audio/webm', size: 1000, durationMs: 5000 }).ok, true);
});

test('file extensions for video follow the real format', () => {
  assert.equal(extensionFor('video/webm;codecs=vp9,opus'), 'webm');
  assert.equal(extensionFor('video/mp4'), 'mp4');
  assert.equal(extensionFor('audio/mp4'), 'm4a');
  assert.equal(downloadName({ questionText: 'Why?', createdAt: new Date(2026, 9, 26, 9, 5).getTime(), mimeType: 'video/mp4' }), 'interviewpal-why-2026-10-26-0905.mp4');
});

test('camera messages are specific; audio messages are unchanged', () => {
  assert.match(describeMediaError('NotAllowedError', 'video'), /Camera or microphone/);
  assert.match(describeMediaError('NotAllowedError', 'video'), /Audio-only/);
  assert.match(describeMediaError('NotFoundError', 'video'), /camera or microphone/);
  assert.match(describeMediaError('NotReadableError', 'video'), /another program/i);
  assert.equal(describeMediaError('NotAllowedError', 'audio'), describeMicError('NotAllowedError'));
  assert.match(describeMediaError('Whatever', 'video'), /could not be used/);
});

test('an attempt is at risk until it has been saved or downloaded', () => {
  assert.equal(isAtRisk(null), false);
  assert.equal(isAtRisk({ downloaded: false }), true);
  assert.equal(isAtRisk({}), true);
  assert.equal(isAtRisk({ downloaded: true }), false);
});
