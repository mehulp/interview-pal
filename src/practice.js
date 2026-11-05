// Practice screen: setup, then the interview loop (no AI, nothing leaves the browser).
//
// Flow for each question:  the interviewer asks -> Ready (think, or type) -> Start answer -> Answering (speak or type,
//   optionally recorded) -> Finish answer -> Finishing (waits for the last words and the recording) -> Review
//   (your response, the recording, the reference, self-marking or Coach feedback) -> Next question.
import {
  speak, stopSpeaking, createRecognizer, isRecognitionSupported,
  LANGUAGES, setVoiceLang, setRecognitionLang, setVoiceProfile, pickVoice, describeVoice,
  joinText, prepareOnDevice, getRecognitionLang,
} from './speech.js';
import { keyTerms } from './vocabulary.js';
import { pickPhrase } from './phrases.js';
import {
  DIFFICULTY, timerSecondsFor, describeDifficulty, usableQuestions, filterByLevel,
  buildQuestionList, removeRepeats, createSession, createTimer, formatTime, needsLeaveConfirmation, unfinishedAnswer,
  nextPhase, phaseAllows, primaryAction, canRepeat, canSkip,
} from './session.js';
import { loadInterviewers, pickInterviewer } from './interviewers.js';
import { createSelfView } from './selfview.js';
import { loadSets, loadQuestions, loadSettings, saveSettings, getApiKey, saveSession } from './storage.js';
import { buildSessionRecord, outcomeOf } from './history.js';
import { analyzeAnswer } from './delivery.js';
import { recPanel } from './recpanel.js';
import { renderSummary } from './summary.js';

const $ = (id) => document.getElementById(id);

