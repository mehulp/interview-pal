import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTY, timerSecondsFor, buildQuestionList, filterByLevel, usableQuestions,
  shuffle, createSession, formatTime, createTimer, removeRepeats, needsLeaveConfirmation, unfinishedAnswer, ACTIVE_PHASES,
  nextPhase, phaseAllows, primaryAction, canRepeat, canSkip,
} from '../src/session.js';

const pairs = [
  { question: 'a?', level: 'easy' }, { question: 'b?', level: 'hard' },
  { question: 'c?', level: '' }, { question: '   ' },
];

test('timer length depends on difficulty; Easy has one only if switched on', () => {
  assert.equal(timerSecondsFor('easy', false), 0);
  assert.equal(timerSecondsFor('easy', true), DIFFICULTY.easy.timerSeconds);
  assert.equal(timerSecondsFor('medium', false), 120);
  assert.equal(timerSecondsFor('hard', false), 90);
});

test('hard allows no repeat and no skip', () => {
  assert.equal(DIFFICULTY.hard.allowRepeat, false);
  assert.equal(DIFFICULTY.hard.allowSkip, false);
});

test('blank questions are dropped; level filter keeps only tagged ones', () => {
  assert.equal(usableQuestions(pairs).length, 3);
  assert.deepEqual(filterByLevel(pairs, 'hard').map((p) => p.question), ['b?']);
  assert.equal(filterByLevel(pairs, 'all').length, 4);
});

test('serial order keeps the order and respects the count', () => {
  const list = buildQuestionList(pairs, { order: 'serial', level: 'all', count: 2 });
  assert.deepEqual(list.map((p) => p.question), ['a?', 'b?']);
});

test('the count is at least 1 and at most what is available', () => {
  assert.equal(buildQuestionList(pairs, { order: 'serial', level: 'all', count: 99 }).length, 3);
  assert.equal(buildQuestionList(pairs, { order: 'serial', level: 'all', count: 0 }).length, 3); // 0 means "all"
  assert.equal(buildQuestionList(pairs, { order: 'serial', level: 'hard', count: 5 }).length, 1);
});

test('repeats across sets are dropped, ignoring case and extra spaces; the first position is kept', () => {
  const pool = [
    { question: 'Why?', answer: 'A', set: 'One' },
    { question: 'Other?', answer: 'B', set: 'One' },
    { question: '  why?  ', answer: 'C', set: 'Two' },
  ];
  const r = removeRepeats(pool);
  assert.deepEqual(r.map((p) => [p.question, p.set]), [['Why?', 'One'], ['Other?', 'One']]);
});

test('of several copies, the first one with a model answer is kept (in the first copy\'s place)', () => {
  const pool = [
    { question: 'Why?', answer: '', set: 'Demo' },
    { question: 'Other?', answer: 'x', set: 'Demo' },
    { question: 'why?', answer: '   ', set: 'Mine' },
    { question: 'WHY?', answer: 'my answer', set: 'Third' },
    { question: 'Why?', answer: 'later answer', set: 'Fourth' },
  ];
  const r = removeRepeats(pool);
  assert.deepEqual(r.map((p) => [p.question, p.answer, p.set]), [['WHY?', 'my answer', 'Third'], ['Other?', 'x', 'Demo']]);
});

test('with no model answer anywhere, the first copy is kept', () => {
  const r = removeRepeats([{ question: 'Q?', answer: '', set: 'A' }, { question: 'Q?', set: 'B' }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].set, 'A');
});

test('removeRepeats does not change its input', () => {
  const pool = [{ question: 'Q?', set: 'A' }, { question: 'q?', answer: 'x', set: 'B' }];
  removeRepeats(pool);
  assert.equal(pool.length, 2);
  assert.equal(pool[0].set, 'A');
});

test('a session built from several sets asks a shared question once', () => {
  const pool = [
    { question: 'Shared?', answer: 'a', set: 'One', level: '' },
    { question: 'Only one?', answer: 'b', set: 'One', level: '' },
    { question: 'shared?', answer: 'c', set: 'Two', level: '' },
  ];
  assert.equal(buildQuestionList(pool, { order: 'serial', level: 'all', count: 10 }).length, 2);
});

test('the level filter looks at every copy before repeats are dropped', () => {
  const pool = [
    { question: 'Q?', answer: 'a', set: 'One', level: '' },
    { question: 'Q?', answer: 'b', set: 'Two', level: 'hard' },
  ];
  const r = buildQuestionList(pool, { order: 'serial', level: 'hard', count: 5 });
  assert.deepEqual(r.map((p) => p.set), ['Two']);
});

test('shuffle keeps every item and does not change the original', () => {
  const original = [1, 2, 3, 4, 5, 6];
  const mixed = shuffle(original);
  assert.deepEqual([...mixed].sort(), original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6]);
});

test('a session moves through its questions and collects results', () => {
  const s = createSession([{ question: 'a?' }, { question: 'b?' }]);
  assert.equal(s.total, 2);
  assert.equal(s.position(), 1);
  s.record({ question: 'a?' });
  assert.equal(s.advance(), true);
  assert.equal(s.current().question, 'b?');
  assert.equal(s.advance(), false);
  assert.equal(s.results.length, 1);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(120), '2:00');
});

