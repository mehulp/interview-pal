# InterviewPal: brief for Claude Code

Build and maintain the app described in `docs/requirements.md`. Read that file first; it is the source of truth. `README.md` is the user guide and has the project layout. `docs/architecture.md` explains how the app is built (layers, state machine, data model, trade-offs); keep it in step when the structure changes.

## Status

**v1 is complete.** All eleven build steps are done and the owner has tested the app in Chrome on a laptop. Not yet done: testing on a real phone, and publishing to GitHub Pages (the README has the steps; it needs the owner's GitHub account). Do not build the "Deferred to v2" or "Later" items in the requirements unless asked.

**v1.1 ("make it publishable") is agreed and documented in `docs/requirements.md`, but not started.** Its five steps (12 to 16) are done in order, one at a time, with a commit after each and the owner's go-ahead between them: publish the interviewers, the demo set, delivery analytics, the progress view and streak, repo polish. The v1 state is to be tagged `v1.0.0` at commit `7417913`.

For any new work: agree the change with the owner, update `docs/requirements.md` first (and `README.md` if users will notice it), then build it in small steps and commit after each one.

## Working style

- The owner is semi-technical. Explain what you are doing in plain language, and keep the code simple and readable with short comments.
- Work one step at a time. After each step, tell me how to run and test it, then wait for my go-ahead.
- Make a small git commit after each working step with a clear message.
- Prefer plain HTML, CSS and JavaScript (ES modules), no build step. Ask before adding any dependency beyond `mammoth` and `pdf.js`.

## Rules

- Never commit an API key, and never put one in code. The key is entered in Settings and kept in localStorage.
- Never commit personal notes. Keep `my-notes/` in `.gitignore`.
- Documents and answers go only to the Anthropic API, and only in Coach mode. Practice mode makes no network calls to any AI service. No analytics, no other servers.
- Practice mode is the default and must work with no API key. Coach mode stays disabled, with a note pointing to Settings, until a key is saved.
- In Practice mode, documents are read with the rule-based parser in `src/parser.js`, never with AI. A "Tidy up with AI" button is planned for v2 (Coach mode only).
- Interviewer phrases and tone for each difficulty live in `src/phrases.js`, not scattered through the code.
- Voice defaults to `en-IN`; fall back gracefully if that voice is missing.
- Typing must always work, because speech recognition is unreliable on some browsers.
- Respect `prefers-reduced-motion` in avatar animations, including the video clips (show a still frame instead of playing).
- Camera self-view stays on screen only. Never record, store, upload or analyse camera frames, never request the microphone for it, and stop the camera when the session ends.
- Interviewer photos and clips may be committed (from v1.1) only if they are AI-generated or otherwise rights-cleared, are listed in `assets/interviewers/NOTICE.md`, and never use a real person's likeness. Keep clips small (under about 10 MB each; tell the owner before committing a bigger one). No paid or third-party avatar service, and no uploading anything for the avatar. `demo-videos/` stays git-ignored.
- Delivery analytics (v1.1) use only the answer text and timings. Never keep audio, and never send these numbers anywhere.

## Modes

The app has two modes, described in full in `docs/requirements.md` (see "Modes" and "Build order"):

- **Practice** (default, no AI): spoken questions with serial or random order, a question level filter, difficulty (timer, tone, speech rate, repeat and skip rules) and optional self-marking.
- **Coach** (AI, needs an API key): everything in Practice plus AI scoring and feedback. Follow-ups and tidy-up are deferred to v2. Weak-area ordering is under "Later", merged with spaced repetition.

Also built, beyond Practice and Coach: question sets with JSON export and import, realistic interviewers (photos or clips, a matching voice, picked by difficulty), optional camera self-view, a lean session summary and History tab, and a set of speech-recognition improvements (keep listening, microphone choice, microphone check, optional on-device recogniser).

## How the code is organised

- `index.html` holds all four screens (Interview, Questions, History, Settings); `src/ui.js` switches between them. `styles.css` holds all styles.
- Logic that needs no page lives in small modules that can be tested on their own with Node: `parser.js` (the text rules), `sets.js`, `session.js`, `history.js`, `vocabulary.js`, `interviewers.js`, `phrases.js`, and from v1.1 `delivery.js` and `progress.js`.
- Everything saved in the browser goes through `src/storage.js`. Settings are saved with `saveSettings({ key: value })`, which merges, so never save a whole copy of the settings object.
- Anything a user's notes, answers or Claude's replies put on screen must be set with `textContent`, never as HTML.
- `src/claude.js` is the only file that talks to the Anthropic API, and Practice mode never loads it (Coach loads it on demand).

## Testing

- Today there is no automated test suite in the repo. During the build, the pure modules and the speech recogniser (with a fake browser recogniser) were checked with throwaway Node scripts, and the screens were checked by the owner in Chrome. v1.1 step 16 adds a `tests/` folder (Node's built-in test runner, run with `node --test tests/`), a minimal `package.json` with `"type": "module"` and no dependencies, and a GitHub Action that runs the syntax check and the tests on every push.
- Syntax check: `for f in src/*.js; do node --check $f; done`.
- Voice, microphone and camera behaviour can only be checked in a real browser.

## Environment: Ubuntu on WSL

- The project lives in the Linux filesystem (`~/interviewpal`), not under `/mnt/c`, for speed and reliable git.
- Run the dev server inside WSL: `python3 -m http.server 8000`.
- Choose the headset or microphone you actually use in the app's Microphone list (the Windows default may be the laptop microphone).
- Test in **Google Chrome on the Windows side** at `http://localhost:8000`. WSL forwards localhost automatically, and the Windows microphone works there.
- Do not test voice features by opening the WSL IP address. Microphone access needs `localhost` or HTTPS, so an IP address will block it.
- Do not try to launch a browser from inside WSL. Tell me the URL and I will open it.
- Microphone access also does not work on plain `file://` pages.