export function initPractice(avatar) {
  const settings = loadSettings();

  // Setup controls
  const optOrder = $('opt-order');
  const optLevel = $('opt-level');
  const optDifficulty = $('opt-difficulty');
  const optCount = $('opt-count');
  const optEasyTimer = $('opt-easy-timer');
  const optSelfMark = $('opt-selfmark');
  const optCoachSpeak = $('opt-coach-speak');
  const optSelfView = $('opt-selfview');
  const optOnDevice = $('opt-ondevice');
  const optMic = $('opt-mic');
  const optInterviewer = $('opt-interviewer');
  const selfView = createSelfView($('self-view'));
  recPanel.setCameraSource(() => selfView.getVideoTrack()); // video recording can copy self-view's camera
  const selfViewBtn = $('selfview-btn');
  const startBtn = $('start-btn');
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const modeCoach = $('mode-coach');

  // Interview controls
  const answerBox = $('answer');
  const status = $('status');
  const micBtn = $('mic-btn');
  const primaryBtn = $('primary-btn');
  const repeatBtn = $('repeat-btn');
  const skipBtn = $('skip-btn');
  const timerEl = $('timer');

  // What is happening right now
  let session = null;
  let options = null; // the choices made at setup
  let phase = 'setup'; // setup | asking | ready | answering | finishing | review | ending | finished
  let runId = 0; // bumped whenever the flow moves on, so old waiting code stops itself
  let sayId = 0;
  let timer = null;
  let askedAt = 0; // when the question finished being spoken (the hard countdown and preparation start here)
  let answerStartedAt = 0; // when Start answer was pressed (0 = not yet)
  let clockTimer = null;
  let voice = { chunks: [], live: '', ms: 0, since: 0 }; // speech heard during the current answer
  let sessionStartedAt = 0; // when the whole session began (for the summary)
  let listening = false;
  let onDeviceReady = false; // the on-device recogniser is switched on and works here
  let textBefore = '';
  let speechProblem = false; // the recogniser reported a problem: its message stays on the Speech to text line
  let typedWhileListening = false; // you typed while the microphone was on: later transcript text is not put in the box
  // Starting and ending are asynchronous, so each is guarded against happening twice or arriving late
  let starting = false; // Start was pressed and the first question has not begun yet
  let startToken = 0; // numbers each start, so one that was cancelled can tell it is out of date
  let ending = null; // the one end of session in progress (a promise): it only ever happens once
  let endRequested = false; // set as soon as ending begins, so work already under way does not go on to a next step
  let finalising = null; // { promise } while an answer is being handed in (Next, Skip or time up)
  let submittedThisQuestion = false; // the answer to the question on screen has already become a result
  let questionToken = 0; // a new number for every question asked, so a recording is never tied to the wrong one
  let replyTab = 'reference'; // narrow screens only: which tab is open while the reference is on ('reference' or 'response')
  const roomyQuery = window.matchMedia('(min-width: 960px)'); // the two-column layout: no tabs needed
  const roomy = () => roomyQuery.matches;
  let answerVisible = false; // is the model answer showing? (this session only; the saved setting only sets the start)
  let answerShownNow = false; // was it visible at any point while the current question was open?

  /* ---------- Accent pickers (saved in this browser) ---------- */
  function setupPicker(select, key, apply) {
    select.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
    select.value = settings[key];
    apply(select.value);
    select.addEventListener('change', () => {
      apply(select.value);
      saveSettings({ [key]: select.value }); // saves just this one setting
    });
  }
  setupPicker($('voice-lang'), 'voiceLang', setVoiceLang);
  setupPicker($('recognition-lang'), 'recognitionLang', (code) => {
    setRecognitionLang(code);
    if (optOnDevice.checked) checkOnDevice(); // the on-device pack depends on the accent
  });

  /* ---------- Setup screen ---------- */
  optOrder.value = settings.practiceOrder;
  optLevel.value = settings.practiceLevel;
  optDifficulty.value = settings.practiceDifficulty;
  optCount.value = settings.practiceCount;
  optEasyTimer.checked = settings.practiceEasyTimer;
  optSelfMark.checked = settings.practiceSelfMark;
  $('opt-show-answer').checked = settings.showModelAnswer;
  optCoachSpeak.checked = settings.coachSpeak;
  optSelfView.checked = settings.selfView;

  /* ---------- Interviewer face (clips you installed, or the drawn face) ---------- */
  let interviewers = []; // installed interviewers, read from assets/interviewers/interviewers.json
  let loadedFolder = null; // the face now in use ('' = the drawn face, null = nothing loaded yet)
  let lastAutoFolder = ''; // last Automatic pick, so the same face is not chosen twice in a row

  // Show an interviewer's face (entry), or the drawn face (null). Skips the work if it is already showing.
  async function showInterviewer(entry) {
    const folder = entry ? entry.folder : '';
    setVoiceProfile(entry ? entry.voice : null); // the voice goes with the face (for example a woman's voice for her)
    if (folder === loadedFolder) return;
    loadedFolder = folder;
    $('interviewer-status').textContent = entry ? 'Loading the interviewer…' : '';
    const ok = await avatar.useInterviewer(entry);
    if (!ok) loadedFolder = null; // try again next time
    $('interviewer-status').textContent = ok ? '' :
      "Couldn't load that interviewer's files, so the drawn face is used. See assets/interviewers/README.md.";
  }

  // Who interviews this session: a fixed choice, or (Automatic) one picked by difficulty.
  function chooseInterviewer(difficulty) {
    const choice = optInterviewer.value;
    if (choice === 'auto') return pickInterviewer(interviewers, difficulty, lastAutoFolder);
    return interviewers.find((i) => i.folder === choice) || null;
  }

  optInterviewer.addEventListener('change', () => {
    saveSettings({ interviewer: optInterviewer.value });
    if (optInterviewer.value !== 'auto') showInterviewer(chooseInterviewer(optDifficulty.value));
  });
  loadInterviewers().then((list) => {
    if (!list.length) return; // none installed: keep the drawn face and hide the choice
    optInterviewer.replaceChildren(
      new Option('Automatic (picked by difficulty)', 'auto'),
      ...list.map((i) => new Option(i.name, i.folder)),
      new Option('Drawn face', ''),
    );
    interviewers = list;
    // Not chosen yet (or an interviewer that is no longer installed): Automatic
    const saved = settings.interviewer ?? 'auto';
    optInterviewer.value = saved === 'auto' || saved === '' || list.some((i) => i.folder === saved) ? saved : 'auto';
    $('interviewer-row').hidden = false;
    if (optInterviewer.value !== 'auto') showInterviewer(chooseInterviewer(optDifficulty.value));
  });

  /* ---------- Self-view (your camera, on screen only) ---------- */
  async function setSelfView(on) {
    $('selfview-note').textContent = '';
    if (on) {
      const result = await selfView.start();
      if (!result.ok && result.message) $('selfview-note').textContent = result.message; // a cancelled request has no message
    } else {
      selfView.stop();
    }
    selfViewBtn.setAttribute('aria-pressed', String(selfView.isOn()));
  }
  selfViewBtn.addEventListener('click', () => setSelfView(!selfView.isOn()));

  // The sets you can tick for a session. The last choice is remembered (none saved = all ticked).
  const selectedSetIds = () => [...document.querySelectorAll('#set-choices input:checked')].map((i) => i.value);

  function renderSetChoices() {
    const sets = loadSets();
    const saved = loadSettings().practiceSets.filter((id) => sets.some((s) => s.id === id));
    const ticked = saved.length ? saved : sets.map((s) => s.id);
    $('set-choices').replaceChildren(...sets.map((set) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = set.id;
      box.checked = ticked.includes(set.id);
      box.addEventListener('change', refreshSetup);
      const label = document.createElement('label');
      label.className = 'check';
      label.append(box, `${set.name} (${set.questions.length})`); // append with text: no HTML injection
      return label;
    }));
  }

  const selectedMode = () => document.querySelector('input[name="mode"]:checked').value;
  modeRadios.forEach((r) => { r.checked = r.value === settings.mode; });

  function readOptions() {
    return {
      mode: selectedMode(),
      order: optOrder.value,
      level: optLevel.value,
      difficulty: optDifficulty.value,
      count: Math.max(1, parseInt(optCount.value, 10) || 10),
      easyTimer: optEasyTimer.checked,
      selfMark: optSelfMark.checked,
      showAnswer: $('opt-show-answer').checked,
      coachSpeak: optCoachSpeak.checked,
      selfView: optSelfView.checked,
    };
  }

  // Update the "how many questions" line, the difficulty note and the Start button.
  function refreshSetup() {
    // Coach mode needs an API key. Without one it is switched off, with a pointer to Settings.
    const hasKey = Boolean(getApiKey());
    modeCoach.disabled = !hasKey;
    if (!hasKey && modeCoach.checked) document.querySelector('input[value="practice"]').checked = true;
    $('mode-note').hidden = hasKey;
    const coach = selectedMode() === 'coach';
    startBtn.textContent = coach ? 'Start coaching' : 'Start practice';
    // Coach mode: the AI marks you, so self-marking is replaced by the "speak feedback" choice
    $('selfmark-row').hidden = coach;
    $('coach-speak-row').hidden = !coach;
    $('coach-note').hidden = !coach;

    const o = readOptions();
    const setIds = selectedSetIds();
    const usable = usableQuestions(loadQuestions(setIds));
    const all = removeRepeats(usable); // a question in two ticked sets counts once
    const matching = removeRepeats(filterByLevel(usable, o.level));

    $('available').textContent = !usableQuestions(loadQuestions()).length
      ? 'No questions saved yet. Add some on the Questions tab first.'
      : !setIds.length
        ? 'Tick at least one set.'
        : `${all.length} question(s) in the ticked set(s). ${matching.length} match your choices.`;
    $('difficulty-note').textContent = `${DIFFICULTY[o.difficulty].label}: ${describeDifficulty(o.difficulty, o.easyTimer)}`;
    $('easy-timer-row').hidden = o.difficulty !== 'easy';
    startBtn.disabled = matching.length === 0 || starting;
    $('setup-status').textContent = '';
  }
  [optOrder, optLevel, optDifficulty, optCount, optEasyTimer, optSelfMark, optCoachSpeak, ...modeRadios].forEach((control) =>
    control.addEventListener('change', refreshSetup));

  // Forget a start that is still loading (the user left the Interview tab): it must not open a session later.
  function cancelStartup() {
    startToken++;
    starting = false;
  }

  function showSetup() {
    setSelfView(false); // the camera is off whenever you are on the setup screen
    $('setup').hidden = false;
    $('interview').hidden = true;
    $('finished').hidden = true;
    phase = 'setup';
    refreshAnswerPanel();
    refreshMicList();
    renderSetChoices();
    refreshSetup();
  }

  startBtn.addEventListener('click', async () => {
    if (starting || startBtn.disabled) return; // a second click while the first is still loading does nothing
    const token = ++startToken;
    starting = true;
    startBtn.disabled = true; // stays off until the first question begins
    const outOfDate = () => token !== startToken; // the user left the Interview tab meanwhile
    try {
      options = readOptions();
      saveSettings({
        mode: options.mode,
        practiceOrder: options.order,
        practiceLevel: options.level,
        practiceDifficulty: options.difficulty,
        practiceCount: options.count,
        practiceEasyTimer: options.easyTimer,
        practiceSelfMark: options.selfMark,
        showModelAnswer: options.showAnswer,
        coachSpeak: options.coachSpeak,
        practiceSets: selectedSetIds(),
        selfView: options.selfView,
      });

      if (options.mode === 'coach' && !getApiKey()) {
        $('setup-status').textContent = 'Coach mode needs an API key. Add one in Settings.';
        return;
      }

      const questions = buildQuestionList(loadQuestions(selectedSetIds()), options);
      if (!questions.length) {
        $('setup-status').textContent = 'No questions match these choices.';
        return;
      }

      // Pick the interviewer for this round (Automatic: the tough one for Hard, otherwise random)
      if (interviewers.length) {
        const entry = chooseInterviewer(options.difficulty);
        if (optInterviewer.value === 'auto') lastAutoFolder = entry ? entry.folder : '';
        await showInterviewer(entry);
        if (outOfDate()) return;
      }
      await pickVoice(); // choose the voice now, so the page can say which one it is
      if (outOfDate()) return;

      // Every wait is over and nobody left: only now does the session exist and the screen change
      session = createSession(questions);
      $('voice-note').textContent = describeVoice();
      sessionStartedAt = Date.now();
      answerVisible = options.showAnswer;
      recPanel.resetMode(); // recording is Off at the start of every session
      initMethod();
      $('setup').hidden = true;
      $('interview').hidden = false;
      window.scrollTo(0, 0); // the setup screen may have been scrolled: begin at the top of the interview
      showAnswerArea();
      if (options.selfView) setSelfView(true);
      askQuestion('opening');
    } finally {
      if (!outOfDate()) {
        starting = false;
        refreshSetup(); // the button is on again only if the choices allow a session
      }
    }
  });

  /* ---------- Speaking ---------- */

  // Wait a moment, e.g. to let you settle before the first question.
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const START_DELAY_MS = 2000;

  // The interviewer says something; the avatar's mouth moves while it plays.
  async function say(text) {
    if (!text) return;
    const id = ++sayId;
    avatar.setState('talking');
    await speak(text, { rate: DIFFICULTY[options.difficulty].rate });
    if (id === sayId && avatar.getState() === 'talking') avatar.setState('idle');
  }

  // Stop any speech right now.
  function hush() {
    sayId++;
    stopSpeaking();
    if (avatar.getState() === 'talking') avatar.setState('idle');
  }

  /* ---------- Model answer panel ---------- */
  // Shows the reference answer from the user's own notes. Text only (textContent), never spoken,
  // and nothing is sent anywhere. It is only on screen while a question is open or being marked.
  // Tell the recorder which question is on screen, and whether recording is allowed right now
  // (only while the question is being answered). Anything else stops a recording in progress.
  function syncRecorder() {
    const q = session && session.current();
    const open = ['asking', 'ready', 'answering', 'finishing', 'review'].includes(phase);
    // Recording may be started while the question is ready, being answered, or in review (Record again)
    recPanel.setContext(q && open
      ? { token: questionToken, question: q.question, set: q.set, topic: q.topic, phase, canRecord: ['ready', 'answering', 'review'].includes(phase) }
      : null);
  }

  function refreshAnswerPanel() {
    syncRecorder();
    const q = session && session.current();
    const live = ['asking', 'ready', 'answering', 'finishing'].includes(phase); // the response box is on screen
    const reviewing = phase === 'review';
    // Roomy screens (the two-column layout) show the reference above the response, both at once. Narrow screens
    // use tabs, to save height. What counts as shown is what is really on screen, so it depends on which.
    const tabs = Boolean(q) && answerVisible && live && !roomy();
    const show = Boolean(q) && answerVisible && live && (roomy() || replyTab === 'reference');
    $('answer-area').hidden = reviewing;
    $('review').hidden = !reviewing;
    $('reply-tabs').hidden = !tabs;
    $('response-title').hidden = !(Boolean(q) && answerVisible && live && roomy()); // the stacked panels are each labelled
    $('model-answer').hidden = !show;
    $('response-panel').hidden = tabs && replyTab === 'reference';
    $('model-answer').setAttribute('role', tabs ? 'tabpanel' : 'region');
    $('model-answer').setAttribute('aria-labelledby', 'tab-reference');
    $('response-panel').setAttribute('role', tabs ? 'tabpanel' : 'group');
    $('response-panel').setAttribute('aria-labelledby', 'tab-response');
    for (const id of ['reference', 'response']) {
      const tab = $(`tab-${id}`);
      tab.setAttribute('aria-selected', String(replyTab === id));
      tab.tabIndex = replyTab === id ? 0 : -1;
    }
    if (show) {
      $('model-answer-text').textContent = q.answer?.trim() || 'No model answer saved for this question.';
      // "Viewed" means actually on screen: the Reference panel open, while the answer is still being given.
      // Having the reference available but never opened does not count; once seen, it stays recorded.
      // (The reference in the review, after the answer was handed in, never counts: see showReview.)
      if (phase === 'asking' || phase === 'ready' || phase === 'answering') answerShownNow = true;
    }
    const toggle = $('answer-toggle');
    toggle.textContent = answerVisible ? 'Hide answer' : 'Show answer';
    toggle.setAttribute('aria-pressed', String(answerVisible));
    toggle.hidden = reviewing;
    toggle.disabled = !(phase === 'asking' || phase === 'ready' || phase === 'answering');
  }

  $('answer-toggle').addEventListener('click', () => {
    if (phase !== 'asking' && phase !== 'ready' && phase !== 'answering') return;
    answerVisible = !answerVisible; // this session only: the saved setting is not touched
    if (answerVisible) replyTab = 'reference'; // switching it on shows it
    refreshAnswerPanel();
  });

  // The two tabs. Choosing one only changes what is shown: the draft stays in its box and focus is not moved
  // into it. Arrow keys, Home and End move between the tabs, as in any tab list.
  function chooseReplyTab(id, { focus = false } = {}) {
    replyTab = id;
    refreshAnswerPanel();
    if (focus) $(`tab-${id}`).focus();
  }
  $('tab-reference').addEventListener('click', () => chooseReplyTab('reference'));
  $('tab-response').addEventListener('click', () => chooseReplyTab('response'));
  $('reply-tabs').addEventListener('keydown', (event) => {
    const order = ['reference', 'response'];
    const at = order.indexOf(replyTab);
    const to = { ArrowRight: order[(at + 1) % 2], ArrowLeft: order[(at + 1) % 2], Home: 'reference', End: 'response' }[event.key];
    if (!to) return;
    event.preventDefault();
    chooseReplyTab(to, { focus: true });
  });

  // "Your response" shows how many words there are, so progress is visible while the reference is open
  function updateReplyCount() {
    const words = answerBox.value.trim() ? answerBox.value.trim().split(/\s+/).length : 0;
    $('reply-count').textContent = words ? ` · ${words} word${words === 1 ? '' : 's'}` : '';
  }
  answerBox.addEventListener('input', updateReplyCount);
  roomyQuery.addEventListener?.('change', refreshAnswerPanel); // the window was resized across the breakpoint

  /* ---------- Respond by: Speak or Type ---------- */
  // Speak is the default where the browser can recognise speech, otherwise Type. The response box is always
  // there: spoken words land in it, and typing in it always works. The choice is remembered.
  let method = 'type';
  function setMethod(next) {
    method = next === 'speak' && isRecognitionSupported() ? 'speak' : 'type';
    $('method-speak').checked = method === 'speak';
    $('method-type').checked = method === 'type';
  }
  function initMethod() {
    $('method-speak').disabled = !isRecognitionSupported();
    setMethod(loadSettings().answerMethod || 'speak');
  }
  document.querySelectorAll('input[name="answer-method"]').forEach((radio) => radio.addEventListener('change', () => {
    if (phase === 'finishing' || phase === 'review') return;
    setMethod(radio.value);
    saveSettings({ answerMethod: method });
    if (phase === 'answering') {
      if (method === 'speak') startListening(); else stopListening();
    }
    showSpeechState();
    setButtons();
  }));

  // The "Speech to text" line: its own status, separate from the "Recording" line in the recorder panel
  function showSpeechState() {
    if (listening) return;
    if (method === 'type') {
      status.textContent = isRecognitionSupported() ? 'Off. You are typing.' : 'Not supported in this browser, so you type your response.';
    } else if (phase === 'answering') {
      status.textContent = 'Not listening. Press Listen again to speak.';
    } else {
      status.textContent = 'Ready. It starts when you press Start answer.';
    }
  }

  /* ---------- Showing and hiding parts of the controls ---------- */
  function showAnswerArea() {
    $('answer-area').hidden = false;
    $('review').hidden = true;
    $('feedback').hidden = true;
    $('finished').hidden = true;
  }

  const HINTS = {
    asking: 'The interviewer is asking the question. Nothing is captured yet.',
    ready: 'Take a moment to think, or start typing. Press Start answer when you are ready.',
    answering: '',
    finishing: 'Handing in your response…',
    review: '',
  };

  function setButtons() {
    if (!options) return;
    const rules = DIFFICULTY[options.difficulty];
    const isLast = Boolean(session) && session.position() === session.total;
    const act = primaryAction({ phase, isLast, waitingForFeedback: feedbackBlocking });
    primaryBtn.textContent = act.label;
    primaryBtn.disabled = act.disabled || endRequested;
    primaryBtn.dataset.kind = act.kind;
    $('primary-hint').textContent = $('primary-hint').dataset.lead || HINTS[phase] || '';
    repeatBtn.hidden = !rules.allowRepeat;
    repeatBtn.disabled = !canRepeat(phase, rules.allowRepeat);
    skipBtn.hidden = !rules.allowSkip;
    skipBtn.disabled = !canSkip(phase, rules.allowSkip);
    micBtn.hidden = !(phase === 'answering' && method === 'speak' && isRecognitionSupported());
    micBtn.textContent = listening ? '⏹ Stop listening' : '🎤 Listen again';
    answerBox.readOnly = phase === 'finishing';
    document.querySelectorAll('input[name="answer-method"]').forEach((radio) => {
      radio.disabled = phase === 'finishing' || phase === 'review' || (radio.value === 'speak' && !isRecognitionSupported());
    });
    // A new question is ready: keyboard users land on Start answer (only if focus was on the buttons or nowhere)
    if (phase === 'ready' && (document.activeElement === document.body || document.activeElement === primaryBtn)) {
      primaryBtn.focus({ preventScroll: true });
    }
  }

  /* ---------- The clocks ---------- */
  // Four different times are kept apart:
  //   preparation  from the question being spoken until Start answer ("Preparing")
  //   answering    from Start answer until Finish answer ("Answering")
  //   hard limit   the interview countdown for this difficulty, from the question being spoken (never paused or reset)
  //   target       the optional recording cue, shown by the recorder panel (it never stops anything)
  const seconds = (from, to = Date.now()) => (from ? Math.max(0, Math.round((to - from) / 1000)) : 0);
  function updateClocks() {
    const el = $('phase-clock');
    if (phase === 'ready') { el.hidden = false; el.textContent = `Preparing ${formatTime(seconds(askedAt))}`; }
    else if (phase === 'answering') { el.hidden = false; el.textContent = `Answering ${formatTime(seconds(answerStartedAt))}`; }
    else el.hidden = true;
  }
  function startClock() { stopClock(); updateClocks(); clockTimer = setInterval(updateClocks, 500); }
  function stopClock() { clearInterval(clockTimer); clockTimer = null; $('phase-clock').hidden = true; }

  /* ---------- The interview loop ---------- */
  // Each question: asking -> ready -> answering -> finishing -> review -> (Next) asking...
  // Every step that can arrive twice (a double click, a timeout and a click together) is checked against the
  // phase first, so it happens once.

  // kind: 'opening', 'next', or 'none' (no lead-in phrase)
  async function askQuestion(kind) {
    const run = ++runId;
    const q = session.current();
    phase = 'asking';
    questionToken++;
    showAnswerArea();
    answerShownNow = false;
    submittedThisQuestion = false;
    feedbackBlocking = false;
    askedAt = 0;
    answerStartedAt = 0;
    stopClock();
    refreshAnswerPanel(); // (the open tab is kept from question to question on narrow screens: a typist stays on the response)
    $('progress').textContent = `Question ${session.position()} of ${session.total}`;
    answerBox.value = '';
    updateReplyCount();
    voice = { chunks: [], live: '', ms: 0, since: 0 }; // what the speech recogniser heard for this answer
    status.textContent = '';
    showSpeechState();
    timerEl.hidden = true;
    $('primary-hint').dataset.lead = '';
    setButtons();

    // A short breather after pressing Start, before the interviewer speaks
    if (kind === 'opening') {
      $('primary-hint').dataset.lead = 'Get ready…';
      setButtons();
      await pause(START_DELAY_MS);
      if (run !== runId) return; // you ended the session during the pause
      $('primary-hint').dataset.lead = '';
      setButtons();
    }

    const lead = kind === 'none' ? '' : pickPhrase(options.difficulty, kind);
    $('interviewer-line').textContent = lead;
    $('question-text').textContent = q.question;
    await say(`${lead} ${q.question}`);
    if (run !== runId || phase !== 'asking') return; // you skipped or ended while the question was being read

    phase = nextPhase(phase, 'spoken'); // ready
    askedAt = Date.now(); // the hard countdown and the preparation time both start here
    refreshAnswerPanel();
    startTimer(run);
    startClock();
    showSpeechState();
    setButtons();
  }

  function startTimer(run) {
    const secs = timerSecondsFor(options.difficulty, options.easyTimer);
    if (!secs) return;
    timerEl.hidden = false;
    timer = createTimer(secs, {
      onTick: (left) => {
        timerEl.textContent = `⏱ ${formatTime(left)}`;
        timerEl.classList.toggle('low', left <= 15);
      },
      onDone: () => { if (run === runId && (phase === 'ready' || phase === 'answering')) finishAnswer('timeup'); },
    });
    timer.start();
  }

  function stopTimer() {
    timer?.stop();
    timer = null;
    timerEl.hidden = true;
    stopClock();
  }

  // Start answer: from now the chosen response method and the chosen recording are on. The hard countdown is
  // not touched. Neither the microphone permission nor the speech recogniser is waited for: the answer
  // (and typing) goes ahead, and each of the two says for itself how it is doing.
  function startAnswer({ withoutRecording = false } = {}) {
    if (phase !== 'ready' || endRequested || finalising) return;
    hush(); // the interviewer stops speaking first: the microphone must never hear them
    const began = recPanel.beginForAnswer({ withoutRecording });
    if (began.state === 'blocked') { setButtons(); return; } // an earlier recording is waiting: the panel explains
    phase = nextPhase(phase, 'start'); // answering
    answerStartedAt = Date.now();
    refreshAnswerPanel();
    updateClocks();
    if (method === 'speak') startListening();
    else { showSpeechState(); answerBox.focus({ preventScroll: true }); }
    setButtons();
  }
  recPanel.onContinueWithout(() => startAnswer({ withoutRecording: true }));

  // The answer is over. reason: 'finish' (the button), 'skip' or 'timeup' (the hard limit).
  async function finishAnswer(reason) {
    const event = reason === 'finish' ? 'finish' : reason === 'skip' ? 'skip' : 'timeup';
    if (!phaseAllows(phase, event) || endRequested) return; // already finishing, or not at a point where it can
    const run = ++runId;
    const q = session.current();
    const wasAnswering = phase === 'answering';
    phase = nextPhase(phase, event); // finishing: blocks double clicks while we wait for the last words and the recording
    $('primary-hint').dataset.lead = '';
    setButtons();
    refreshAnswerPanel();

    // While the answer is being handed in, ending the session waits for it (see endSession), so it
    // becomes a result exactly once, with the outcome it was given, however the session ends.
    let handedIn;
    const submission = { promise: new Promise((resolve) => { handedIn = resolve; }) };
    finalising = submission;
    let record;
    let rec = { mode: 'off', recorded: false, failure: '' };
    try {
      stopTimer();
      hush();
      await stopListening(); // waits (briefly) for the last words, so nothing is cut off
      rec = await recPanel.finishForAnswer(); // waits (a bounded time) for the recording to be complete
      if (run !== runId) return;

      const now = Date.now();
      const totalSec = askedAt ? seconds(askedAt, now) : 0;
      record = {
        question: q.question,
        topic: q.topic,
        level: q.level,
        set: q.set,
        answer: answerBox.value.trim(), // the text as it is now: a snapshot, tied to this question
        skipped: reason === 'skip',
        timedOut: reason === 'timeup',
        mark: null,
        seconds: totalSec,
        prepSeconds: answerStartedAt ? seconds(askedAt, answerStartedAt) : totalSec,
        answerSeconds: answerStartedAt ? seconds(answerStartedAt, now) : 0,
        answerShown: answerShownNow, // the reference was on screen while this question was open
      };
      // Delivery numbers come from the text and the timings only. No audio is kept.
      record.delivery = reason === 'skip' ? null : analyzeAnswer({
        answer: record.answer,
        spokenText: voice.chunks.join(' '),
        spokenSeconds: voice.ms / 1000,
        seconds: record.seconds,
        timerSeconds: timerSecondsFor(options.difficulty, options.easyTimer),
      });
      session.record(record);
      submittedThisQuestion = true;
    } finally {
      if (finalising === submission) finalising = null;
      handedIn();
    }
    // The session was ended while this was being handed in: the answer is kept as it is (no review, no
    // Coach request, no next question), and ending carries on.
    if (endRequested) return;

    // Skip hands in nothing to review: it moves straight on
    if (reason === 'skip') { goNext('next'); return; }
    showReview(record, q, rec, reason);
  }

  /* ---------- Review ---------- */
  // After the answer is handed in: what was handed in, the recording, the reference, marking or feedback.
  // Nothing here moves on by itself: Next question (or Finish session) is the only way forward.
  let reviewCtx = null; // { record, q } for the question in review
  let feedbackBlocking = false; // Coach feedback is loading, or failed and needs a choice: Next waits

  const OUTCOME_TITLES = {
    answered: 'Response handed in',
    'no-response': 'No response',
    'timed-out': 'Time ran out: your response was handed in',
    'timed-out-no-response': 'Time ran out: no response',
  };

  function describeRecording(rec) {
    if (rec.recorded) return `${rec.mode === 'video' ? 'Video' : 'Audio'} captured. It is waiting below, not saved yet.`;
    if (rec.mode === 'off') return 'Off for this answer.';
    return `Nothing was recorded. ${rec.failure || ''} Your response is not affected.`.trim();
  }

  function renderReviewResponse() {
    const { record } = reviewCtx;
    const o = outcomeOf(record);
    $('review-title').textContent = OUTCOME_TITLES[o.key] || 'Response handed in';
    $('review-response').textContent = record.answer || '(no text: a recording alone has no words to show)';
    $('review-response').classList.toggle('empty', !record.answer);
    $('review-note').textContent = record.timedOut
      ? 'The time limit was reached, so what you had was handed in. Nothing moves on until you press the button below.'
      : '';
  }

  function showReview(record, q, rec, reason) {
    reviewCtx = { record, q };
    phase = nextPhase(phase, 'handed'); // review
    renderReviewResponse();
    $('review-recording').textContent = describeRecording(rec);
    // The reference shown here is for comparing afterwards. It does not count as "assisted": answerShownNow
    // is only ever set while the answer is still being given.
    $('reference').textContent = q.answer?.trim() || 'No reference answer is saved for this question.';
    const canMark = options.mode === 'practice' && options.selfMark && Boolean(q.answer?.trim());
    $('mark-row').hidden = !canMark;
    document.querySelectorAll('#review [data-mark]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('feedback').hidden = true;
    feedbackBlocking = false;
    refreshAnswerPanel();
    setButtons();
    $('review-title').focus(); // the answer view has gone, so focus goes to the review
    if (reason === 'timeup') say(pickPhrase(options.difficulty, 'timeUp')).catch(() => {});
    if (options.mode === 'coach') {
      if (record.answer) coachMark(record, q);
      else showEmptyFeedback();
    }
  }

  // Self-marking: choosing a mark records it and nothing else. Moving on is the Next button.
  document.querySelectorAll('#review [data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (phase !== 'review' || !reviewCtx) return;
      reviewCtx.record.mark = btn.dataset.mark;
      document.querySelectorAll('#review [data-mark]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  /* ---------- Coach mode: AI marking (in the review) ---------- */
  let marking = null; // { record, q } for the answer being marked, so "Try again" can repeat it

  // Show one of the views in the feedback panel: loading, error, empty (no text) or result.
  function setFeedbackView(view) {
    $('feedback').hidden = false;
    $('fb-loading').hidden = view !== 'loading';
    $('fb-error').hidden = view !== 'error';
    $('fb-empty').hidden = view !== 'empty';
    $('fb-result').hidden = view !== 'result';
    if (view !== 'empty') $('fb-edit').hidden = true;
  }

  const bulletList = (items) => items.length ? items : ['(nothing noted)'];
  function fillList(id, items) {
    $(id).replaceChildren(...bulletList(items).map((text) => {
      const li = document.createElement('li');
      li.textContent = text; // textContent: Claude's text can't inject HTML
      return li;
    }));
  }

  function showFeedback(record) {
    $('fb-score').textContent = record.score;
    $('fb-note').textContent = record.noReference ? 'No reference answer is saved for this question, so it was judged on general merit.' : '';
    fillList('fb-covered', record.covered);
    fillList('fb-missed', record.missed);
    $('fb-tip').textContent = record.tip;
    setFeedbackView('result');
  }

  // No text: nothing is sent and nothing is scored. A recording is never sent to the AI.
  function showEmptyFeedback() {
    feedbackBlocking = false;
    setFeedbackView('empty');
    setButtons();
  }

  async function coachMark(record, q) {
    const run = runId;
    marking = { record, q };
    feedbackBlocking = true;
    setFeedbackView('loading');
    setButtons();

    let claude = null;
    try {
      claude = await import('./claude.js'); // loaded only in Coach mode
      const result = await claude.evaluateAnswer({
        question: q.question,
        reference: q.answer,
        answer: record.answer,
        difficulty: options.difficulty,
      });
      if (run !== runId || phase !== 'review') return; // the session ended, or the question moved on, while it was marking
      Object.assign(record, result, { noReference: !q.answer?.trim() });
      feedbackBlocking = false;
      showFeedback(record);
      setButtons();
      if (options.coachSpeak && record.spoken) say(record.spoken).catch(() => {});
    } catch (err) {
      if (run !== runId || phase !== 'review') return;
      $('fb-error-text').textContent = claude && err instanceof claude.ClaudeError
        ? err.message
        : 'Something went wrong while marking. You can try again or skip the feedback.';
      setFeedbackView('error'); // Next waits for a choice: Try again or Skip feedback
      setButtons();
    }
  }

  // Try again re-marks the same result: it never adds another one
  $('fb-retry').addEventListener('click', () => { if (phase === 'review' && marking && !$('fb-error').hidden) coachMark(marking.record, marking.q); });
  $('fb-skip').addEventListener('click', () => {
    if (phase !== 'review' || !marking) return;
    marking.record.feedbackSkipped = true; // stays in the list, without a score
    hush();
    feedbackBlocking = false;
    $('feedback').hidden = true;
    setButtons();
    $('primary-btn').focus({ preventScroll: true });
  });
  $('fb-continue').addEventListener('click', () => {
    if (phase !== 'review') return;
    $('feedback').hidden = true;
    $('primary-btn').focus({ preventScroll: true });
  });
  $('fb-type').addEventListener('click', () => {
    $('fb-edit').hidden = false;
    $('fb-text').value = reviewCtx ? reviewCtx.record.answer : '';
    $('fb-text').focus();
  });
  $('fb-submit').addEventListener('click', () => {
    if (phase !== 'review' || !reviewCtx || feedbackBlocking) return;
    const text = $('fb-text').value.trim();
    if (!text) { $('fb-text').focus(); return; }
    const { record, q } = reviewCtx;
    record.answer = text; // the same result, now with words: it is not a new one
    record.delivery = analyzeAnswer({
      answer: text, spokenText: voice.chunks.join(' '), spokenSeconds: voice.ms / 1000,
      seconds: record.seconds, timerSeconds: timerSecondsFor(options.difficulty, options.easyTimer),
    });
    renderReviewResponse();
    coachMark(record, q);
  });

  // Next question (or Finish session after the last). Only from review, and not while Coach is still deciding.
  function nextQuestion() {
    if (phase !== 'review' || feedbackBlocking || endRequested) return;
    hush();
    goNext('next');
  }

  // Ask the next question, or finish if that was the last one.
  function goNext(kind) {
    if (session.advance()) askQuestion(kind);
    else finishSession(true);
  }

  primaryBtn.addEventListener('click', () => {
    if (phase === 'ready') startAnswer();
    else if (phase === 'answering') finishAnswer('finish');
    else if (phase === 'review') nextQuestion();
  });
  skipBtn.addEventListener('click', () => finishAnswer('skip'));
  $('end-btn').addEventListener('click', () => finishSession(false));

  // Repeat: only before the answer starts. Nothing is being captured then, so the interviewer's voice can never
  // end up in the response, and no clock is restarted (the hard countdown and the preparation time carry on).
  repeatBtn.addEventListener('click', async () => {
    if (!canRepeat(phase, DIFFICULTY[options.difficulty].allowRepeat)) return;
    const run = runId;
    $('interviewer-line').textContent = pickPhrase(options.difficulty, 'repeat');
    await say(`${$('interviewer-line').textContent} ${session.current().question}`);
  });

  /* ---------- End of session ---------- */

  // Build the session record and save it to History (if at least one question was answered).
  function recordSession(completed) {
    const record = buildSessionRecord({
      options,
      results: session.results,
      total: session.total,
      startedAt: sessionStartedAt,
      completed,
    });
    if (!record.results.length) return { record, note: 'Nothing was saved to History, because no question was answered.' };
    const saved = saveSession(record);
    return { record, note: saved ? 'Saved to History.' : 'Could not save to History. Your browser may be blocking storage, or it may be full.' };
  }

  // End the session. Every way of ending (End session, Coach's End, leaving the tab, the last
  // question) comes through here, and it only ever runs once.
  function finishSession(completed) {
    if (ending) return ending; // a second click, or a second reason to end: the first one is already doing it
    if (phase === 'finished' || phase === 'setup') return Promise.resolve();
    endRequested = true;
    ending = endSession(completed).finally(() => {
      ending = null;
      endRequested = false;
    });
    return ending;
  }

  async function endSession(completed) {
    // An answer already being handed in (Next, Skip or time up) is finished first, once, with its
    // own outcome. It does not go on to mark, ask Coach or ask the next question: see finishAnswer.
    if (finalising) await finalising.promise;

    const before = phase; // where the interview was when the ending began
    phase = 'ending'; // blocks Start/Finish, Next, Skip, Repeat and the microphone while the last words arrive
    setButtons();
    runId++; // anything still waiting (the question being read, Coach marking) now gives up
    stopTimer();
    hush();
    await stopListening(); // the last spoken words land in the answer box before it is read
    if (before === 'ready' || before === 'answering') await recPanel.finishForAnswer(); // a recording in progress is stopped and kept (bounded wait)

    // An answer that was started but not handed in is kept, marked incomplete. It is never scored.
    // A recording with no words is not an answer, so it does not become a result.
    const words = completed ? null : unfinishedAnswer({ phase: before, text: answerBox.value, submitted: submittedThisQuestion });
    if (words) {
      const q = session.current();
      session.record({
        question: q.question, topic: q.topic, level: q.level, set: q.set,
        answer: words,
        incomplete: true,
        skipped: false, timedOut: false, mark: null,
        seconds: before === 'answering' || before === 'ready' ? seconds(askedAt) : 0,
        prepSeconds: before === 'ready' ? seconds(askedAt) : answerStartedAt ? seconds(askedAt, answerStartedAt) : 0,
        answerSeconds: before === 'answering' ? seconds(answerStartedAt) : 0,
        answerShown: answerShownNow,
      });
    }

    setSelfView(false); // session over: switch the camera off
    phase = 'finished';
    refreshAnswerPanel(); // also tells the recorder: a recording in progress stops and stays pending, labelled with its question

    $('progress').textContent = '';
    $('question-text').textContent = '';
    $('interviewer-line').textContent = completed ? pickPhrase(options.difficulty, 'closing') : 'Session ended.';

    const { record, note } = recordSession(completed);
    renderSummary($('finished-body'), record, note);
    // The live interview gives way to a full-width summary. Focus goes to its heading, so a keyboard or
    // screen-reader user lands on it (ending is something the user did, not a background event).
    $('interview').hidden = true;
    $('finished-closing').textContent = $('interviewer-line').textContent;
    $('finished').hidden = false;
    const heading = $('finished-body').querySelector('h2');
    if (heading) { heading.tabIndex = -1; heading.focus(); }

    if (completed) say($('interviewer-line').textContent).catch(() => {}); // the summary does not wait for the closing line
  }

  $('again-btn').addEventListener('click', () => { hush(); showSetup(); });

  /* ---------- Voice answers ---------- */
  const recognizer = createRecognizer({
    onText: (finalText, interim) => {
      voice.live = joinText(finalText, interim);
      if (typedWhileListening) return; // you typed: the box is yours now, so a late transcript never overwrites it
      // The live transcript goes straight into the box, so you can correct it
      answerBox.value = joinText(textBefore, finalText, interim);
      updateReplyCount();
    },
    onEnd: () => {
      if (voice.since) { // keep what was heard, and how long the microphone was on
        voice.ms += Date.now() - voice.since;
        voice.chunks.push(voice.live);
      }
      voice.since = 0;
      voice.live = '';
      listening = false;
      if (avatar.getState() === 'listening') avatar.setState('idle');
      if (phase === 'answering' && !typedWhileListening && !speechProblem) { status.textContent = 'Stopped listening. Press Listen again to speak, or type.'; }
      setButtons();
    },
    onError: (message) => { speechProblem = true; status.textContent = `${message} You can type your response instead.`; },
    onNote: (message) => { status.textContent = message; },
  });

  function startListening() {
    if (phase !== 'answering') return;
    hush(); // the mic should not hear the interviewer
    textBefore = answerBox.value;
    typedWhileListening = false;
    speechProblem = false;
    voice.since = Date.now();
    voice.live = '';
    listening = true;
    status.textContent = 'Listening… speak your response.';
    avatar.setState('listening');
    // With the on-device recogniser, tell it which words to expect (from this question and its answer)
    const q = session.current();
    const phrases = onDeviceReady ? keyTerms(joinText(q.topic, q.question, q.answer)) : [];
    recognizer.start({ onDevice: onDeviceReady, phrases, deviceId: optMic.value });
    setButtons();
  }

  // Stop listening. The promise resolves once the last words have arrived.
  function stopListening() {
    return listening ? recognizer.stop() : Promise.resolve();
  }

  /* ---------- Microphone choice ---------- */
  // List the computer's microphones. The names only appear once the browser has been allowed to use one.
  async function refreshMicList() {
    if (!navigator.mediaDevices?.enumerateDevices) { $('mic-row').hidden = true; return; }
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    const systemDefault = devices.find((d) => d.deviceId === 'default');
    const real = devices.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
    optMic.replaceChildren(
      new Option(systemDefault?.label ? `Browser default (${systemDefault.label.replace(/^Default - /, '')})` : 'Browser default', ''),
      ...real.map((d, i) => new Option(d.label || `Microphone ${i + 1}`, d.deviceId)),
    );
    const saved = loadSettings().micDeviceId;
    optMic.value = real.some((d) => d.deviceId === saved) ? saved : '';
  }
  optMic.addEventListener('change', () => saveSettings({ micDeviceId: optMic.value }));
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshMicList); // a headset was connected or removed

  /* ---------- On-device recognition (optional, experimental) ---------- */
  async function checkOnDevice() {
    const note = $('ondevice-status');
    if (!optOnDevice.checked) {
      onDeviceReady = false;
      note.textContent = '';
      return;
    }
    note.textContent = 'Checking on-device recognition… (a one-time download may take a minute)';
    const result = await prepareOnDevice(getRecognitionLang());
    onDeviceReady = result.ok;
    note.textContent = result.message;
    if (!result.ok) {
      optOnDevice.checked = false; // keep it off, so the standard recogniser is used
      saveSettings({ onDeviceSpeech: false });
    }
  }
  optOnDevice.checked = settings.onDeviceSpeech;
  $('ondevice-row').hidden = !isRecognitionSupported();
  optOnDevice.addEventListener('change', () => {
    saveSettings({ onDeviceSpeech: optOnDevice.checked });
    checkOnDevice();
  });
  if (optOnDevice.checked) checkOnDevice();

  if (recognizer) {
    micBtn.addEventListener('click', () => (listening ? stopListening() : startListening()));
    // Typing while listening stops the mic, so the transcript can't overwrite your edits
    answerBox.addEventListener('input', () => {
      if (!listening) return;
      typedWhileListening = true; // from here on the transcript cannot touch what is in the box
      status.textContent = 'You typed, so listening stopped. Press Listen again to speak.';
      stopListening();
    });
  }

  initMethod();
  showSetup();

  return {
    refreshSetup,
    // Called BEFORE switching tabs. Returns true if it is fine to leave. During a session the user is asked:
    // OK ends it and leaves, Cancel stays and changes nothing (the answer, the timer and any recording go on).
    async requestLeave() {
      if (ending) { await ending; return true; } // already ending (End was pressed): just wait for it
      if (starting) { cancelStartup(); return true; } // nothing answered yet: quietly cancel the start
      if (!needsLeaveConfirmation(phase)) return true; // setup screen, or the summary: nothing to lose
      const leave = window.confirm(
        'Leave the interview?\n\n'
        + 'OK: end this session and leave. Your answers so far are saved to History, and an answer you have started is kept as incomplete.\n'
        + 'Cancel: stay and carry on with the interview.',
      );
      if (!leave) return false;
      await finishSession(false);
      return true;
    },
    // Called when the Interview tab is left (after requestLeave): any session has ended; go back to setup.
    async leave() {
      cancelStartup();
      if (needsLeaveConfirmation(phase)) await finishSession(false); // safety net: should already have ended
      showSetup();
    },
  };
}
