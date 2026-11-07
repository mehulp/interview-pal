// A link from Study Hub (local pilot): ?pack=system-design-week-1&plan=<plan ID>. The InterviewPal side only: Study Hub
// itself is replaced by a stub page at its configured origin. Covers direct entry, a fresh browser, the one-click add,
// "for this visit only" selection, repeated opening, adopting a set that already has the name, unknown packs and bad plan IDs,
// a link arriving during a session, another tab, the linked session's Back to study plan (and the unsaved-recording
// safeguard), and a standalone session showing no such button. Devices are SIMULATED (see README.md).
import { launch, newPage, ready, startAnswer, finish, next, vis, text, stats, check, done, BASE } from './lib.mjs';

const b = await launch();
const PLAN = '7e610b8f-3755-44a7-97fe-74fbdc36323a';
const KEY = 'system-design-week-1';
const LINK = `?pack=${KEY}&plan=${PLAN}`;
const STUDY_HUB = 'http://localhost:5173';

const sets = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.sets') || '{"sets":[]}').sets);
const settings = (p) => p.evaluate(() => localStorage.getItem('interviewpal.settings'));
const ticked = (p) => p.evaluate(() => [...document.querySelectorAll('#set-choices input:checked')].map((i) => i.parentElement.textContent.replace(/\s*\(\d+\)$/, '')));
const banner = async (p) => ((await vis(p, '#link-notice')) ? text(p, '#link-notice-text') : '');
const stub = (p) => p.route(`${STUDY_HUB}/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<title>Study Hub stub</title><h1 id="plan">Study Hub plan page</h1>' }));
const open = async (p, query = LINK) => { await p.goto(BASE + query); await p.waitForSelector('#setup:not([hidden])'); };
const addPack = async (p) => { await p.click('#link-add-pack'); await p.waitForFunction(() => document.getElementById('link-add-pack').hidden); };
const tab = (p, n) => p.click(`.tabs button[data-screen="${n}"]`);

/* ===== 1. Direct entry is unchanged ===== */
{
  const p = await newPage(b);
  await open(p, '');
  check('no link: no banner, and the usual setup', !(await vis(p, '#link-notice')) && (await vis(p, '#start-btn')));
  const before = await settings(p);
  await open(p, '?other=1');
  check('an address with other query values is ignored too', !(await vis(p, '#link-notice')) && (await settings(p)) === before);
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 2. A fresh browser: the pack is added with one explicit click, then ticked for this visit ===== */
{
  const p = await newPage(b);
  await open(p);
  check('the banner says what the link asked for and offers one button to add the set', (await banner(p)).includes('"System Design — Week 1"') && (await vis(p, '#link-add-pack')), await banner(p));
  check('nothing was added by opening the link', (await sets(p)).length === 1 && (await sets(p))[0].questions.length === 0);
  check('Start is off until there are questions (as in any fresh install)', await p.locator('#start-btn').isDisabled());
  const settingsBefore = await settings(p);
  await addPack(p);
  const s = await sets(p);
  check('one click adds one set with the six questions and remembers the pack key', s.length === 2 && s[1].name === 'System Design — Week 1' && s[1].packKey === KEY && s[1].questions.length === 6 && s[1].questions.every((x) => x.id && x.answer));
  check('only the pack is ticked, and Start is on', (await ticked(p)).join() === 'System Design — Week 1' && !(await p.locator('#start-btn').isDisabled()));
  check('the banner now says it is ticked for this visit and that the person still chooses and starts', (await banner(p)).includes('ticked for this visit') && (await banner(p)).includes('press Start') && !(await vis(p, '#link-add-pack')));
  check('the usual selection was not saved by this (settings unchanged)', (await settings(p)) === settingsBefore);
  check('Guided rehearsal / Mock interview is still the person\'s choice: no session started, no media asked for', (await vis(p, '#preset-guided')) && !(await vis(p, '#interview')) && (await stats(p)).gum === 0);
  await tab(p, 'questions');
  check('the set is in the Questions library with its six questions', (await p.locator('#set-select option').allInnerTexts()).join('|').includes('System Design — Week 1 (6)'));
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 3. Abandoning a linked setup keeps the usual selection ===== */
{
  const p = await newPage(b);
  await open(p);
  await addPack(p);
  // the usual selection: only "My questions" (which has one question of its own)
  await p.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('interviewpal.sets'));
    data.sets[0].questions.push({ id: 'mine1', question: 'My own question?', answer: '', topic: '', level: '' });
    localStorage.setItem('interviewpal.sets', JSON.stringify(data));
    const s = JSON.parse(localStorage.getItem('interviewpal.settings') || '{}');
    localStorage.setItem('interviewpal.settings', JSON.stringify({ ...s, practiceSets: [data.sets[0].id] }));
  });
  const before = await settings(p);
  await open(p);
  check('the link ticks only the pack for this visit', (await ticked(p)).join() === 'System Design — Week 1');
  await tab(p, 'history'); await tab(p, 'practice');
  check('leaving and coming back during the visit keeps the pack ticked', (await ticked(p)).join() === 'System Design — Week 1');
  check('nothing was saved', (await settings(p)) === before);
  await open(p, ''); // abandon: open InterviewPal the ordinary way
  check('standalone again: the usual selection (My questions) is back', (await ticked(p)).join() === 'My questions');
  await p.context().close();
}

/* ===== 4. Opening the same link again never duplicates or overwrites; renaming and deleting are handled ===== */
{
  const p = await newPage(b);
  await open(p); await addPack(p);
  // the person edits a pack question and renames the set
  await p.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('interviewpal.sets'));
    data.sets[1].questions[0].answer = 'MY OWN REFERENCE';
    data.sets[1].name = 'My renamed systems set';
    localStorage.setItem('interviewpal.sets', JSON.stringify(data));
  });
  for (let i = 0; i < 3; i++) await open(p);
  const s = await sets(p);
  check('opening the link three more times adds nothing (still two sets)', s.length === 2 && s[1].questions.length === 6);
  check('the renamed set is found by its key, with no Add button', (await ticked(p)).join() === 'My renamed systems set' && !(await vis(p, '#link-add-pack')));
  check('the person\'s edit is untouched', s[1].questions[0].answer === 'MY OWN REFERENCE');
  // delete the set: the link offers to add it again
  await p.evaluate(() => { const data = JSON.parse(localStorage.getItem('interviewpal.sets')); data.sets.splice(1, 1); localStorage.setItem('interviewpal.sets', JSON.stringify(data)); });
  await open(p);
  check('after deleting it the link offers to add it again', await vis(p, '#link-add-pack'));
  await addPack(p); await addPack(p).catch(() => {});
  check('adding twice still gives one set', (await sets(p)).filter((x) => x.packKey === KEY).length === 1);
  check('no page errors', p.errors.length === 0, p.errors.join());
  await p.context().close();
}

/* ===== 5. A set that already has the pack's name is adopted, not duplicated, and nothing of the person's is overwritten ===== */
{
  const p = await newPage(b);
  await p.evaluate(() => localStorage.setItem('interviewpal.sets', JSON.stringify({ sets: [{ id: 'mine', name: 'system design — week 1', questions: [
    { id: 'm1', question: 'Explain consistent hashing and why distributed systems use it.', answer: 'MY ANSWER', topic: 'Mine', level: '' },
    { id: 'm2', question: 'My extra question?', answer: 'x', topic: '', level: '' },
  ] }] })));
  await open(p);
  check('the banner explains that the existing set will be linked', (await banner(p)).includes('already have a set with that name'), await banner(p));
  await addPack(p);
  const s = await sets(p);
  check('no second set; the existing one is linked and gains only the missing questions', s.length === 1 && s[0].packKey === KEY && s[0].questions.length === 7, JSON.stringify(s.map((x) => [x.name, x.questions.length])));
  check('the person\'s own version of a question is kept', s[0].questions.find((x) => x.id === 'm1').answer === 'MY ANSWER' && s[0].questions.some((x) => x.id === 'm2'));
  await p.context().close();
}

/* ===== 6. An unknown pack key, and a bad plan ID ===== */
{
  const p = await newPage(b);
  await open(p, '?pack=no-such-pack&plan=' + PLAN);
  const before = await settings(p);
  check('an unknown pack gives a clear message and changes nothing', (await banner(p)).includes('"no-such-pack"') && (await banner(p)).includes('nothing was changed') && !(await vis(p, '#link-add-pack')) && (await sets(p)).length === 1);
  for (const bad of ['?pack=__proto__', '?pack=constructor', '?pack=' + KEY.toUpperCase(), '?pack=', '?pack=<script>alert(1)</script>']) {
    await open(p, bad);
    check(`pack ${JSON.stringify(bad.slice(6, 30))} is refused (no set added, no page break)`, (await sets(p)).length === 1 && (await vis(p, '#link-notice')) && p.errors.length === 0, await banner(p));
  }
  check('the message is plain text (nothing was injected)', !(await p.evaluate(() => document.getElementById('link-notice').innerHTML.includes('<script'))));
  check('the usual settings are untouched by all of these', (await settings(p)) === before);
  await open(p, `?pack=${KEY}&plan=https://evil.example/`);
  check('a plan value that is not a UUID is ignored with a note, and the pack still opens', (await banner(p)).includes('not valid') && (await vis(p, '#link-add-pack')));
  await addPack(p);
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'x'); await finish(p); await next(p);
  await p.waitForSelector('#finished:not([hidden])');
  check('with a bad plan ID there is no Back to study plan button', !(await vis(p, '#back-to-plan')));
  await p.context().close();
}

