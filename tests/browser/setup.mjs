// The setup screen (UX redesign Step 5): three sections and More options, presets that are only applied when chosen,
// feedback mapped to Practice/Coach, counts and notes, the start summary, the microphone test and camera preview
// (cleanup, late permissions), recording resetting to Off, and the right configuration reaching the interview.
// Devices are SIMULATED (fake microphone and camera, stand-in speech recogniser): see README.md.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, newPage, ready, startAnswer, finish, next, vis, text, stats, overflow, AUDIT, check, done } from './lib.mjs';

const OUT = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), 'interviewpal-setup-'));
mkdirSync(OUT, { recursive: true });
const shot = async (p, name, opts = {}) => writeFileSync(join(OUT, `${name}.png`), await p.screenshot(opts));
const b = await launch();

const KEEP_MORE_CLOSED = () => { window.__keepMoreClosed = true; };
const COACH_KEY = () => localStorage.setItem('interviewpal.apiKey', 'sk-ant-test-not-real');
const SPEECH = () => {
  class FakeRec { constructor() { this.continuous = true; } start() { window.__listens = (window.__listens || 0) + 1; } stop() { setTimeout(() => this.onend?.(), 10); } abort() { setTimeout(() => this.onend?.(), 10); } }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRec;
};
// Count anything that records or transcribes
const SPY = () => {
  window.__recorders = 0; window.__listens = 0;
  const Real = window.MediaRecorder;
  if (Real) window.MediaRecorder = class extends Real { constructor(...a) { super(...a); window.__recorders++; } };
};
const settings = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.settings') || 'null'));
const live = async (p) => (await stats(p)).live;
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);
const value = (p, sel) => p.inputValue(sel);

const set = (id, name, qs) => ({ id, name, questions: qs.map(([question, level, answer], i) => ({ id: `${id}${i}`, question, level, answer: answer ?? `Answer to ${question}`, topic: 'T' })) });
async function seedSets(p, sets) {
  await p.evaluate((s) => localStorage.setItem('interviewpal.sets', JSON.stringify({ sets: s })), sets);
  await p.reload();
}
const tickOnly = (p, ...names) => p.evaluate((n) => document.querySelectorAll('#set-choices input').forEach((i) => { i.checked = n.some((x) => i.parentElement.textContent.includes(x)); i.dispatchEvent(new Event('change', { bubbles: true })); }), names);
const SETS = [
  set('a', 'Alpha', [['What is one?', 'easy'], ['What is two?', ''], ['What is three?', 'hard'], ['What is four?', 'easy']]),
  set('b', 'Beta', [['What is one?', 'easy'], ['What is five?', 'hard']]), // "What is one?" repeats a question in Alpha
];

