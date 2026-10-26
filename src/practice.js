// Practice screen: setup, then the interview loop (no AI, nothing leaves the browser).
//
// Flow for each question:  interviewer speaks -> timer starts -> you answer (voice or typing)
//   -> Next (or time runs out) -> optional self-marking -> next question.
import {
  speak, stopSpeaking, createRecognizer, isRecognitionSupported,
  LANGUAGES, setVoiceLang, setRecognitionLang, setVoiceProfile, pickVoice, describeVoice,
  joinText, prepareOnDevice, getRecognitionLang,
} from './speech.js';
import { keyTerms } from './vocabulary.js';
import { pickPhrase } from './phrases.js';
import {
  DIFFICULTY, timerSecondsFor, describeDifficulty, usableQuestions, filterByLevel,
  buildQuestionList, removeRepeats, createSession, createTimer, formatTime,
} from './session.js';
import { loadInterviewers, pickInterviewer } from './interviewers.js';
import { createSelfView } from './selfview.js';
import { loadSets, loadQuestions, loadSettings, saveSettings, getApiKey, saveSession } from './storage.js';
import { buildSessionRecord } from './history.js';
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
  const nextBtn = $('next-btn');
  const repeatBtn = $('repeat-btn');
  const skipBtn = $('skip-btn');
  const timerEl = $('timer');

  // What is happening right now
  let session = null;
  let options = null; // the choices made at setup
  let phase = 'setup'; // setup | asking | answering | marking | finished
  let runId = 0; // bumped whenever the flow moves on, so old waiting code stops itself
  let sayId = 0;
  let timer = null;
  let startedAt = 0;
  let voice = { chunks: [], live: '', ms: 0, since: 0 }; // speech heard during the current answer
  let sessionStartedAt = 0; // when the whole session began (for the summary)
  let listening = false;
  let onDeviceReady = false; // the on-device recogniser is switched on and works here
  let textBefore = '';
  let questionToken = 0; // a new number for every question asked, so a recording is never tied to the wrong one
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
      if (!result.ok) $('selfview-note').textContent = result.message;
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
    startBtn.disabled = matching.length === 0;
    $('setup-status').textContent = '';
  }
  [optOrder, optLevel, optDifficulty, optCount, optEasyTimer, optSelfMark, optCoachSpeak, ...modeRadios].forEach((control) =>
    control.addEventListener('change', refreshSetup));

  function showSetup() {
    setSelfView(false); // the camera is off whenever you are on the setup screen
    $('setup').hidden = false;
    $('interview').hidden = true;
    phase = 'setup';
    refreshAnswerPanel();
    refreshMicList();
    renderSetChoices();
    refreshSetup();
  }

  startBtn.addEventListener('click', async () => {
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
    session = createSession(questions);

    // Pick the interviewer for this round (Automatic: the tough one for Hard, otherwise random)
    if (interviewers.length) {
      startBtn.disabled = true; // no double clicks while the face loads
      const entry = chooseInterviewer(options.difficulty);
      if (optInterviewer.value === 'auto') lastAutoFolder = entry ? entry.folder : '';
      await showInterviewer(entry);
      startBtn.disabled = false;
    }
    await pickVoice(); // choose the voice now, so the page can say which one it is
    $('voice-note').textContent = describeVoice();
    sessionStartedAt = Date.now();
    answerVisible = options.showAnswer;
    $('setup').hidden = true;
    $('interview').hidden = false;
    showAnswerArea();
    if (options.selfView) setSelfView(true);
    askQuestion('opening');
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
    const open = ['asking', 'answering', 'finishing', 'marking', 'feedback'].includes(phase);
    recPanel.setContext(q && open
      ? { token: questionToken, question: q.question, set: q.set, topic: q.topic, canRecord: phase === 'answering' }
      : null);
  }

  function refreshAnswerPanel() {
    syncRecorder();
    const q = session && session.current();
    const open = phase === 'asking' || phase === 'answering' || phase === 'finishing' || phase === 'marking';
    const show = Boolean(q) && answerVisible && open;
    $('model-answer').hidden = !show;
    if (show) {
      $('model-answer-text').textContent = q.answer?.trim() || 'No model answer saved for this question.';
      // It counts as seen only while the answer is still being given (not during marking or feedback)
      if (phase === 'asking' || phase === 'answering') answerShownNow = true;
    }
    const toggle = $('answer-toggle');
    toggle.textContent = answerVisible ? 'Hide answer' : 'Show answer';
    toggle.setAttribute('aria-pressed', String(answerVisible));
    toggle.disabled = !(phase === 'asking' || phase === 'answering');
  }

  $('answer-toggle').addEventListener('click', () => {
    if (phase !== 'asking' && phase !== 'answering') return;
    answerVisible = !answerVisible; // this session only: the saved setting is not touched
    refreshAnswerPanel();
  });

  /* ---------- Showing and hiding parts of the controls ---------- */
  function showAnswerArea() {
    $('answer-area').hidden = false;
    $('reveal').hidden = true;
    $('feedback').hidden = true;
    $('finished').hidden = true;
  }

  function setButtons() {
    const rules = DIFFICULTY[options.difficulty];
    const answering = phase === 'answering';
    micBtn.disabled = !answering || !isRecognitionSupported();
    nextBtn.disabled = !answering;
    repeatBtn.hidden = !rules.allowRepeat;
    repeatBtn.disabled = !answering;
    skipBtn.hidden = !rules.allowSkip;
  }

  /* ---------- The interview loop ---------- */

  // kind: 'opening', 'next', or 'none' (no lead-in phrase)
  async function askQuestion(kind) {
    const run = ++runId;
    const q = session.current();
    phase = 'asking';
    questionToken++;
    showAnswerArea();
    answerShownNow = false;
    refreshAnswerPanel();
    $('progress').textContent = `Question ${session.position()} of ${session.total}`;
    answerBox.value = '';
    voice = { chunks: [], live: '', ms: 0, since: 0 }; // what the speech recogniser heard for this answer
    status.textContent = '';
    timerEl.hidden = true;
    setButtons();

    // A short breather after pressing Start, before the interviewer speaks
    if (kind === 'opening') {
      status.textContent = 'Get ready…';
      await pause(START_DELAY_MS);
      if (run !== runId) return; // you ended the session during the pause
      status.textContent = '';
    }

    const lead = kind === 'none' ? '' : pickPhrase(options.difficulty, kind);
    $('interviewer-line').textContent = lead;
    $('question-text').textContent = q.question;
    await say(`${lead} ${q.question}`);
    if (run !== runId) return; // you skipped or ended while the question was being read

    phase = 'answering';
    refreshAnswerPanel();
    startedAt = Date.now();
    startTimer(run);
    setButtons();
    status.textContent = isRecognitionSupported()
      ? 'Press the mic to answer by voice, or just type.'
      : 'Voice input is not supported in this browser. Please type your answer.';
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
      onDone: () => { if (run === runId && phase === 'answering') finishAnswer('timeup'); },
    });
    timer.start();
  }

  function stopTimer() {
    timer?.stop();
    timer = null;
    timerEl.hidden = true;
  }

  // The answer is over. reason: 'next', 'skip' or 'timeup'.
  async function finishAnswer(reason) {
    if (phase !== 'asking' && phase !== 'answering') return;
    const run = ++runId;
    const q = session.current();
    const wasAnswering = phase === 'answering';
    phase = 'finishing'; // blocks double clicks while we wait for the last spoken words
    setButtons();
    refreshAnswerPanel();
    stopTimer();
    hush();
    await stopListening(); // waits (briefly) for the last words, so nothing is cut off
    if (run !== runId) return; // you ended the session during the wait

    const record = {
      question: q.question,
      topic: q.topic,
      level: q.level,
      set: q.set,
      answer: answerBox.value.trim(),
      skipped: reason === 'skip',
      timedOut: reason === 'timeup',
      mark: null,
      seconds: wasAnswering ? Math.round((Date.now() - startedAt) / 1000) : 0,
      answerShown: answerShownNow, // the model answer was on screen while this question was open
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

    const wantsMark = options.selfMark && reason !== 'skip' && q.answer;
    if (reason === 'timeup') {
      const line = pickPhrase(options.difficulty, 'timeUp');
      $('interviewer-line').textContent = line;
      phase = 'asking'; // blocks the buttons while the interviewer speaks
      setButtons();
      await say(line);
      if (run !== runId) return;
    }

    if (options.mode === 'coach' && reason !== 'skip') {
      coachMark(record, q); // AI marking (see below)
      return;
    }
    if (wantsMark) {
      phase = 'marking';
      $('reference').textContent = q.answer;
      $('reveal-reference').hidden = answerVisible; // already on screen: skip the reveal, keep the mark buttons
      $('answer-area').hidden = true;
      $('reveal').hidden = false;
      refreshAnswerPanel();
      return; // waits for Got it / Partly / Missed
    }
    goNext(reason === 'timeup' ? 'none' : 'next');
  }

  /* ---------- Coach mode: AI marking ---------- */
  let marking = null; // { record, q } for the answer being marked, so "Try again" can repeat it

  // Show one of three views in the feedback panel: loading, error or result.
  function setFeedbackView(view) {
    $('fb-loading').hidden = view !== 'loading';
    $('fb-error').hidden = view !== 'error';
    $('fb-result').hidden = view !== 'result';
    $('fb-buttons').hidden = view !== 'result';
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
    $('fb-note').textContent = record.noAnswer
      ? 'No answer was given, so no AI marking was done.'
      : record.noReference ? 'No reference answer is saved for this question, so it was judged on general merit.' : '';
    fillList('fb-covered', record.covered);
    fillList('fb-missed', record.missed);
    $('fb-tip').textContent = record.tip;
    $('fb-next').textContent = session.position() === session.total ? 'Finish' : 'Next question';
    setFeedbackView('result');
  }

  async function coachMark(record, q) {
    const run = runId;
    marking = { record, q };
    phase = 'feedback';
    refreshAnswerPanel();
    $('answer-area').hidden = true;
    $('reveal').hidden = true;
    $('feedback').hidden = false;
    setFeedbackView('loading');

    // Nothing to mark: score 0 without calling the AI (saves cost)
    if (!record.answer) {
      Object.assign(record, { score: 0, covered: [], missed: [], tip: 'Try to give at least a short answer next time.', spoken: '', noAnswer: true });
      showFeedback(record);
      return;
    }

    const claude = await import('./claude.js'); // loaded only in Coach mode
    try {
      const result = await claude.evaluateAnswer({
        question: q.question,
        reference: q.answer,
        answer: record.answer,
        difficulty: options.difficulty,
      });
      if (run !== runId) return; // you ended the session while it was marking
      Object.assign(record, result, { noReference: !q.answer?.trim() });
      showFeedback(record);
      if (options.coachSpeak && record.spoken) say(record.spoken);
    } catch (err) {
      if (run !== runId) return;
      $('fb-error-text').textContent = err instanceof claude.ClaudeError
        ? err.message
        : 'Something went wrong while marking. You can try again or skip the feedback.';
      setFeedbackView('error');
    }
  }

  $('fb-retry').addEventListener('click', () => { if (phase === 'feedback') coachMark(marking.record, marking.q); });
  $('fb-skip').addEventListener('click', () => {
    if (phase !== 'feedback') return;
    marking.record.feedbackSkipped = true; // stays in the list, without a score
    hush();
    goNext('next');
  });
  $('fb-next').addEventListener('click', () => { if (phase === 'feedback') { hush(); goNext('next'); } });
  $('fb-end').addEventListener('click', () => finishSession(false));

  // Ask the next question, or finish if that was the last one.
  function goNext(kind) {
    if (session.advance()) askQuestion(kind);
    else finishSession(true);
  }

  // Self-marking buttons
  document.querySelectorAll('#reveal [data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (phase !== 'marking') return;
      session.results[session.results.length - 1].mark = btn.dataset.mark;
      goNext('next');
    });
  });

  nextBtn.addEventListener('click', () => finishAnswer('next'));
  skipBtn.addEventListener('click', () => finishAnswer('skip'));
  $('end-btn').addEventListener('click', () => finishSession(false));

  repeatBtn.addEventListener('click', async () => {
    if (phase !== 'answering') return;
    stopListening();
    const run = runId;
    $('interviewer-line').textContent = pickPhrase(options.difficulty, 'repeat');
    await say(`${$('interviewer-line').textContent} ${session.current().question}`);
    if (run === runId && phase === 'answering') status.textContent = 'Go ahead whenever you are ready.';
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

  async function finishSession(completed) {
    if (phase === 'finished') return; // already finished (for example a double click)
    runId++;
    stopTimer();
    stopListening();
    hush();
    setSelfView(false); // session over: switch the camera off
    phase = 'finished';
    refreshAnswerPanel();

    $('progress').textContent = '';
    $('question-text').textContent = '';
    $('interviewer-line').textContent = completed ? pickPhrase(options.difficulty, 'closing') : 'Session ended.';

    const { record, note } = recordSession(completed);
    renderSummary($('finished-body'), record, note);
    $('answer-area').hidden = true;
    $('reveal').hidden = true;
    $('feedback').hidden = true;
    $('finished').hidden = false;

    if (completed) await say($('interviewer-line').textContent);
  }

  $('again-btn').addEventListener('click', () => { hush(); showSetup(); });

  /* ---------- Voice answers ---------- */
  const recognizer = createRecognizer({
    onText: (finalText, interim) => {
      // The live transcript goes straight into the box, so you can correct it
      answerBox.value = joinText(textBefore, finalText, interim);
      voice.live = joinText(finalText, interim);
    },
    onEnd: () => {
      if (voice.since) { // keep what was heard, and how long the microphone was on
        voice.ms += Date.now() - voice.since;
        voice.chunks.push(voice.live);
      }
      voice.since = 0;
      voice.live = '';
      listening = false;
      micBtn.textContent = '🎤 Answer';
      if (avatar.getState() === 'listening') avatar.setState('idle');
    },
    onError: (message) => { status.textContent = message; },
    onNote: (message) => { status.textContent = message; },
  });

  function startListening() {
    if (phase !== 'answering') return;
    hush(); // the mic should not hear the interviewer
    textBefore = answerBox.value;
    voice.since = Date.now();
    voice.live = '';
    listening = true;
    micBtn.textContent = '⏹ Stop';
    status.textContent = 'Listening… speak your answer.';
    avatar.setState('listening');
    // With the on-device recogniser, tell it which words to expect (from this question and its answer)
    const q = session.current();
    const phrases = onDeviceReady ? keyTerms(joinText(q.topic, q.question, q.answer)) : [];
    recognizer.start({ onDevice: onDeviceReady, phrases, deviceId: optMic.value });
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
    answerBox.addEventListener('input', stopListening);
  }

  showSetup();

  return {
    refreshSetup,
    // Called when you switch tabs: end any session quietly and go back to setup.
    leave() {
      // Leaving in the middle of a session: keep what was answered so far in History
      if (session && phase !== 'setup' && phase !== 'finished') recordSession(false);
      runId++;
      stopTimer();
      stopListening();
      hush();
      showSetup();
    },
  };
}
