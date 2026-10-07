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
