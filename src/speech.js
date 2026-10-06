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

// Prefer a voice for the chosen accent, then any English voice, then the browser default.
export async function pickVoice() {
  const voices = await loadVoices();
  const norm = (v) => v.lang.replace('_', '-').toLowerCase(); // Android uses en_IN
  return (
    voices.find((v) => norm(v) === voiceLang.toLowerCase()) ||
    voices.find((v) => norm(v).startsWith('en')) ||
    null
  );
}

export function isSpeechSupported() {
  return 'speechSynthesis' in window;
}

let speakToken = 0; // lets stopSpeaking() cancel a line that is in progress

// Read `text` aloud. Resolves when finished (or stopped).
// onStart / onEnd let the page animate the avatar.
export async function speak(text, { onStart, onEnd } = {}) {
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

// Friendly messages for the errors the browser can report.
const ERROR_TEXT = {
  'not-allowed': 'Microphone is blocked. Allow it in the browser address bar, or just type your answer.',
  'service-not-allowed': 'Speech recognition is not allowed here. Please type your answer.',
  'no-speech': "I didn't hear anything. Try again, or type your answer.",
  'audio-capture': 'No microphone found. Please type your answer.',
  network: 'Speech recognition needs an internet connection. Please type your answer.',
};

// Create a recognizer. Callbacks:
//   onText(finalText, interimText)  live transcript so far
//   onEnd()                         listening stopped (for any reason)
//   onError(message)                something to show the user
export function createRecognizer({ onText, onEnd, onError }) {
  if (!Recognition) return null;

  const rec = new Recognition();
  rec.continuous = true; // keep listening through short pauses
  rec.interimResults = true; // show words while you are still speaking

  let finalText = '';

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    onText?.(finalText, interim);
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return; // we stopped it ourselves
    onError?.(ERROR_TEXT[e.error] || `Speech recognition error: ${e.error}`);
  };
  rec.onend = () => onEnd?.();

  return {
    start() {
      finalText = '';
      rec.lang = recognitionLang; // read now, so a changed setting applies
      try {
        rec.start();
      } catch {
        // start() throws if already running; safe to ignore
      }
    },
    stop() {
      rec.stop();
    },
  };
}