/* ===== 1. A new installation starts on Guided rehearsal; More options is tucked away ===== */
{
  const p = await newPage(b, { init: [KEEP_MORE_CLOSED] });
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  check('three numbered sections are on one screen (no wizard)', (await p.locator('#setup .setup-section').count()) === 3 && (await vis(p, '#start-btn')));
  check('a new installation starts on Guided rehearsal', await p.locator('#preset-guided').isChecked() && !(await p.locator('#preset-mock').isChecked()));
  check('Guided defaults: reference shown, Relaxed, Self-review, recording Off', (await p.locator('#opt-show-answer').isChecked()) && (await value(p, '#opt-difficulty')) === 'easy' && (await p.locator('#fbk-self').isChecked()) && (await p.locator('#setup-rec-off').isChecked()));
  check('the summary names the questions, preset, method and recording, and a second line has the time limit and feedback', (await text(p, '#start-summary-1')).includes('Guided rehearsal') && (await text(p, '#start-summary-1')).includes('Recording off') && (await text(p, '#start-summary-2')).includes('Time limit: none') && (await text(p, '#start-summary-2')).includes('Feedback: Self-review'), await text(p, '#start-summary-1'));
  check('More options is closed; pressure, accents and experimental recogniser are inside it', !(await p.evaluate(() => document.getElementById('more-options').open)) && !(await vis(p, '#opt-difficulty')) && !(await vis(p, '#opt-ondevice')) && !(await vis(p, '#voice-lang')));
  check('essentials stay visible: sets, count, order, complexity, presets, feedback, Speak/Type, microphone, recording', (await Promise.all(['#set-choices', '#opt-count', '#opt-order', '#opt-level', '#preset-guided', '#fbk-self', '#setup-method-type', '#opt-mic', '#setup-mic-btn', '#setup-cam-btn', '#setup-rec-off'].map((s) => vis(p, s)))).every(Boolean));
  check('"Question level" is now "Question complexity", with the same values', (await text(p, '#setup')).includes('Question complexity') && !(await text(p, '#setup')).includes('Question level') && (await p.locator('#opt-level option').evaluateAll((o) => o.map((x) => x.value).join())) === 'all,easy,hard');
  await shot(p, 'setup-new-user-desktop', { fullPage: true });
  await p.focus('#more-options > summary'); await p.keyboard.press('Enter');
  check('More options opens from the keyboard', await p.evaluate(() => document.getElementById('more-options').open) && (await vis(p, '#opt-difficulty')));
  check('"Difficulty" is "Interview pressure": Relaxed / Standard / Challenging over easy / medium / hard', (await p.locator('#opt-difficulty option').evaluateAll((o) => o.map((x) => `${x.value}=${x.textContent}`).join())) === 'easy=Relaxed,medium=Standard,hard=Challenging');
  check('the pressure explanation states the real rules', (await text(p, '#difficulty-note')).includes('No time limit') && (await text(p, '#difficulty-note')).includes('Repeat is allowed'), await text(p, '#difficulty-note'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 2. A returning user's saved choices are never overwritten on load ===== */
{
  const p = await newPage(b);
  await p.evaluate(() => localStorage.setItem('interviewpal.settings', JSON.stringify({ practiceDifficulty: 'hard', showModelAnswer: false, mode: 'practice', practiceSelfMark: false, practiceCount: 7, practiceOrder: 'random', theme: 'teal' })));
  const before = await settings(p);
  await p.reload();
  const after = await settings(p);
  check('nothing was written on load (the saved settings are exactly as they were)', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
  check('no preset is selected, and the screen says these are your own settings', !(await p.locator('#preset-guided').isChecked()) && !(await p.locator('#preset-mock').isChecked()) && (await text(p, '#preset-status')).includes('Your own settings'));
  check('the saved choices are shown: Challenging, reference off, No feedback, 7 questions, random', (await value(p, '#opt-difficulty')) === 'hard' && !(await p.locator('#opt-show-answer').isChecked()) && (await p.locator('#fbk-none').isChecked()) && (await value(p, '#opt-count')) === '7' && (await value(p, '#opt-order')) === 'random');
  check('the saved theme is still applied', (await p.getAttribute('html', 'data-theme')) === 'teal');
  await p.context().close();
}

/* ===== 3. Presets: applied only when chosen; Customised; no reapplying on unrelated changes ===== */
{
  const p = await newPage(b);
  await seedSets(p, SETS);
  await tickOnly(p, 'Alpha'); await p.fill('#opt-count', '3'); await p.selectOption('#opt-order', 'random');
  await p.click('#preset-mock');
  check('choosing Mock applies its defaults: Standard, reference hidden, Self-review', (await value(p, '#opt-difficulty')) === 'medium' && !(await p.locator('#opt-show-answer').isChecked()) && (await p.locator('#fbk-self').isChecked()));
  check('and leaves everything else alone: sets, count and order', (await value(p, '#opt-count')) === '3' && (await value(p, '#opt-order')) === 'random' && (await p.locator('#set-choices input:checked').count()) === 1);
  let s = await settings(p);
  check('the preset and its settings were saved (merged): preset, pressure, reference, feedback', s.preset === 'mock' && s.practiceDifficulty === 'medium' && s.showModelAnswer === false && s.mode === 'practice' && s.practiceSelfMark === true, JSON.stringify(s));
  check('Mock is shown as selected, not customised', (await text(p, '#preset-status')).includes('Mock interview selected'));
  await p.check('#fbk-none');
  check('changing feedback shows Customised', (await text(p, '#preset-status')).includes('customised') && (await text(p, '#start-summary-1')).includes('Mock interview (customised)'), await text(p, '#preset-status'));
  check('and nothing else moved: still Standard, reference hidden', (await value(p, '#opt-difficulty')) === 'medium' && !(await p.locator('#opt-show-answer').isChecked()));
  // unrelated changes and refreshes must not reapply the preset
  await p.check('#opt-show-answer'); await p.selectOption('#opt-difficulty', 'hard');
  await tickOnly(p, 'Alpha', 'Beta'); await p.fill('#opt-count', '2'); await p.check('#fbk-none');
  await tab(p, 'history'); await tab(p, 'practice');
  check('changing sets, count and feedback, and leaving and returning, did not reapply the preset', (await value(p, '#opt-difficulty')) === 'hard' && (await p.locator('#opt-show-answer').isChecked()) && (await p.locator('#fbk-none').isChecked()), `${await value(p, '#opt-difficulty')}`);
  check('Customised is still shown, and the chosen preset is still Mock', (await text(p, '#preset-status')).includes('customised') && (await p.locator('#preset-mock').isChecked()));
  await p.selectOption('#opt-difficulty', 'medium'); await p.uncheck('#opt-show-answer'); await p.check('#fbk-self');
  check('putting the choices back to the preset removes Customised', !(await text(p, '#preset-status')).includes('customised'));
  await p.click('#preset-guided');
  check('choosing Guided again applies Guided: Relaxed, reference shown', (await value(p, '#opt-difficulty')) === 'easy' && (await p.locator('#opt-show-answer').isChecked()));
  await p.context().close();
}

/* ===== 4. Counts, duplicates, filters, oversized requests, empty sets ===== */
{
  const p = await newPage(b);
  await seedSets(p, SETS);
  await tickOnly(p, 'Alpha', 'Beta'); await p.fill('#opt-count', '3'); await p.selectOption('#opt-level', 'all');
  check('duplicates across ticked sets count once (4 + 2 questions, one repeated = 5)', (await text(p, '#available')).startsWith('5 question(s) available'), await text(p, '#available'));
  await p.fill('#opt-count', '50');
  check('an oversized request is explained, and the summary shows what the session will really have', (await text(p, '#available')).includes('You asked for 50, but only 5 match, so the session will have 5.') && (await text(p, '#start-summary-1')).startsWith('5 questions'), await text(p, '#available'));
  await p.selectOption('#opt-level', 'hard');
  check('the complexity filter is counted, and the unfiltered number is shown', (await text(p, '#available')).includes('2 question(s) available (5 before the complexity filter)'), await text(p, '#available'));
  await tickOnly(p, 'Beta'); await p.selectOption('#opt-level', 'easy'); await p.fill('#opt-count', '3');
  check('both pickers keep their choices as other things change', (await value(p, '#opt-level')) === 'easy' && (await value(p, '#opt-count')) === '3');
  await tickOnly(p);
  check('no set ticked: Start is off and says to tick one', (await p.locator('#start-btn').isDisabled()) && (await text(p, '#setup-status')).includes('Tick at least one'));
  await seedSets(p, [set('c', 'Only easy', [['E1?', 'easy'], ['E2?', 'easy']])]);
  await tickOnly(p, 'Only easy'); await p.selectOption('#opt-level', 'hard');
  check('an unmatched filter: Start is off, with something to do about it', (await p.locator('#start-btn').isDisabled()) && (await text(p, '#setup-status')).includes('Question complexity') && (await text(p, '#available')).includes('none are marked hard'), await text(p, '#setup-status'));
  await p.selectOption('#opt-level', 'all');
  check('changing the filter back turns Start on again', !(await p.locator('#start-btn').isDisabled()));
  await p.evaluate(() => localStorage.setItem('interviewpal.sets', JSON.stringify({ sets: [{ id: 'z', name: 'Empty', questions: [] }] })));
  await p.reload();
  check('empty sets: no usable questions, a clear link to Questions, Start is off', (await text(p, '#available')).includes('No questions') && (await vis(p, '#to-questions')) && (await p.locator('#start-btn').isDisabled()) && (await text(p, '#setup-status')).includes('Add some questions'), await text(p, '#available'));
  await p.click('#to-questions');
  check('the link goes to the Questions tab', await vis(p, '#screen-questions'));
  await p.context().close();
}

/* ===== 5. AI Coach: unavailable without a key, with a link; the mapping onto Coach ===== */
{
  const p = await newPage(b);
  check('without a key AI Coach is off, with a link to Settings', (await p.locator('#fbk-coach').isDisabled()) && (await vis(p, '#coach-unavailable')));
  await p.click('#to-settings');
  check('the link opens Settings', await vis(p, '#screen-settings'));
  await p.context().close();
}
{
  const p = await newPage(b, { init: [COACH_KEY] });
  await p.reload();
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  check('with a key AI Coach can be chosen, and it shows what is sent', !(await p.locator('#fbk-coach').isDisabled()) && !(await vis(p, '#coach-unavailable')));
  await p.check('#fbk-coach');
  check('choosing it shows the Coach notice and the spoken-feedback option (in More options), and Start says coaching', (await vis(p, '#coach-note')) && (await vis(p, '#coach-speak-row')) && (await text(p, '#start-btn')) === 'Start coaching' && (await text(p, '#start-summary-2')).includes('Feedback: AI Coach'));
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  const s = await settings(p);
  check('AI Coach is the existing Coach mode (mode "coach"), and no new mode was invented', s.mode === 'coach' && !('feedback' in s) && Object.keys(s).every((k) => !/coach.*mode|aiMode/i.test(k)), JSON.stringify(s));
  await p.context().close();
}

/* ===== 6. Speak / Type, and unsupported speech recognition ===== */
{
  const p = await newPage(b);
  check('no speech recognition: Type is chosen, Speak is off, and the note says so', (await p.locator('#setup-method-type').isChecked()) && (await p.locator('#setup-method-speak').isDisabled()) && (await text(p, '#setup-speech-note')).includes('cannot recognise speech'));
  await p.click('#start-btn').catch(() => {});
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p); await startAnswer(p);
  check('typing works with no recognition (the interview is usable)', (await p.locator('#method-type').isChecked()) && (await p.locator('#answer').isEditable()));
  await p.context().close();
}
{
  const p = await newPage(b, { init: [SPEECH] });
  check('with recognition: Speak is the default, and the note explains where speech goes', (await p.locator('#setup-method-speak').isChecked()) && (await text(p, '#setup-speech-note')).includes('sent to Google'));
  check('Practice is not described as offline: the note says it is not guaranteed to work offline', (await text(p, '#setup')).includes('not guaranteed to work offline'));
  await p.check('#setup-method-type');
  check('choosing Type is remembered in the same setting the interview uses', (await settings(p)).answerMethod === 'type');
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  check('the interview opens on Type, and nothing is listened to until Start answer', (await p.locator('#method-type').isChecked()) && ((await p.evaluate(() => window.__listens)) || 0) === 0);
  await p.context().close();
}

/* ===== 7. Recording is a per-session choice, Off every time setup opens ===== */
{
  const p = await newPage(b, { init: [SPY] });
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  check('the line beside Recording says it is not remembered', (await text(p, '#setup-rec-note')).includes('Not remembered'));
  await p.check('#setup-rec-audio');
  check('the summary follows the choice', (await text(p, '#start-summary-1')).includes('Recording audio'));
  await p.fill('#opt-count', '2'); await p.click('#start-btn'); await ready(p);
  check('the interview opens with Audio chosen, but nothing is recording or requested', (await p.locator('#rec-mode-audio').isChecked()) && (await stats(p)).gum === 0 && (await p.evaluate(() => window.__recorders)) === 0);
  check('recording is not saved in the settings', !JSON.stringify(await settings(p)).toLowerCase().includes('record'));
  await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])');
  await p.fill('#answer', 'x'); await finish(p); await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  await p.click('#again-btn');
  check('back on setup after the session, Recording is Off again', await p.locator('#setup-rec-off').isChecked());
  await p.click('#start-btn'); await ready(p);
  check('and the next session starts with Recording Off', await p.locator('#rec-mode-off').isChecked());
  await p.reload(); await tab(p, 'practice');
  check('a reload also resets it to Off', await p.locator('#setup-rec-off').isChecked());
  await p.context().close();
}

/* ===== 8. Microphone test: no recording, no transcription, cleanup, late permission ===== */
{
  const p = await newPage(b, { init: [SPY, SPEECH, () => { window.__gumRelease = null; window.__gumHold = false; window.__gum = (c, real) => (window.__gumHold ? new Promise((resolve) => { window.__gumRelease = async () => resolve(await real(c)); }) : real(c)); }] });
  await p.click('#setup-mic-btn');
  await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('Listening'));
  check('Test microphone opens the microphone and shows it is listening', (await live(p)) === 1 && (await text(p, '#setup-mic-btn')) === 'Stop test');
  check('the test records nothing and transcribes nothing', (await p.evaluate(() => window.__recorders)) === 0 && (await p.evaluate(() => window.__listens)) === 0);
  await p.waitForTimeout(700);
  await p.click('#setup-mic-btn');
  check('Stop test ends it, shows advice, and the microphone is released', (await live(p)) === 0 && (await p.locator('#setup-mic-advice li').count()) >= 1 && (await text(p, '#setup-mic-status')).startsWith('Microphone:'));
  // leaving setup ends a running test
  await p.click('#setup-mic-btn'); await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('Listening'));
  await tab(p, 'history');
  check('switching tab ends the test and releases the microphone', (await live(p)) === 0);
  await tab(p, 'practice');
  check('the button is back to Test microphone', (await text(p, '#setup-mic-btn')) === 'Test microphone');
  // changing the microphone ends the test
  await p.click('#setup-mic-btn'); await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('Listening'));
  await p.evaluate(() => document.getElementById('opt-mic').dispatchEvent(new Event('change', { bubbles: true })));
  check('choosing another microphone ends the old test', (await live(p)) === 0);
  // a late permission after Cancel
  await p.evaluate(() => { window.__gumHold = true; });
  await p.click('#setup-mic-btn');
  check('while the browser asks, the button says Cancel', (await text(p, '#setup-mic-btn')) === 'Cancel' && (await text(p, '#setup-mic-status')).includes('Waiting'));
  await p.click('#setup-mic-btn');
  await p.evaluate(() => window.__gumRelease()); // the person clicks Allow, too late
  await p.waitForTimeout(600);
  check('a permission answered after Cancel is released at once; no test starts', (await live(p)) === 0 && (await text(p, '#setup-mic-btn')) === 'Test microphone' && (await text(p, '#setup-mic-status')) === 'Cancelled.');
  // leaving during the prompt
  await p.click('#setup-mic-btn'); await tab(p, 'history'); await p.evaluate(() => window.__gumRelease()); await p.waitForTimeout(600);
  check('leaving the tab while the prompt is open also releases a late permission', (await live(p)) === 0);
  await p.evaluate(() => { window.__gumHold = false; });
  await tab(p, 'practice');
  // Start ends a running test before the session starts
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.click('#setup-mic-btn'); await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('Listening'));
  await p.fill('#opt-count', '1'); await p.click('#start-btn');
  check('pressing Start ends the microphone test at once', (await live(p)) === 0);
  await ready(p);
  check('the interview started without any microphone being held', (await live(p)) === 0);
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}
{
  // The microphone is refused: a clear message, and typing still works
  const p = await newPage(b, { init: [() => { window.__gum = () => { throw Object.assign(new Error('refused'), { name: 'NotAllowedError' }); }; }] });
  await p.click('#setup-mic-btn');
  await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('could not be opened'));
  check('a refused microphone gets a clear message that says typing still works', (await text(p, '#setup-mic-status')).includes('type your responses') && (await text(p, '#setup-mic-btn')) === 'Test microphone');
  await p.click('#setup-cam-btn');
  await p.waitForFunction(() => document.getElementById('setup-cam-note').textContent.length > 0);
  check('a refused camera says so, and the button returns to Preview camera', (await text(p, '#setup-cam-note')).includes('blocked') && (await text(p, '#setup-cam-btn')) === 'Preview camera' && !(await vis(p, '#setup-cam')));
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  check('Start is still available', !(await p.locator('#start-btn').isDisabled()));
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p); await startAnswer(p); await p.fill('#answer', 'typed anyway'); await finish(p);
  check('with devices refused, a typed response still works end to end', (await text(p, '#review-response')) === 'typed anyway');
  await p.context().close();
}

