// Speech: text-to-speech (interviewer voice) and speech recognition (your answer).
// Both use built-in browser features. Nothing is sent to any server by this file.

// Accents offered in the language pickers. en-IN is the default.
export const LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
];

// Interviewer voice and your own speech can use different accents.
let voiceLang = 'en-IN';
let recognitionLang = 'en-IN';
export function setVoiceLang(code) { voiceLang = code; }
export function setRecognitionLang(code) { recognitionLang = code; }

/* ---------- Text to speech ---------- */

// Browsers load their voice list a moment after the page opens, so wait for it.
function loadVoices() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve([]);
    const have = synth.getVoices();
    if (have.length) return resolve(have);
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1000); // don't wait forever
  });
}

// Each interviewer can have a voice profile: { gender: 'female' | 'male', name: 'part of a voice name', pitch }.
// The browser does not say whether a voice is male or female, so the gender is guessed from the
// voice's name (for example Heera and Zira are female, Ravi and David are male).
let voiceProfile = { gender: '', name: '', pitch: 1 };
export function setVoiceProfile(profile) {
  voiceProfile = { gender: profile?.gender || '', name: profile?.name || '', pitch: profile?.pitch || 1 };
}

const FEMALE_NAMES = /\b(female|woman)\b|heera|zira|hazel|susan|samantha|karen|moira|tessa|veena|aria|jenny|sonia|libby|neerja|swara|catherine|linda|fiona|kate\b|serena|victoria|allison|vicki|michelle|jane\b|nancy|clara|natasha|annette|emma|amy\b|salli|joanna|kendra|kimberly|nicole|olivia|aditi|raveena|priya|shreya|lekha|kalpana|hemlata|\beva\b|\bava\b|\bana\b/i;
const MALE_NAMES = /\bmale\b|ravi\b|david|\bmark\b|george|\balex\b|daniel|\bfred\b|rishi|prabhat|\bguy\b|ryan|ethan|james|richard|thomas|oliver|arthur|brian|matthew|joey|justin|kevin|russell|geraint|\bsean\b|davis|jason|tony|liam|william|mitchell|hemant|madhur|\bneel\b/i;

// 'female', 'male' or '' (unknown) for a browser voice
function voiceGender(voice) {
  if (FEMALE_NAMES.test(voice.name)) return 'female';
  if (MALE_NAMES.test(voice.name)) return 'male';
  return '';
}

let lastChoice = { voice: null, matched: true, pitch: 1 }; // what pickVoice chose last time

// Choose a voice. Order of preference:
//   1. a voice whose name matches the interviewer's name hint (chosen accent first, then any English accent)
//   2. a voice of the right gender (chosen accent first, then any English accent; a wrong gender is
//      more jarring than a different accent)
//   3. any voice in the chosen accent, then any English voice, then the browser default
export async function pickVoice() {
  const norm = (v) => v.lang.replace('_', '-').toLowerCase(); // Android uses en_IN
  const english = (await loadVoices()).filter((v) => norm(v).startsWith('en'));
  // Put the better "natural" voices first
  const sorted = [...english].sort((a, b) => Number(!/natural|neural|online/i.test(a.name)) - Number(!/natural|neural|online/i.test(b.name)));
  const inAccent = sorted.filter((v) => norm(v) === voiceLang.toLowerCase());

  const { gender, name } = voiceProfile;
  const byName = (list) => (name ? list.find((v) => v.name.toLowerCase().includes(name.toLowerCase())) : null);
  const byGender = (list) => (gender ? list.find((v) => voiceGender(v) === gender) : null);

  let voice = byName(inAccent) || byName(sorted) || byGender(inAccent) || byGender(sorted);
  const wantsSomething = Boolean(gender || name);
  const matched = !wantsSomething || Boolean(voice);
  if (!voice) voice = inAccent[0] || sorted[0] || null;

  // No suitable voice on this device: nudge the pitch so the voice at least sounds closer
  let pitch = voiceProfile.pitch;
  if (!matched && gender === 'female') pitch *= 1.25;
  if (!matched && gender === 'male') pitch *= 0.8;
  lastChoice = { voice, matched, pitch };
  return voice;
}

// A short sentence saying which voice is in use, for the page to show.
export function describeVoice() {
  const { voice, matched } = lastChoice;
  if (!voice) return 'Voice: the browser default.';
  const text = `Voice: ${voice.name} (${voice.lang})`;
  return matched ? text : `${text}. No ${voiceProfile.gender || 'matching'} voice was found on this device, so the pitch was adjusted.`;
}

export function isSpeechSupported() {
  return 'speechSynthesis' in window;
}

