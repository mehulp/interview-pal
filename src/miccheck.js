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

// Start a check. onLevel(db) is called about 10 times a second, onDone({ device, advice }) at the end.
// Returns { stop }. Rejects (before returning) if the microphone cannot be opened.
export async function startMicCheck({ onLevel, onDone, seconds = 15 }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const device = stream.getAudioTracks()[0]?.label || '';
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  const samples = [];
  let finished = false;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.sqrt(buffer.reduce((sum, x) => sum + x * x, 0) / buffer.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    samples.push(db);
    onLevel?.(db);
  }, 100);

  function stop() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    clearTimeout(limit);
    stream.getTracks().forEach((t) => t.stop()); // the microphone light goes off
    context.close();
    onDone?.({ device, advice: adviseOnLevels(samples, device) });
  }
  const limit = setTimeout(stop, seconds * 1000);
  return { stop };
}
