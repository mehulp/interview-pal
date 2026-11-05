// Self-view: a small mirrored picture of your own camera, to help with eye contact and posture.
// The picture is shown on this screen only. Nothing is recorded, saved, uploaded or analysed,
// and the microphone is never used.

export function createSelfView(videoEl) {
  let stream = null;
  // A camera request can be answered long after it was made, so every request is numbered. Switching
  // the camera off numbers it up, which makes an older answer stale: it is released the moment it arrives.
  let generation = 0;
  let current = null; // the request in flight: { gen, promise }

  const release = (s) => s?.getTracks().forEach((track) => track.stop()); // the camera light goes off

  return {
    isOn: () => Boolean(stream),

    // The live camera track, or null. The video recorder takes a COPY of it (track.clone()), so
    // stopping the recording never switches self-view off.
    getVideoTrack() {
      const track = stream?.getVideoTracks()[0];
      return track && track.readyState === 'live' ? track : null;
    },

    // Returns { ok: true }, { ok: false, message } with something safe to show the user, or
    // { ok: false, cancelled: true } if the camera was switched off before it was ready.
    async start() {
      if (stream) return { ok: true };
      if (!navigator.mediaDevices?.getUserMedia) return { ok: false, message: 'This browser cannot show your camera.' };
      if (current && current.gen === generation) return current.promise; // already asking: do not ask twice

      const mine = ++generation;
      const earlier = current?.promise; // an older request that is now stale
      const entry = { gen: mine, promise: null };
      entry.promise = (async () => {
        // Never two camera requests at once: let a stale one finish (it releases its own camera) first
        if (earlier) await earlier.catch(() => {});
        if (mine !== generation) return { ok: false, cancelled: true };
        let opened = null;
        try {
          opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          if (mine !== generation) { release(opened); return { ok: false, cancelled: true }; } // switched off while waiting
          stream = opened;
          videoEl.srcObject = stream;
          videoEl.hidden = false;
          await videoEl.play().catch(() => {});
          if (mine !== generation) return { ok: false, cancelled: true }; // switched off while the picture started
          return { ok: true };
        } catch (err) {
          if (mine !== generation) { release(opened); return { ok: false, cancelled: true }; }
          stream = null;
          const message =
            err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in the address bar to use self-view.'
            : err.name === 'NotFoundError' ? 'No camera was found.'
            : 'The camera could not be started.';
          return { ok: false, message };
        }
      })();
      current = entry;
      try {
        return await entry.promise;
      } finally {
        if (current === entry) current = null;
      }
    },

    // Switch the camera off (this also turns off the camera light), and cancel any request still waiting.
    stop() {
      generation++;
      release(stream);
      stream = null;
      videoEl.srcObject = null;
      videoEl.hidden = true;
    },
  };
}