test('the timer counts down and finishes', async () => {
  let last = null;
  await new Promise((resolve) => {
    createTimer(1, { onTick: (left) => { last = left; }, onDone: resolve }).start();
  });
  assert.equal(last, 0);
});

/* ---------- Leaving and unfinished answers (UX redesign, Step 1) ---------- */

test('leaving asks first while a session is under way, and not otherwise', () => {
  for (const phase of ['asking', 'ready', 'answering', 'finishing', 'review']) assert.equal(needsLeaveConfirmation(phase), true, phase);
  for (const phase of ['setup', 'finished', 'ending', 'marking', 'feedback', 'unknown', undefined]) assert.equal(needsLeaveConfirmation(phase), false, String(phase));
  assert.equal(ACTIVE_PHASES.length, 5);
});

test('an answer that was started but not handed in is an unfinished answer', () => {
  assert.equal(unfinishedAnswer({ phase: 'answering', text: '  I would delegate.  ' }), 'I would delegate.');
  assert.equal(unfinishedAnswer({ phase: 'ready', text: 'typed before starting' }), 'typed before starting');
  assert.equal(unfinishedAnswer({ phase: 'asking', text: 'typed while the question was read' }), 'typed while the question was read');
});

test('no unfinished answer when there are no words, or it was already handed in', () => {
  assert.equal(unfinishedAnswer({ phase: 'answering', text: '' }), null);
  assert.equal(unfinishedAnswer({ phase: 'answering', text: '   \n ' }), null); // a recording alone has no words
  assert.equal(unfinishedAnswer({ phase: 'answering', text: undefined }), null);
  // Next, Skip or the time limit already made it a real result: it must not be counted twice
  assert.equal(unfinishedAnswer({ phase: 'answering', text: 'handed in', submitted: true }), null);
  assert.equal(unfinishedAnswer({ phase: 'asking', text: 'time-up line is being spoken', submitted: true }), null);
});

test('only the asking and answering phases can hold an unfinished answer', () => {
  for (const phase of ['setup', 'finishing', 'marking', 'feedback', 'ending', 'finished']) {
    assert.equal(unfinishedAnswer({ phase, text: 'words' }), null, phase);
  }
});

test('a question moves asking -> ready -> answering -> finishing -> review -> asking', () => {
  let p = 'asking';
  for (const [event, expected] of [['spoken', 'ready'], ['start', 'answering'], ['finish', 'finishing'], ['handed', 'review'], ['next', 'asking']]) {
    p = nextPhase(p, event);
    assert.equal(p, expected, event);
  }
});

test('events that do not fit the phase change nothing (double clicks, late callbacks)', () => {
  assert.equal(nextPhase('finishing', 'finish'), 'finishing');
  assert.equal(nextPhase('finishing', 'next'), 'finishing');
  assert.equal(nextPhase('review', 'finish'), 'review');
  assert.equal(nextPhase('review', 'timeup'), 'review'); // a hard timeout never re-finalises or auto-advances
  assert.equal(nextPhase('asking', 'start'), 'asking'); // nothing is captured while the interviewer speaks
  assert.equal(phaseAllows('review', 'next'), true);
  assert.equal(phaseAllows('finishing', 'next'), false);
});

test('a time-up in ready or answering goes to finishing, and End is allowed from every active phase', () => {
  assert.equal(nextPhase('ready', 'timeup'), 'finishing');
  assert.equal(nextPhase('answering', 'timeup'), 'finishing');
  for (const p of ACTIVE_PHASES) assert.equal(nextPhase(p, 'end'), 'ending', p);
});

test('the main button follows the phase', () => {
  assert.deepEqual(primaryAction({ phase: 'ready' }), { label: 'Start answer', disabled: false, kind: 'start' });
  assert.equal(primaryAction({ phase: 'asking' }).disabled, true);
  assert.equal(primaryAction({ phase: 'answering' }).label, 'Finish answer');
  assert.deepEqual(primaryAction({ phase: 'finishing' }), { label: 'Finishing…', disabled: true, kind: 'wait' });
  assert.equal(primaryAction({ phase: 'review' }).label, 'Next question');
  assert.equal(primaryAction({ phase: 'review', isLast: true }).label, 'Finish session');
  assert.equal(primaryAction({ phase: 'review', waitingForFeedback: true }).disabled, true);
});

test('repeat is only offered before the answer starts; skip until it is handed in', () => {
  assert.equal(canRepeat('ready', true), true);
  for (const p of ['asking', 'answering', 'finishing', 'review']) assert.equal(canRepeat(p, true), false, p);
  assert.equal(canRepeat('ready', false), false);
  for (const p of ['asking', 'ready', 'answering']) assert.equal(canSkip(p, true), true, p);
  for (const p of ['finishing', 'review']) assert.equal(canSkip(p, true), false, p);
  assert.equal(canSkip('ready', false), false);
});
