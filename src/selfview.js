// Self-view: a small mirrored picture of your own camera, to help with eye contact and posture.
// The picture is shown on this screen only. Nothing is recorded, saved, uploaded or analysed,
// and the microphone is never used.

export function createSelfView(videoEl) {
  let stream = null;

  return {
    isOn: () => Boolean(stream),

    // Returns { ok: true } or { ok: false, message } with something safe to show the user.
    async start() {
      if (stream) return { ok: true };
      if (!navigator.mediaDevices?.getUserMedia) return { ok: false, message: 'This browser cannot show your camera.' };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        videoEl.srcObject = stream;
        videoEl.hidden = false;
        await videoEl.play().catch(() => {});
        return { ok: true };
      } catch (err) {
        stream = null;
        const message =
          err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in the address bar to use self-view.'
          : err.name === 'NotFoundError' ? 'No camera was found.'
          : 'The camera could not be started.';
        return { ok: false, message };
      }
    },

    // Switch the camera off (this also turns off the camera light).
    stop() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      videoEl.srcObject = null;
      videoEl.hidden = true;
    },
  };
}