/* ===== 7. The linked session: Back to study plan ===== */
{
  const p = await newPage(b);
  await stub(p);
  await open(p); await addPack(p);
  const settingsBefore = JSON.parse(await settings(p));
  await p.fill('#opt-count', '2'); await p.click('#start-btn'); await ready(p);
  check('the interview runs on the pack\'s questions', (await text(p, '#question-text')).length > 20 && (await text(p, '#progress')).includes('1 of 2'));
  await startAnswer(p); await p.fill('#answer', 'first'); await finish(p); await next(p); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'second'); await finish(p); await next(p);
  await p.waitForSelector('#finished:not([hidden])');
  check('the summary of the linked session shows Back to study plan', await vis(p, '#back-to-plan'));
  check('its address is the configured Study Hub origin plus the validated plan ID', (await p.getAttribute('#back-to-plan', 'data-url')) === `${STUDY_HUB}/plans/${PLAN}`);
  const afterSettings = JSON.parse(await settings(p));
  check('starting the linked session did not save the pack as the usual selection', JSON.stringify(afterSettings.practiceSets) === JSON.stringify(settingsBefore.practiceSets));
  check('History has the session', JSON.parse(await p.evaluate(() => localStorage.getItem('interviewpal.history'))).length === 1);
  await p.click('#again-btn');
  check('Practise again goes to the usual setup, and Back to study plan is gone', (await vis(p, '#setup')) && !(await vis(p, '#back-to-plan')));
  // do it once more, then use the button
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'x'); await finish(p); await next(p); await p.waitForSelector('#finished:not([hidden])');
  check('and its summary has no Back to study plan button', !(await vis(p, '#back-to-plan')));
  await p.context().close();
}
{
  const p = await newPage(b);
  await stub(p);
  await open(p); await addPack(p);
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'x'); await finish(p); await next(p); await p.waitForSelector('#finished:not([hidden])');
  await p.click('#back-to-plan');
  await p.waitForURL(`${STUDY_HUB}/plans/${PLAN}`);
  check('Back to study plan goes to the plan on the Study Hub origin', p.url() === `${STUDY_HUB}/plans/${PLAN}` && (await vis(p, '#plan')));
  await p.context().close();
}