/* ===== 9. Camera preview: explicit, video only, stops everywhere, late permission released ===== */
{
  const p = await newPage(b, { init: [SPY, () => { window.__gumRelease = null; window.__gumHold = false; window.__gum = (c, real) => (window.__gumHold && c.video ? new Promise((resolve) => { window.__gumRelease = async () => resolve(await real(c)); }) : real(c)); }] });
  check('nothing asks for the camera until the button is pressed', (await stats(p)).gum === 0);
  await p.click('#setup-cam-btn');
  await p.waitForSelector('#setup-cam:not([hidden])');
  const c = await p.evaluate(() => window.__stats.constraints.at(-1));
  check('the preview asks for the camera only (no microphone), and shows a small picture', c.includes('"video"') && c.includes('"audio":false') && (await live(p)) === 1 && (await p.evaluate(() => document.getElementById('setup-cam').getBoundingClientRect().width)) <= 200);
  check('the button says Stop preview, and the preview does not record', (await text(p, '#setup-cam-btn')) === 'Stop preview' && (await p.evaluate(() => window.__recorders)) === 0);
  check('the recording choice is untouched by allowing the preview', await p.locator('#setup-rec-off').isChecked());
  await p.click('#setup-cam-btn');
  check('turning it off stops the camera and hides the picture', (await live(p)) === 0 && !(await vis(p, '#setup-cam')));
  await p.click('#setup-cam-btn'); await p.waitForSelector('#setup-cam:not([hidden])');
  await tab(p, 'history');
  check('switching tab stops the preview', (await live(p)) === 0);
  await tab(p, 'practice');
  check('and it is off when you come back', !(await vis(p, '#setup-cam')) && (await text(p, '#setup-cam-btn')) === 'Preview camera');
  // cancelled before ready
  await p.evaluate(() => { window.__gumHold = true; });
  await p.click('#setup-cam-btn'); await p.click('#setup-cam-btn');
  await p.evaluate(() => window.__gumRelease());
  await p.waitForTimeout(600);
  check('a camera permission answered after Stop is released at once; no picture appears', (await live(p)) === 0 && !(await vis(p, '#setup-cam')));
  await p.evaluate(() => { window.__gumHold = false; });
  // Start ends a running preview; session self-view is its own choice
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.click('#setup-cam-btn'); await p.waitForSelector('#setup-cam:not([hidden])');
  await p.fill('#opt-count', '1'); await p.click('#start-btn');
  check('pressing Start ends the preview at once', (await live(p)) === 0);
  await ready(p);
  check('with self-view not chosen, no camera is on during the interview (the preview was not consent)', (await live(p)) === 0 && !(await vis(p, '#self-view')));
  await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  check('no recorder was ever created', (await p.evaluate(() => window.__recorders)) === 0);
  await p.context().close();
}
{
  // Self-view chosen in setup is the session's camera; the preview does not leak into it
  const p = await newPage(b);
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.click('#setup-cam-btn'); await p.waitForSelector('#setup-cam:not([hidden])');
  await p.check('#opt-selfview'); await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  await p.waitForFunction(() => document.getElementById('self-view').srcObject !== null);
  check('with self-view chosen exactly one camera is live (the preview was released, the session has its own)', (await live(p)) === 1);
  await p.context().close();
}

