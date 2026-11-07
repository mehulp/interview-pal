import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, PACK_KEYS, isValidPackKey, getPack, isValidPlanId, studyHubPlanUrl, parseLink, findPackSet, studyHubOrigin, STUDY_HUB_ORIGINS } from '../src/packs.js';

const PLAN = '7e610b8f-3755-44a7-97fe-74fbdc36323a';

test('the System Design — Week 1 pack: six questions on consistent hashing and CAP, each with a reference answer', () => {
  const pack = PACKS['system-design-week-1'];
  assert.equal(pack.key, 'system-design-week-1');
  assert.equal(pack.name, 'System Design — Week 1');
  assert.equal(pack.questions.length, 6);
  assert.equal(pack.questions.filter((x) => x.topic === 'Consistent hashing').length, 3);
  assert.equal(pack.questions.filter((x) => x.topic === 'CAP theorem').length, 3);
  for (const item of pack.questions) {
    assert.ok(item.question.trim().length > 20, item.question);
    assert.ok(item.answer.trim().length > 150 && item.answer.length < 700, `concise answer: ${item.question}`);
    assert.ok(['easy', 'hard'].includes(item.level));
  }
  assert.equal(new Set(pack.questions.map((x) => x.question.toLowerCase())).size, 6);
  assert.ok(pack.questions.some((x) => /^(explain|state)/i.test(x.question)) && pack.questions.some((x) => /cache cluster|shopping service/i.test(x.question)) && pack.questions.some((x) => /^(why|compare)/i.test(x.question)), 'explanation, scenario and trade-off questions');
  assert.deepEqual(PACK_KEYS, ['system-design-week-1']);
});

test('only an exact shipped key is a pack (no prefixes, no inherited names)', () => {
  assert.equal(isValidPackKey('system-design-week-1'), true);
  for (const bad of ['', 'system-design', 'System-Design-Week-1', 'system-design-week-1 ', '__proto__', 'constructor', 'toString', null, undefined, 7, ['system-design-week-1']]) assert.equal(isValidPackKey(bad), false, String(bad));
  assert.equal(getPack('nope'), null);
});

test('a plan ID must be a UUID', () => {
  assert.equal(isValidPlanId(PLAN), true);
  assert.equal(isValidPlanId(PLAN.toUpperCase()), true);
  for (const bad of ['', 'abc', '../../etc', 'javascript:alert(1)', `${PLAN}/../x`, `${PLAN}?x=1`, 'http://evil.example', `${PLAN} `, null, 5]) assert.equal(isValidPlanId(bad), false, String(bad));
});

test('the Study Hub origin is trusted configuration chosen by where InterviewPal runs', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(studyHubOrigin(host), STUDY_HUB_ORIGINS.local, host);
  for (const host of ['mehulp.github.io', 'interviewpal.example.com', 'localhost.evil.example', 'evil-localhost']) assert.equal(studyHubOrigin(host), STUDY_HUB_ORIGINS.hosted, host);
  assert.equal(STUDY_HUB_ORIGINS.local, 'http://localhost:5173');
  assert.equal(STUDY_HUB_ORIGINS.hosted, 'https://study-hub.mehul-patankar.workers.dev');
  assert.equal(studyHubOrigin(), STUDY_HUB_ORIGINS.local); // no page (Node): the local default
  assert.match(STUDY_HUB_ORIGINS.hosted, /^https:\/\/[^/]+$/); // https, no path
});

test('the return address comes only from the trusted origin and a validated plan ID', () => {
  assert.equal(studyHubPlanUrl(PLAN), `${STUDY_HUB_ORIGINS.local}/plans/${PLAN}`);
  assert.equal(studyHubPlanUrl(PLAN.toUpperCase()), `${STUDY_HUB_ORIGINS.local}/plans/${PLAN}`);
  assert.equal(studyHubPlanUrl(PLAN, STUDY_HUB_ORIGINS.hosted), `${STUDY_HUB_ORIGINS.hosted}/plans/${PLAN}`);
  assert.equal(studyHubPlanUrl('http://evil.example'), null);
  assert.equal(studyHubPlanUrl('//evil.example/x'), null);
  assert.equal(studyHubPlanUrl(PLAN, 'https://study.example'), `https://study.example/plans/${PLAN}`);
});

test('reading a link: none, unknown pack, bad plan, good', () => {
  assert.deepEqual(parseLink(''), { status: 'none' });
  assert.deepEqual(parseLink('?x=1'), { status: 'none' });
  assert.deepEqual(parseLink('?pack=nope&plan=' + PLAN), { status: 'unknown-pack', packKey: 'nope' });
  assert.equal(parseLink('?pack=' + 'x'.repeat(500)).packKey.length, 60);
  const ok = parseLink(`?pack=system-design-week-1&plan=${PLAN}`);
  assert.equal(ok.status, 'ok'); assert.equal(ok.pack.key, 'system-design-week-1'); assert.equal(ok.planId, PLAN); assert.equal(ok.planProblem, false);
  const noPlan = parseLink('?pack=system-design-week-1');
  assert.equal(noPlan.status, 'ok'); assert.equal(noPlan.planId, ''); assert.equal(noPlan.planProblem, false);
  const bad = parseLink('?pack=system-design-week-1&plan=https://evil.example');
  assert.equal(bad.status, 'ok'); assert.equal(bad.planId, ''); assert.equal(bad.planProblem, true);
  assert.equal(parseLink(`?pack=system-design-week-1&plan=${PLAN.toUpperCase()}`).planId, PLAN);
  assert.equal(parseLink('?pack=__proto__').status, 'unknown-pack');
});

test('finding the pack in the library: by key (survives renaming), else a keyless set with the same name', () => {
  const pack = getPack('system-design-week-1');
  assert.equal(findPackSet([{ id: 'a', name: 'Renamed by me', packKey: 'system-design-week-1', questions: [] }], pack).id, 'a');
  assert.equal(findPackSet([{ id: 'b', name: 'system design —  week 1', questions: [] }], pack).id, 'b');
  assert.equal(findPackSet([{ id: 'c', name: 'System Design — Week 1', packKey: 'other', questions: [] }], pack), undefined);
  assert.equal(findPackSet([{ id: 'd', name: 'Other', questions: [] }], pack), undefined);
});