let speakToken = 0; // lets stopSpeaking() cancel a line that is in progress

// Read `text` aloud. Resolves when finished (or stopped).
// onStart / onEnd let the page animate the avatar. rate sets the speaking speed.
export async function speak(text, { onStart, onEnd, rate = 1 } = {}) {
  if (!isSpeechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  const token = ++speakToken;
  synth.cancel();

  const voice = await pickVoice();
  if (token !== speakToken) return; // stopped or replaced while loading voices

  // Chrome can cut off long utterances, so speak one sentence at a time.
  const chunks = text.match(/[^.!?]+[.!?]*\s*/g) || [text];

  onStart?.();
  for (const chunk of chunks) {
    if (token !== speakToken) break;
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = voice ? voice.lang : voiceLang;
      u.rate = rate; // 1 is normal speed
      u.pitch = lastChoice.pitch; // 1 is normal pitch
      if (voice) u.voice = voice;
      u.onend = resolve;
      u.onerror = resolve;
      synth.speak(u);
    });
  }
  if (token === speakToken) onEnd?.();
}

export function stopSpeaking() {
  speakToken++;
  window.speechSynthesis?.cancel();
}

/* ---------- Speech recognition ---------- */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isRecognitionSupported() {
  return Boolean(Recognition);
}

export const getRecognitionLang = () => recognitionLang;

// Join pieces of text with single spaces, so words never run together.
export const joinText = (...parts) => parts.map((p) => (p || '').trim()).filter(Boolean).join(' ');

// Friendly messages for the errors the browser can report.
const ERROR_TEXT = {
  'not-allowed': 'Microphone is blocked. Allow it in the browser address bar, or just type your answer.',
  'service-not-allowed': 'Speech recognition is not allowed here. Please type your answer.',
  'no-speech': "I didn't hear anything. Try again, or type your answer.",
  'audio-capture': 'No microphone found. Please type your answer.',
  network: 'Speech recognition needs an internet connection. Please type your answer.',
};

const MAX_SILENT_RESTARTS = 6; // about a minute of silence before giving up
const STOP_WAIT_MS = 1500; // how long stop() waits for the last words

// Optional, experimental: check that the browser can recognise this language on the device itself
// (this also lets us give it a list of expected words). Downloads the language pack once if needed.
// Returns { ok, message }.
export async function prepareOnDevice(lang) {
  if (!Recognition || typeof Recognition.available !== 'function') {
    return { ok: false, message: 'This browser does not support on-device recognition. The standard recogniser will be used.' };
  }
  const options = { langs: [lang], processLocally: true, quality: 'dictation' };
  try {
    let status = await Recognition.available(options);
    if (status === 'unavailable') {
      return { ok: false, message: `On-device recognition is not available for ${lang} in this browser. Try another accent, or use the standard recogniser.` };
    }
    if (status !== 'available') {
      // Not on this device yet: ask the browser to download it (this can take a minute)
      const installed = await Recognition.install(options);
      if (!installed) return { ok: false, message: 'The on-device language pack could not be installed. The standard recogniser will be used.' };
    }
    return { ok: true, message: `On-device recognition is ready for ${lang}.` };
  } catch {
    return { ok: false, message: 'On-device recognition could not be checked. The standard recogniser will be used.' };
  }
}

