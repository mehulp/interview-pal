// Practice screen: setup, then the interview loop (no AI, nothing leaves the browser).
//
// Flow for each question:  interviewer speaks -> timer starts -> you answer (voice or typing)
//   -> Next (or time runs out) -> optional self-marking -> next question.
import {
  speak, stopSpeaking, createRecognizer, isRecognitionSupported,
  LANGUAGES, setVoiceLang, setRecognitionLang,
} from './speech.js';
import { pickPhrase } from './phrases.js';
import {
  DIFFICULTY, timerSecondsFor, describeDifficulty, usableQuestions, filterByLevel,
  buildQuestionList, createSession, createTimer, formatTime,
} from './session.js';
import { loadSets, loadQuestions, loadSettings, saveSettings, getApiKey } from './storage.js';

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
  let listening = false;
  let textBefore = '';

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
  setupPicker($('recognition-lang'), 'recognitionLang', setRecognitionLang);

  /* ---------- Setup screen ---------- */
  optOrder.value = settings.practiceOrder;
  optLevel.value = settings.practiceLevel;
  optDifficulty.value = settings.practiceDifficulty;
  optCount.value = settings.practiceCount;
  optEasyTimer.checked = settings.practiceEasyTimer;
  optSelfMark.checked = settings.practiceSelfMark;
  optCoachSpeak.checked = settings.coachSpeak;

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
      coachSpeak: optCoachSpeak.checked,
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
    const all = usableQuestions(loadQuestions(setIds));
    const matching = filterByLevel(all, o.level);

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
    $('setup').hidden = false;
    $('interview').hidden = true;
    phase = 'setup';
    renderSetChoices();
    refreshSetup();
  }

  startBtn.addEventListener('click', () => {
    options = readOptions();
    saveSettings({
      mode: options.mode,
      practiceOrder: options.order,
      practiceLevel: options.level,
      practiceDifficulty: options.difficulty,
      practiceCount: options.count,
      practiceEasyTimer: options.easyTimer,
      practiceSelfMark: options.selfMark,
      coachSpeak: options.coachSpeak,
      practiceSets: selectedSetIds(),
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
    $('setup').hidden = true;
    $('interview').hidden = false;
    showAnswerArea();
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
    showAnswerArea();
    $('progress').textContent = `Question ${session.position()} of ${session.total}`;
    answerBox.value = '';
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
    stopTimer();
    stopListening();
    hush();

    const record = {
      question: q.question,
      topic: q.topic,
      level: q.level,
      set: q.set,
      answer: answerBox.value.trim(),
      skipped: reason === 'skip',
      timedOut: reason === 'timeup',
      mark: null,
      seconds: phase === 'answering' ? Math.round((Date.now() - startedAt) / 1000) : 0,
    };
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
      $('answer-area').hidden = true;
      $('reveal').hidden = false;
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
  const MARK_TEXT = { got: 'Got it', partly: 'Partly', missed: 'Missed' };

  async function finishSession(completed) {
    runId++;
    stopTimer();
    stopListening();
    hush();
    phase = 'finished';

    const results = session.results;
    const skipped = results.filter((r) => r.skipped).length;
    const timedOut = results.filter((r) => r.timedOut).length;
    const scored = results.filter((r) => r.score != null);
    $('progress').textContent = '';
    $('question-text').textContent = '';
    $('interviewer-line').textContent = completed ? pickPhrase(options.difficulty, 'closing') : 'Session ended.';

    $('finished-summary').textContent =
      `${results.length} of ${session.total} question(s) asked. ${skipped} skipped, ${timedOut} ran out of time.` +
      (scored.length ? ` Average score: ${(scored.reduce((sum, r) => sum + r.score, 0) / scored.length).toFixed(1)} / 10.` : '');
    $('finished-list').replaceChildren(...results.map((r) => {
      const note = r.skipped ? 'skipped'
        : r.score != null ? `${r.score}/10${r.timedOut ? ', time up' : ''}`
        : r.mark ? MARK_TEXT[r.mark] : r.timedOut ? 'time up' : 'answered';
      const li = document.createElement('li');
      li.textContent = `${r.question} (${note})`; // textContent: notes can't inject HTML
      return li;
    }));
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
      answerBox.value = (textBefore + ' ' + finalText + interim).trim();
    },
    onEnd: () => {
      listening = false;
      micBtn.textContent = '🎤 Answer';
      if (avatar.getState() === 'listening') avatar.setState('idle');
    },
    onError: (message) => { status.textContent = message; },
  });

  function startListening() {
    if (phase !== 'answering') return;
    hush(); // the mic should not hear the interviewer
    textBefore = answerBox.value;
    listening = true;
    micBtn.textContent = '⏹ Stop';
    status.textContent = 'Listening… speak your answer.';
    avatar.setState('listening');
    recognizer.start();
  }

  function stopListening() {
    if (listening) recognizer?.stop();
  }

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
      runId++;
      stopTimer();
      stopListening();
      hush();
      showSetup();
    },
  };
}
