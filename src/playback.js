// Playback: plays a saved or just-recorded Blob in an <audio> element, and releases the
// temporary address (object URL) whenever the audio is replaced, cleared or removed.
//
// Chrome's recordings (WebM) have no length in the file, so the player reports an infinite
// duration and the slider cannot seek. Jumping to a huge time once makes the browser work out the
// real length; then the slider works. (Checked against real recordings, see the tests notes.)

const FIX_WAIT_MS = 3000;

export function createPlayer(audioEl, { onProblem } = {}) {
  let url = null;
  let loadId = 0;

  function revoke() {
    if (url) URL.revokeObjectURL(url);
    url = null;
  }

  const once = (event, ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { audioEl.removeEventListener(event, done); resolve(false); }, ms);
    function done() { clearTimeout(timer); resolve(true); }
    audioEl.addEventListener(event, done, { once: true });
  });

  return {
    // Show a recording. Resolves when it is ready to play and seek (or has given up trying).
    async load(blob) {
      const id = ++loadId;
      revoke();
      url = URL.createObjectURL(blob);
      audioEl.preload = 'auto';
      audioEl.src = url;
      audioEl.onerror = () => { if (id === loadId) onProblem?.('This recording could not be played.'); };
      if (audioEl.readyState < 1) await once('loadedmetadata', FIX_WAIT_MS);
      if (id !== loadId) return;
      if (audioEl.duration === Infinity) {
        audioEl.currentTime = 1e101; // makes the browser find the real length
        await once('durationchange', FIX_WAIT_MS);
        if (id !== loadId) return;
        audioEl.currentTime = 0;
      }
    },

    // Stop and let go of the audio and its temporary address.
    clear() {
      loadId++;
      audioEl.onerror = null; // taking the source away is not an error
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
      revoke();
    },

    hasAudio: () => url !== null,
  };
}
