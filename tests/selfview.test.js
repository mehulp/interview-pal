import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelfView } from '../src/selfview.js';

// A stand-in for the camera: no real device, and a promise we answer ourselves, as a permission prompt would be.
function setup() {
  const streams = []; // every camera stream that was ever opened
  const pending = []; // permission requests waiting for an answer
  let inFlight = 0;
  let maxInFlight = 0;
  const makeStream = () => {
    const track = { kind: 'video', readyState: 'live', stop() { this.readyState = 'ended'; } };
    const stream = { tracks: [track], getTracks() { return this.tracks; }, getVideoTracks() { return this.tracks; } };
    streams.push(stream);
    return stream;
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () => {
          inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise((resolve, reject) => pending.push({
            allow: () => { inFlight--; resolve(makeStream()); },
            deny: (name) => { inFlight--; reject(Object.assign(new Error(name), { name })); },
          }));
        },
      },
    },
  });
  const video = { hidden: true, srcObject: null, play: async () => {} };
  return { view: createSelfView(video), video, streams, pending, maxInFlight: () => maxInFlight, live: () => streams.filter((s) => s.tracks.every((t) => t.readyState === 'live')).length };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('start then stop: the camera is shown, then released', async () => {
  const { view, video, pending, streams } = setup();
  const started = view.start();
  pending[0].allow();
  assert.deepEqual(await started, { ok: true });
  assert.equal(view.isOn(), true);
  assert.equal(video.hidden, false);
  assert.equal(view.getVideoTrack().readyState, 'live');
  view.stop();
  assert.equal(view.isOn(), false);
  assert.equal(video.hidden, true);
  assert.equal(video.srcObject, null);
  assert.equal(streams[0].tracks[0].readyState, 'ended');
  assert.equal(view.getVideoTrack(), null);
});

test('permission granted AFTER stop(): the camera is released at once and never shown', async () => {
  const { view, video, pending, streams, live } = setup();
  const started = view.start();
  view.stop(); // the session ended while the browser was still asking
  pending[0].allow(); // ...and now the user says yes
  const result = await started;
  assert.deepEqual(result, { ok: false, cancelled: true });
  assert.equal(view.isOn(), false);
  assert.equal(video.hidden, true);
  assert.equal(video.srcObject, null);
  assert.equal(streams.length, 1);
  assert.equal(live(), 0); // the camera that arrived late was released straight away
});

test('permission refused AFTER stop() is not reported as an error', async () => {
  const { view, pending } = setup();
  const started = view.start();
  view.stop();
  pending[0].deny('NotAllowedError');
  assert.deepEqual(await started, { ok: false, cancelled: true }); // no scary message for something the user no longer wants
});

test('pressing start repeatedly asks the browser once', async () => {
  const { view, pending, streams, live } = setup();
  const a = view.start();
  const b = view.start();
  const c = view.start();
  assert.equal(pending.length, 1); // one permission request, not three
  pending[0].allow();
  assert.deepEqual(await Promise.all([a, b, c]), [{ ok: true }, { ok: true }, { ok: true }]);
  assert.equal(streams.length, 1);
  assert.equal(live(), 1);
  assert.deepEqual(await view.start(), { ok: true }); // already on: no new request
  assert.equal(pending.length, 1);
});

test('stop then start while the first request is still waiting: never two requests at once, one camera in the end', async () => {
  const { view, pending, streams, live, maxInFlight } = setup();
  const first = view.start();
  view.stop();
  const second = view.start(); // asked again before the first was answered
  await tick();
  assert.equal(pending.length, 1); // the second request waits for the stale one
  pending[0].allow(); // the stale request is answered: released
  await tick();
  assert.equal(pending.length, 2); // now the new request is made
  pending[1].allow();
  assert.deepEqual(await first, { ok: false, cancelled: true });
  assert.deepEqual(await second, { ok: true });
  assert.equal(maxInFlight(), 1);
  assert.equal(streams.length, 2);
  assert.equal(live(), 1); // only the wanted camera is on
  assert.equal(view.isOn(), true);
});

test('stop twice, or stop with nothing started, is harmless', async () => {
  const { view, pending } = setup();
  view.stop();
  view.stop();
  const started = view.start();
  pending[0].allow();
  assert.deepEqual(await started, { ok: true });
});

test('a refused or missing camera gives a plain message', async () => {
  let s = setup();
  let started = s.view.start();
  s.pending[0].deny('NotAllowedError');
  assert.match((await started).message, /blocked/);
  assert.equal(s.view.isOn(), false);
  s = setup();
  started = s.view.start();
  s.pending[0].deny('NotFoundError');
  assert.match((await started).message, /No camera/);
  s = setup();
  started = s.view.start();
  s.pending[0].deny('SomethingElse');
  assert.match((await started).message, /could not be started/);
  // and after a failure it can be tried again
  const again = s.view.start();
  s.pending[1].allow();
  assert.deepEqual(await again, { ok: true });
});