/* ===== 8. A pending recording: leaving asks first ===== */
{
  const p = await newPage(b);
  await stub(p);
  await open(p); await addPack(p);
  await p.check('#setup-rec-audio');
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  await startAnswer(p); await p.waitForSelector('#rec-stop:not([hidden])'); await p.waitForTimeout(1200);
  await p.fill('#answer', 'with audio'); await finish(p); await next(p); await p.waitForSelector('#finished:not([hidden])');
  check('the summary has the button and the unsaved recording is waiting', (await vis(p, '#back-to-plan')) && (await vis(p, '#rec-indicator')));
  let asked = null;
  p.once('dialog', async (d) => { asked = d.type(); await d.dismiss(); });
  await p.click('#back-to-plan');
  await p.waitForTimeout(500);
  check('going back asks first (the existing unsaved-recording safeguard), and Stay keeps the page', asked === 'beforeunload' && p.url().startsWith(BASE.split('?')[0]) && (await vis(p, '#finished')));
  check('the recording is still there to save or download', await vis(p, '#rec-indicator'));
  p.once('dialog', (d) => d.accept());
  await p.click('#back-to-plan');
  await p.waitForURL(`${STUDY_HUB}/plans/${PLAN}`);
  check('after the person accepts, it leaves', p.url() === `${STUDY_HUB}/plans/${PLAN}`);
  await p.context().close();
}