/* ===== 10. The right configuration reaches the interview ===== */
{
  const p = await newPage(b);
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.fill('#opt-count', '2'); await p.selectOption('#opt-order', 'serial');
  await p.click('#start-btn'); await ready(p); // a new installation: Guided
  check('Guided: the reference is on screen, no hard countdown, and the Show answer button says Hide', (await vis(p, '#model-answer')) && !(await vis(p, '#timer')) && (await text(p, '#answer-toggle')) === 'Hide answer');
  await startAnswer(p); await p.fill('#answer', 'my attempt'); await finish(p);
  check('Guided: the review offers self-marking (Self-review)', await vis(p, '#mark-row'));
  await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  const h1 = JSON.parse(await p.evaluate(() => localStorage.getItem('interviewpal.history')));
  check('History shows the reference was visible (actual tracking, not the preset)', h1[0].answersVisible === true && h1[0].results[0].answerShown === true);
  await p.click('#again-btn'); await p.click('#preset-mock');
  await p.fill('#opt-count', '2'); await p.click('#start-btn'); await ready(p);
  check('Mock: the reference is hidden at first and the hard countdown is running (Standard rules)', !(await vis(p, '#model-answer')) && (await vis(p, '#timer')) && /⏱ (2:00|1:5\d)/.test(await text(p, '#timer')), await text(p, '#timer'));
  await startAnswer(p); await p.fill('#answer', 'closed book'); await finish(p); await next(p); await ready(p);
  await p.click('#answer-toggle'); await startAnswer(p); await p.fill('#answer', 'peeked'); await finish(p);
  await p.click('#end-btn'); await p.waitForSelector('#finished:not([hidden])');
  const h2 = JSON.parse(await p.evaluate(() => localStorage.getItem('interviewpal.history')))[0];
  check('Mock: revealing the reference during an answer keeps the assisted flag; the closed-book answer is unflagged', h2.results[0].answerShown === false && h2.results[1].answerShown === true && h2.answersVisible === true, JSON.stringify(h2.results.map((r) => r.answerShown)));
  check('the first session in History is unchanged by choosing a preset later', JSON.parse(await p.evaluate(() => localStorage.getItem('interviewpal.history'))).length === 2);
  await p.context().close();
}

