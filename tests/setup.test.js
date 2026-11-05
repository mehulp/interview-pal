import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, presetSettings, isNewInstall, differsFromPreset, presetStatus, feedbackFromSettings, feedbackToSettings,
  timeLimitLabel, describePressure, countNote, startBlock, setsLabel, summaryLines,
} from '../src/setup.js';

test('Guided rehearsal: reference shown, relaxed, self-review; Mock: reference hidden, standard, self-review', () => {
  assert.deepEqual(PRESETS.guided, { label: 'Guided rehearsal', difficulty: 'easy', easyTimer: false, showAnswer: true, feedback: 'self' });
  assert.deepEqual(PRESETS.mock, { label: 'Mock interview', difficulty: 'medium', easyTimer: false, showAnswer: false, feedback: 'self' });
});

test('a preset becomes only existing settings (and a preset id): no recording, no new mode', () => {
  assert.deepEqual(presetSettings('guided'), { preset: 'guided', practiceDifficulty: 'easy', practiceEasyTimer: false, showModelAnswer: true, mode: 'practice', practiceSelfMark: true });
  assert.deepEqual(presetSettings('mock'), { preset: 'mock', practiceDifficulty: 'medium', practiceEasyTimer: false, showModelAnswer: false, mode: 'practice', practiceSelfMark: true });
  for (const id of ['guided', 'mock']) assert.ok(!('recording' in presetSettings(id)) && !('practiceCount' in presetSettings(id)) && !('practiceSets' in presetSettings(id)));
});

test('only a genuinely new installation counts as new', () => {
  assert.equal(isNewInstall(null), true);
  assert.equal(isNewInstall({}), true);
  assert.equal(isNewInstall({ theme: 'teal' }), true); // a theme alone is not a practice setting
  assert.equal(isNewInstall({ practiceDifficulty: 'hard' }), false);
  assert.equal(isNewInstall({ mode: 'practice' }), false);
  assert.equal(isNewInstall({ showModelAnswer: false }), false);
  assert.equal(isNewInstall('junk'), true);
});

test('Customised: shown only when the choices differ from the chosen preset', () => {
  const guided = { difficulty: 'easy', easyTimer: false, showAnswer: true, feedback: 'self' };
  assert.equal(differsFromPreset('guided', guided), false);
  assert.equal(differsFromPreset('guided', { ...guided, feedback: 'none' }), true);
  assert.equal(differsFromPreset('guided', { ...guided, showAnswer: false }), true);
  assert.equal(differsFromPreset('guided', { ...guided, easyTimer: true }), true);
  assert.equal(differsFromPreset('mock', { ...guided, difficulty: 'medium', showAnswer: false }), false);
  assert.equal(presetStatus('guided', { ...guided, difficulty: 'hard' }).label, 'Guided rehearsal (customised)');
  assert.equal(presetStatus('', guided).label, 'Your own settings');
  assert.equal(presetStatus('', guided).customised, false);
});

test('feedback maps to the existing settings and back; Coach needs a key', () => {
  assert.deepEqual(feedbackToSettings('none'), { mode: 'practice', practiceSelfMark: false });
  assert.deepEqual(feedbackToSettings('self'), { mode: 'practice', practiceSelfMark: true });
  assert.deepEqual(feedbackToSettings('coach'), { mode: 'coach' }); // self-mark left as it was
  assert.equal(feedbackFromSettings({ mode: 'coach', practiceSelfMark: true }, true), 'coach');
  assert.equal(feedbackFromSettings({ mode: 'coach', practiceSelfMark: true }, false), 'self');
  assert.equal(feedbackFromSettings({ mode: 'practice', practiceSelfMark: false }, true), 'none');
  assert.equal(feedbackFromSettings({ mode: 'practice', practiceSelfMark: true }, true), 'self');
});

test('pressure explanations state the real time limit, repeat and skip rules', () => {
  assert.equal(timeLimitLabel('easy', false), 'none');
  assert.equal(timeLimitLabel('easy', true), '5 min per answer');
  assert.equal(timeLimitLabel('medium', false), '2 min per answer');
  assert.equal(timeLimitLabel('hard', false), '90 sec per answer');
  assert.match(describePressure('easy', false), /No time limit.*Repeat is allowed.*Skip is allowed/);
  assert.match(describePressure('medium', false), /2 min per answer, counted from when the question has been asked.*does not pause/);
  assert.match(describePressure('hard', false), /90 sec.*No repeat\. No skip\./);
});

test('count notes: empty, nothing ticked, unmatched filter, oversized request, duplicates counted once', () => {
  assert.deepEqual(countNote({ everything: 0, setsTicked: 0, all: 0, matching: 0, requested: 10 }), { text: 'No questions saved yet.', needsQuestions: true, session: 0 });
  assert.equal(countNote({ everything: 5, setsTicked: 0, all: 0, matching: 0, requested: 10 }).text, 'Tick at least one set.');
  assert.match(countNote({ everything: 5, setsTicked: 1, all: 0, matching: 0, requested: 10 }).text, /no usable questions/);
  const unmatched = countNote({ everything: 5, setsTicked: 1, all: 5, matching: 0, requested: 10, level: 'hard' });
  assert.match(unmatched.text, /none are marked hard/); assert.equal(unmatched.session, 0);
  const over = countNote({ everything: 20, setsTicked: 1, all: 20, matching: 6, requested: 10, level: 'easy' });
  assert.match(over.text, /6 question\(s\) available \(20 before the complexity filter\)/);
  assert.match(over.text, /You asked for 10, but only 6 match, so the session will have 6\./);
  assert.equal(over.session, 6);
  const fine = countNote({ everything: 20, setsTicked: 1, all: 20, matching: 20, requested: 10 });
  assert.equal(fine.session, 10); assert.ok(!fine.text.includes('You asked'));
});

test('Start is blocked only when practice is impossible, with something to do about it', () => {
  assert.equal(startBlock({ everything: 0, setsTicked: 0, matching: 0 }).ok, false);
  assert.match(startBlock({ everything: 0, setsTicked: 0, matching: 0 }).reason, /Add some questions/);
  assert.match(startBlock({ everything: 3, setsTicked: 0, matching: 0 }).reason, /Tick at least one/);
  assert.match(startBlock({ everything: 3, setsTicked: 1, matching: 0 }).reason, /Question complexity/);
  assert.deepEqual(startBlock({ everything: 3, setsTicked: 1, matching: 2 }), { ok: true, reason: '' });
});

test('the start summary names questions, sets, approach, method, recording, time limit and feedback', () => {
  const lines = summaryLines({ count: 10, setNames: ['Introduction & HR'], preset: 'guided', customised: false, method: 'speak', recording: 'off', difficulty: 'easy', easyTimer: false, feedback: 'self' });
  assert.equal(lines.first, '10 questions · Introduction & HR · Guided rehearsal · Speak · Recording off');
  assert.equal(lines.second, 'Pressure: Relaxed · Time limit: none · Feedback: Self-review');
  const own = summaryLines({ count: 1, setNames: ['A', 'B', 'C'], preset: '', customised: false, method: 'type', recording: 'video', difficulty: 'hard', easyTimer: false, feedback: 'coach' });
  assert.equal(own.first, '1 question · A and 2 more sets · Your own settings · Type · Recording video');
  assert.equal(own.second, 'Pressure: Challenging · Time limit: 90 sec per answer · Feedback: AI Coach');
  assert.equal(setsLabel(['A', 'B']), 'A and B');
});
