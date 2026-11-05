// Mic check: a level meter that helps find out why speech recognition struggles.
// It only measures how loud the sound is. Nothing is recorded, saved or sent anywhere.

const SPEECH_DB = -55; // quieter than this counts as silence
const TOO_QUIET_DB = -45; // typical speech level below this is too quiet
const CLIPPING_DB = -2; // peaks above this are likely distorted
const NOISY_DB = -45; // a background level above this is noisy
const BLUETOOTH = /hands-?free|headset|bluetooth|airpods|hfp/i;

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const percentile = (list, p) => [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) * p)];

// Plain-language advice from the measured levels (in dB, where 0 is the loudest possible).
// `samples` is every reading taken. Returns a list of sentences.
export function adviseOnLevels(samples, device = '') {
  const advice = [];
  const speech = samples.filter((db) => db > SPEECH_DB);
  if (speech.length < 5) {
    advice.push('I hardly heard anything. Check that the right microphone is selected and not muted, then speak at your normal volume.');
  } else {
    const typical = median(speech);
    const peak = Math.max(...speech);
    if (typical < TOO_QUIET_DB) advice.push('Your voice is very quiet. Move closer to the microphone or raise the input volume in your system sound settings.');
    else if (peak > CLIPPING_DB) advice.push('Your voice is too loud at times and may be distorted. Move back a little or lower the input volume.');
    else advice.push('Your voice level looks good.');
    if (percentile(samples, 0.1) > NOISY_DB) advice.push('There is a lot of background noise. A quieter room or a headset microphone close to your mouth will help.');
  }
  if (BLUETOOTH.test(device)) {
    advice.push('This looks like a Bluetooth headset in call mode, which lowers the sound quality a lot and makes recognition much worse. Try a wired headset or the laptop microphone.');
  }
  return advice;
}

// One shared checker, used by the Settings tab and by the setup screen. It only measures loudness: it never
// records, saves, transcribes or sends anything. States: 'idle' -> 'opening' (waiting for the microphone
// permission) -> 'checking' -> 'idle'.
//   onState(state)             every change of state
//   onLevel(db)                about 10 times a second while checking
//   onDone({ device, advice }) the check ended normally (time ran out, or stop() was called while checking)
//   onError()                  the microphone could not be opened
// start({ deviceId }) returns true if a check began. stop() ends a running check with advice (or cancels a waiting
// one). cancel() ends everything silently: used when the person leaves, starts a session, or changes the
// microphone. A permission answered after a cancel is released the moment it arrives (a numbered request).
export function createMicChecker({ onState, onLevel, onDone, onError, seconds = 15 } = {}) {
  let state = 'idle';
  let generation = 0;
  let active = null; // the running check: { stream, context, timer, limit, samples, device }

  const setState = (next) => { if (state !== next) { state = next; onState?.(state); } };

  function teardown(run) {
    clearInterval(run.timer);
    clearTimeout(run.limit);
    run.stream.getTracks().forEach((t) => t.stop()); // the microphone light goes off
    run.context.close().catch(() => {});
    if (active === run) active = null;
  }

  const api = {
    getState: () => state,
    isBusy: () => state !== 'idle',

    async start({ deviceId = '' } = {}) {
      if (state !== 'idle') return false; // repeated clicks do nothing
      if (!navigator.mediaDevices?.getUserMedia) { onError?.(); return false; }
      const mine = ++generation;
      setState('opening');
      const audio = deviceId ? { deviceId: { exact: deviceId } } : true; // a chosen microphone, or the default
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch {
        if (mine === generation) { setState('idle'); onError?.(); }
        return false;
      }
      // Cancelled or replaced while the prompt was open: let the microphone go at once
      if (mine !== generation) { stream.getTracks().forEach((t) => t.stop()); return false; }

      const device = stream.getAudioTracks()[0]?.label || '';
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const run = { stream, context, samples: [], device };
      run.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buffer);
        const rms = Math.sqrt(buffer.reduce((sum, x) => sum + x * x, 0) / buffer.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -100;
        run.samples.push(db);
        onLevel?.(db);
      }, 100);
      run.limit = setTimeout(() => api.stop(), seconds * 1000);
      active = run;
      setState('checking');
      return true;
    },

    stop() {
      if (state === 'opening') { generation++; setState('idle'); return; } // never opened: nothing to report
      if (state !== 'checking' || !active) return;
      const run = active;
      teardown(run);
      setState('idle');
      onDone?.({ device: run.device, advice: adviseOnLevels(run.samples, run.device) });
    },

    cancel() {
      generation++;
      if (active) teardown(active);
      setState('idle');
    },
  };
  return api;
}
