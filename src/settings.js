// Settings screen: API key and model for Coach mode.
// The key is stored in this browser only. It is never shown again in full, never logged,
// and never written into code.
import { getApiKey, saveApiKey, clearApiKey, loadSettings, saveSettings, DEFAULT_MODEL } from './storage.js';
import { testConnection, ClaudeError } from './claude.js';
import { startMicCheck } from './miccheck.js';

const $ = (id) => document.getElementById(id);
const keyInput = $('key-input');
const keyStatus = $('key-status');
const modelInput = $('model-input');
const testStatus = $('test-status');
const testBtn = $('test-btn');

// Show whether a key is saved, with only the last 4 characters visible.
function showKeyStatus(message) {
  const key = getApiKey();
  const saved = key ? `A key is saved (ends in ${key.slice(-4)}).` : 'No key saved. Coach mode is switched off.';
  keyStatus.textContent = message ? `${message} ${saved}` : saved;
  testBtn.disabled = !key;
}

$('key-save').addEventListener('click', () => {
  const key = keyInput.value.trim();
  if (!key) return showKeyStatus('Paste your key first.');
  if (!key.startsWith('sk-ant-')) return showKeyStatus("That does not look like an Anthropic key (they start with sk-ant-).");
  try {
    saveApiKey(key);
  } catch {
    keyStatus.textContent = 'Could not save the key. Your browser may be blocking storage.';
    return;
  }
  keyInput.value = ''; // do not leave the key sitting in the page
  testStatus.textContent = '';
  showKeyStatus('Saved.');
});

$('key-remove').addEventListener('click', () => {
  clearApiKey();
  keyInput.value = '';
  testStatus.textContent = '';
  showKeyStatus('Key removed.');
});

$('key-show').addEventListener('change', (e) => {
  keyInput.type = e.target.checked ? 'text' : 'password';
});

/* ---------- Model ---------- */
modelInput.value = loadSettings().model;
modelInput.addEventListener('change', () => {
  const model = modelInput.value.trim() || DEFAULT_MODEL;
  modelInput.value = model;
  saveSettings({ model });
});
$('model-reset').addEventListener('click', () => {
  modelInput.value = DEFAULT_MODEL;
  saveSettings({ model: DEFAULT_MODEL });
});

/* ---------- Test connection ---------- */
testBtn.addEventListener('click', async () => {
  testBtn.disabled = true;
  testStatus.textContent = 'Testing…';
  try {
    const reply = await testConnection();
    testStatus.textContent = `It works. Claude replied: "${reply}"`;
  } catch (err) {
    // ClaudeError messages are written for the user; anything else gets a generic line
    testStatus.textContent = err instanceof ClaudeError ? err.message : 'Something went wrong. Please try again.';
  } finally {
    testBtn.disabled = !getApiKey();
  }
});

showKeyStatus('');

/* ---------- Microphone check ---------- */
const micBtn = $('mic-check-btn');
let micCheck = null; // the running check, if any

// Map a level in dB (about -60 quiet ... 0 loudest) to a bar width.
const meterWidth = (db) => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;

function endMicCheck() {
  micCheck = null;
  micBtn.textContent = 'Start microphone check';
  $('mic-meter').style.width = '0';
}

micBtn.addEventListener('click', async () => {
  if (micCheck) { micCheck.stop(); return; } // pressed again: stop early
  $('mic-check-advice').replaceChildren();
  $('mic-check-status').textContent = 'Opening the microphone…';
  try {
    micCheck = await startMicCheck({
      onLevel: (db) => { $('mic-meter').style.width = meterWidth(db); },
      onDone: ({ device, advice }) => {
        endMicCheck();
        $('mic-check-status').textContent = `Microphone: ${device || 'unknown'}.`;
        $('mic-check-advice').replaceChildren(...advice.map((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          return li;
        }));
      },
    });
    micBtn.textContent = 'Stop check';
    $('mic-check-status').textContent = 'Listening for 15 seconds… speak normally, as if answering a question.';
  } catch {
    endMicCheck();
    $('mic-check-status').textContent = 'The microphone could not be opened. Allow it in the browser address bar and check that one is connected.';
  }
});