/* ===== 9. A link that arrives during a running session ===== */
{
  const p = await newPage(b);
  await open(p, ''); await tab(p, 'questions'); await p.click('#demo-btn'); await tab(p, 'practice');
  await p.fill('#opt-count', '2'); await p.click('#start-btn'); await ready(p);
  await startAnswer(p); await p.fill('#answer', 'half way through');
  const question = await text(p, '#question-text');
  const setsBefore = JSON.stringify(await sets(p));
  await p.evaluate((q) => { history.pushState({}, '', q); window.dispatchEvent(new PopStateEvent('popstate')); }, LINK);
  check('the session is untouched: same question, same answer, still answering', (await text(p, '#question-text')) === question && (await p.inputValue('#answer')) === 'half way through' && (await text(p, '#primary-btn')) === 'Finish answer');
  check('a notice says the link was not applied', (await banner(p)).includes('not applied') && !(await vis(p, '#link-add-pack')));
  check('and nothing was added to the library', JSON.stringify(await sets(p)) === setsBefore);
  await finish(p);
  check('the session carries on normally', await vis(p, '#review'));
  await p.context().close();
}

/* ===== 10. Another tab adds the pack: this tab does not save an old copy over it ===== */
{
  const ctx = await b.newContext({ permissions: ['microphone', 'camera'] });
  const a = await ctx.newPage(); await a.goto(BASE); await tab(a, 'questions');
  const c = await ctx.newPage(); await c.goto(BASE + LINK); await c.waitForSelector('#link-add-pack'); await addPack(c);
  await a.waitForFunction(() => [...document.querySelectorAll('#set-select option')].some((o) => o.textContent.startsWith('System Design')), null, { timeout: 5000 });
  await a.click('#add-btn'); await a.fill('#q-f-question', 'Saved from the first tab?'); await a.click('#q-save');
  await a.waitForSelector('#q-view:not([hidden])');
  const s = await a.evaluate(() => JSON.parse(localStorage.getItem('interviewpal.sets')).sets);
  check('saving in the first tab kept the pack (it did not overwrite it with an old copy)', s.some((x) => x.packKey === KEY && x.questions.length === 6) && s[0].questions.some((x) => x.question === 'Saved from the first tab?'));
  await ctx.close();
}