// Create a recognizer. Callbacks:
//   onText(finalText, interimText)  live transcript so far
//   onEnd()                         listening has really stopped (you stopped it, or it gave up)
//   onError(message)                something to show the user
//   onNote(message)                 information, for example a switch back to the standard recogniser
//
// It keeps listening when the browser stops by itself (after a pause, for example), until you call
// stop() or it gives up. start({ onDevice, phrases, deviceId }):
//   onDevice + phrases  use the on-device recogniser with a list of expected words, phrases = [{ term, boost }]
//   deviceId            listen to this microphone instead of the browser's default (needs a recent Chrome)
export function createRecognizer({ onText, onEnd, onError, onNote }) {
  if (!Recognition) return null;

  const rec = new Recognition();
  rec.continuous = true; // keep listening through short pauses
  rec.interimResults = true; // show words while you are still speaking

  let active = false; // between start() and the real end
  let started = false; // has the browser's recogniser been started in this session?
  let micStream = null; // the chosen microphone, when one was asked for
  let wanted = false; // true while we should keep listening
  let options = {};
  let chunks = []; // the finished pieces of speech, in order
  let interim = '';
  let gotResult = false; // did this browser session produce anything?
  let silentRestarts = 0;
  let quickFails = 0;
  let lastStart = 0;
  let restartTimer = null;
  let fellBack = false; // on-device mode did not work, so the standard recogniser is used
  let sessionId = 0; // lets an old "stop waiting" timer know it belongs to an earlier session
  const stopWaiters = [];

  // Settings for the engine: on-device or standard, with or without expected words.
  function applyEngineOptions() {
    try {
      const local = Boolean(options.onDevice) && !fellBack;
      if ('processLocally' in rec) rec.processLocally = local;
      if ('phrases' in rec) {
        const usable = local && options.phrases?.length && typeof window.SpeechRecognitionPhrase === 'function';
        rec.phrases = usable ? options.phrases.map(({ term, boost }) => new window.SpeechRecognitionPhrase(term, boost)) : [];
      }
    } catch {
      // an older browser without these features: carry on with the standard recogniser
    }
  }

  function begin() {
    rec.lang = recognitionLang; // read now, so a changed setting applies
    applyEngineOptions();
    gotResult = false;
    lastStart = Date.now();
    started = true;
    const track = micStream?.getAudioTracks()[0];
    try {
      // With a chosen microphone, hand its audio to the recogniser. Browsers that do not know this
      // option ignore it and use the default microphone.
      if (track && track.readyState === 'live') rec.start(track);
      else rec.start();
    } catch {
      try { rec.start(); } catch { /* already running; safe to ignore */ }
    }
  }

  function releaseMic() {
    micStream?.getTracks().forEach((t) => t.stop()); // the microphone light goes off
    micStream = null;
  }

  // Open a specific microphone. Returns the stream, or null if that did not work.
  async function openMic(deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return null;
    }
  }

  function finish() {
    if (!active) return;
    active = false;
    wanted = false;
    started = false;
    releaseMic();
    clearTimeout(restartTimer);
    restartTimer = null;
    onEnd?.();
    stopWaiters.splice(0).forEach((resolve) => resolve());
  }

  rec.onresult = (event) => {
    gotResult = true;
    silentRestarts = 0;
    quickFails = 0;
    interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) chunks.push(result[0].transcript.trim());
      else interim += result[0].transcript;
    }
    onText?.(joinText(...chunks), interim.trim());
  };

  rec.onerror = (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return; // normal stops: onend decides what to do
    if ((e.error === 'language-not-supported' || e.error === 'phrases-not-supported') && options.onDevice && !fellBack) {
      fellBack = true; // switch to the standard recogniser; onend restarts it
      onNote?.('The on-device recogniser could not be used here, so the standard one is being used.');
      return;
    }
    wanted = false; // a real problem: give up (onend follows and finishes)
    onError?.(ERROR_TEXT[e.error] || `Speech recognition error: ${e.error}`);
  };

  rec.onend = () => {
    if (wanted) {
      // The browser stopped by itself. Keep listening, unless it keeps failing.
      if (gotResult) {
        silentRestarts = 0;
        quickFails = 0;
      } else {
        silentRestarts++;
        if (Date.now() - lastStart < 500) quickFails++;
      }
      if (quickFails >= 3) {
        wanted = false;
        onError?.('Voice input stopped unexpectedly. Please type your answer, or press the mic to try again.');
      } else if (silentRestarts >= MAX_SILENT_RESTARTS) {
        wanted = false;
        onError?.(ERROR_TEXT['no-speech']);
      } else {
        restartTimer = setTimeout(() => { restartTimer = null; if (wanted) begin(); }, 150);
        return;
      }
    }
    finish();
  };

  return {
    isActive: () => active,

    start(opts = {}) {
      if (active) return;
      sessionId++;
      options = opts;
      active = true;
      wanted = true;
      chunks = [];
      interim = '';
      silentRestarts = 0;
      quickFails = 0;
      fellBack = false;
      if (!opts.deviceId) { begin(); return; }
      const mine = sessionId;
      openMic(opts.deviceId).then((stream) => {
        if (!active || sessionId !== mine) { stream?.getTracks().forEach((t) => t.stop()); return; } // stopped meanwhile
        if (stream) micStream = stream;
        else onNote?.('The chosen microphone could not be opened, so the default one is used.');
        begin();
      });
    },

    // Stop listening. The returned promise resolves once the last words have arrived (or after a
    // short wait), so the caller can safely read the text.
    stop() {
      if (!active) return Promise.resolve();
      wanted = false;
      const mine = sessionId;
      return new Promise((resolve) => {
        stopWaiters.push(resolve);
        if (restartTimer || !started) { finish(); return; } // nothing is running right now
        try {
          rec.stop();
        } catch {
          finish();
        }
        setTimeout(() => { if (sessionId === mine) finish(); }, STOP_WAIT_MS); // do not wait forever
      });
    },
  };
}
