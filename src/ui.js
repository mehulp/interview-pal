// UI: wires the page together. For now: avatar test buttons, a spoken sample
// question, and voice answers with a live transcript.
import { createAvatar } from './avatar.js';
import { speak, stopSpeaking, pickVoice, createRecognizer, isRecognitionSupported } from './speech.js';

const avatar = createAvatar(document.getElementById('avatar'));
const caption = document.getElementById('caption');
const status = document.getElementById('status');
const answerBox = document.getElementById('answer');
const micBtn = document.getElementById('mic-btn');
const speakBtn = document.getElementById('speak-btn');

const SAMPLE_QUESTION = 'Tell me about a time you had to handle a conflict in your team.';

// Highlight the pressed test button (or none, when speech drives the avatar)
const testButtons = document.querySelectorAll('.state-test button[data-state]');
function setAvatar(state) {
  avatar.setState(state);
  testButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.state === state)));
}
testButtons.forEach((btn) => btn.addEventListener('click', () => setAvatar(btn.dataset.state)));

/* ---------- Interviewer speaks ---------- */
speakBtn.addEventListener('click', async () => {
  stopListening();
  stopSpeaking();
  caption.textContent = SAMPLE_QUESTION; // captions for everything spoken
  const voice = await pickVoice();
  status.textContent = voice ? `Voice: ${voice.name} (${voice.lang})` : 'Using the browser default voice.';
  await speak(SAMPLE_QUESTION, {
    onStart: () => setAvatar('talking'),
    onEnd: () => setAvatar('idle'),
  });
});

/* ---------- You answer ---------- */
let listening = false;
let textBefore = ''; // whatever was already in the box when listening started

const recognizer = createRecognizer({
  onText: (finalText, interim) => {
    // Live transcript goes straight into the box so you can correct it
    answerBox.value = (textBefore + ' ' + finalText + interim).trim();
  },
  onEnd: () => {
    listening = false;
    micBtn.textContent = '🎤 Answer';
    if (avatar.getState() === 'listening') setAvatar('idle');
  },
  onError: (message) => { status.textContent = message; },
});

function startListening() {
  stopSpeaking(); // the mic should not hear the interviewer
  textBefore = answerBox.value;
  listening = true;
  micBtn.textContent = '⏹ Stop';
  status.textContent = 'Listening… speak your answer.';
  setAvatar('listening');
  recognizer.start();
}

function stopListening() {
  if (listening) recognizer?.stop();
}

if (!isRecognitionSupported()) {
  // Typing always works; just explain why the mic is off.
  micBtn.disabled = true;
  status.textContent = 'Voice input is not supported in this browser. Please type your answer.';
} else {
  micBtn.addEventListener('click', () => (listening ? stopListening() : startListening()));
  // If you start typing while listening, stop so the transcript doesn't overwrite your edits
  answerBox.addEventListener('input', stopListening);
}