/* ===== 11. Back to study plan from the Questions page, without practising ===== */
{
  const p = await newPage(b);
  await stub(p);
  await open(p, ''); await tab(p, 'questions');
  check('a standalone visit has no Back to study plan on the Questions page', !(await vis(p, '#q-link-bar')));
  await open(p, `?pack=${KEY}&plan=https://evil.example`); await tab(p, 'questions');
  check('a link with an invalid plan ID has none either', !(await vis(p, '#q-link-bar')));
  await open(p); await tab(p, 'questions');
  check('a linked visit shows it on the Questions page', (await vis(p, '#back-to-plan-q')) && (await text(p, '#q-link-bar')).includes('Study Hub'));
  let asked = '';
  p.once('dialog', async (d) => { asked = d.message(); await d.dismiss(); });
  await p.click('#back-to-plan-q');
  check('it asks first, and Cancel keeps us here', asked.includes('without practising') && (await vis(p, '#screen-questions')) && p.url().startsWith(BASE.split('?')[0]));
  // unsaved edits are asked about first, and Stay keeps the draft
  await p.click('#add-btn'); await p.fill('#q-f-question', 'A draft I have not saved');
  await p.click('#back-to-plan-q');
  check('with an unsaved draft the Save / Discard / Stay question comes first', await vis(p, '#guard-dialog'));
  await p.click('#guard-stay');
  check('Stay keeps the draft and does not ask about leaving', (await p.inputValue('#q-f-question')) === 'A draft I have not saved' && (await vis(p, '#screen-questions')));
  await p.click('#q-cancel');
  p.once('dialog', (d) => d.accept());
  await p.click('#back-to-plan-q');
  await p.waitForURL(`${STUDY_HUB}/plans/${PLAN}`);
  check('OK goes to the plan on the Study Hub origin (validated plan ID only)', p.url() === `${STUDY_HUB}/plans/${PLAN}`);
  await p.context().close();
}
{
  // an unknown pack clears it again
  const p = await newPage(b);
  await open(p); await tab(p, 'questions');
  check('(linked) the button is there', await vis(p, '#back-to-plan-q'));
  await open(p, '?pack=nope'); await tab(p, 'questions');
  check('a later unknown-pack link on a fresh load has none', !(await vis(p, '#q-link-bar')));
  await p.context().close();
}

/* ===== 12. Back to study plan from the Interview setup (the first page after the link), without practising ===== */
{
  const p = await newPage(b);
  await stub(p);
  await open(p, '');
  check('a standalone visit has no Back to study plan on the setup screen', !(await vis(p, '#back-to-plan-setup')));
  await open(p, `?pack=${KEY}&plan=https://evil.example`);
  check('a link with an invalid plan ID has none either', !(await vis(p, '#back-to-plan-setup')));
  await open(p, '?pack=no-such-pack&plan=' + PLAN);
  check('an unknown pack has none (nothing was opened)', !(await vis(p, '#back-to-plan-setup')));
  await open(p); await addPack(p);
  check('a valid link shows it at the top of the setup screen', await vis(p, '#back-to-plan-setup'));
  let asked = '';
  p.once('dialog', async (d) => { asked = d.message(); await d.dismiss(); });
  await p.click('#back-to-plan-setup');
  check('it asks first, and Cancel keeps us on setup with the pack still ticked', asked.includes('without practising') && (await vis(p, '#setup')) && (await ticked(p)).join() === 'System Design — Week 1' && p.url().startsWith(BASE.split('?')[0]));
  // a running microphone test ends when we leave
  await p.click('#setup-mic-btn'); await p.waitForFunction(() => document.getElementById('setup-mic-status').textContent.includes('Listening'));
  p.once('dialog', (d) => d.accept());
  await p.click('#back-to-plan-setup');
  await p.waitForURL(`${STUDY_HUB}/plans/${PLAN}`);
  check('OK goes to the plan on the Study Hub origin (validated plan ID only)', p.url() === `${STUDY_HUB}/plans/${PLAN}`);
  await p.context().close();
}
{
  // it is a setup-screen button: not shown during a session
  const p = await newPage(b);
  await open(p); await addPack(p);
  await p.fill('#opt-count', '1'); await p.click('#start-btn'); await ready(p);
  check('during the interview the setup button is not on screen', !(await vis(p, '#back-to-plan-setup')));
  await p.context().close();
}

await b.close();
process.exit(done() ? 1 : 0);