/* ===== 11. Keyboard, phone width, zoom and every theme ===== */
{
  const p = await newPage(b, { viewport: { width: 1200, height: 900 } });
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.focus('#preset-guided');
  await p.keyboard.press('ArrowDown');
  check('the presets are a radio group: arrow keys move between them and apply the preset', (await p.locator('#preset-mock').isChecked()) && (await value(p, '#opt-difficulty')) === 'medium');
  await p.focus('#fbk-none'); await p.keyboard.press('ArrowDown');
  check('feedback is a radio group too', await p.locator('#fbk-self').isChecked());
  const order = [];
  await p.focus('#opt-count');
  for (let i = 0; i < 60; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => document.activeElement.id || document.activeElement.tagName)); if (order.at(-1) === 'start-btn') break; }
  check('Tab reaches the controls in a sensible order and ends at Start', order.at(-1) === 'start-btn' && order.includes('setup-mic-btn') && order.includes('setup-cam-btn') && order.indexOf('fbk-self') < order.indexOf('setup-mic-btn'), order.join(' '));
  await p.keyboard.press('Enter');
  await ready(p);
  check('Enter on Start starts the interview', await vis(p, '#interview'));
  await p.context().close();
}
{
  const p = await newPage(b, { viewport: { width: 390, height: 800 }, init: [KEEP_MORE_CLOSED] });
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  let o = await p.evaluate(overflow);
  check('phone width (390px): no sideways scroll on setup', o.sw <= o.cw, JSON.stringify(o));
  await shot(p, 'setup-new-user-mobile', { fullPage: true });
  await p.click('#more-options > summary');
  o = await p.evaluate(overflow);
  check('phone width with More options open: no sideways scroll', o.sw <= o.cw, JSON.stringify(o));
  await p.context().close();
}
{
  const ctx = await b.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  await p.goto(process.env.BASE_URL || 'http://localhost:8804/');
  const o = await p.evaluate(overflow);
  const a = await p.evaluate(AUDIT);
  check('a 640px window at double scale (what 200% zoom of a 1280px window looks like; emulation, not real zoom): no sideways scroll, text readable', o.sw <= o.cw && a.failures.length === 0, JSON.stringify(o) + a.failures.slice(0, 2).join('|'));
  await ctx.close();
}
for (const id of ['sage', 'teal', 'plum', 'blue']) {
  const p = await newPage(b, { viewport: { width: 1200, height: 900 } });
  await p.evaluate((t) => localStorage.setItem('interviewpal.settings', JSON.stringify({ theme: t })), id);
  await p.reload();
  await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.click('#preset-mock'); await p.check('#fbk-none'); // Customised
  await p.click('#setup-mic-btn'); await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('Listening')); await p.waitForTimeout(500);
  await p.click('#setup-mic-btn');
  await p.evaluate(() => { document.getElementById('more-options').open = true; });
  await p.fill('#opt-count', '99'); // an oversized request note
  const a = await p.evaluate(AUDIT);
  check(`${id}: the setup screen (presets, customised note, device test, More options, notes) is readable (${a.checked} pieces of text)`, a.failures.length === 0, a.failures.slice(0, 3).join(' | '));
  if (id === 'sage') await shot(p, 'setup-desktop', { fullPage: true });
  await p.context().close();
}

console.log(`Screenshots written to ${OUT}`);
await b.close();
process.exit(done() ? 1 : 0);
