# InterviewPal: brief for Claude Code

Build and maintain the app described in `docs/requirements.md`. Read that file first; it is the source of truth. `README.md` is the user guide and has the project layout. `docs/architecture.md` explains how the app is built (layers, state machine, data model, trade-offs); keep it in step when the structure changes, together with its styled twin `docs/architecture.html` (hand-drawn SVG diagrams; the Markdown file wins if they differ).

## Status

**v1 is complete.** All eleven build steps are done and the owner has tested the app in Chrome on a laptop and on a real phone. It is published at https://mehulp.github.io/interview-pal/ (repo: mehulp/interview-pal, pushed over SSH). Not yet tested: Safari and iPhone. Do not build the "Deferred to v2" or "Later" items in the requirements unless asked.

**v1.1 ("make it publishable") is complete** (steps 12 to 16 in `docs/requirements.md`): published interviewers with a NOTICE, the demo set, delivery analytics, the progress view and streak, and repo polish (tests, GitHub Action, README opening, changelog, pre-publish checklist). Tags `v1.0.0` (commit `7417913`) and `v1.1.0` are pushed, the site is live, and the README has its screenshots (the demo GIF was skipped).

**v1.3 (record and replay answers) is built** (steps 20 to 25 in `docs/requirements.md`): optional recording with a target length, an unsaved-recording panel on every tab, saving to IndexedDB, and a Recordings card on the History tab. Not yet tagged or pushed. The browser checks were done in headless Chromium with a fake microphone; real-microphone checks are the owner's (listed in the requirements).

**v1.4 (record video, download only) is built** (steps 26 to 30): an unticked-by-default Include video box, a full-screen view of the user while recording (up to 7 minutes), and a review with Download only. Videos are never stored by the app. Not yet tagged or pushed; real-camera checks are the owner's (listed in the requirements).

**Also done: a start/stop script** (`scripts/interviewpal.sh` and `scripts/devserver.py`) so the owner can run the app without remembering commands. Documented in the README under "Start and stop". The owner confirmed it opens Chrome on the Windows side, and added the optional `interviewpal` alias to `~/.bashrc`.

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
- Camera self-view stays on screen only. It never records, stores, uploads or analyses camera frames, never requests the microphone, and the camera stops when the session ends.
- Video recording (v1.4) is a separate, explicit option (the unticked-by-default "Include video" box in the recorder panel). The camera is recorded only while recording with that box ticked. A video is **never stored in the browser** (no IndexedDB, no localStorage): the only way to keep it is the user's Download. It is never uploaded and its frames are never analysed. Maximum 7 minutes. Release the camera and microphone tracks on stop, discard, error and navigation, and never stop a self-view track from the recorder (use a copy).
- Interviewer photos and clips may be committed (from v1.1) only if they are AI-generated or otherwise rights-cleared, are listed in `assets/interviewers/NOTICE.md`, and never use a real person's likeness. Keep clips small (under about 10 MB each; tell the owner before committing a bigger one). No paid or third-party avatar service, and no uploading anything for the avatar. `demo-videos/` stays git-ignored.
- Delivery analytics (v1.1) use only the answer text and timings. They never process or keep audio, and these numbers are never sent anywhere.
- Recording answers (v1.3) is a separate, optional feature. The microphone is requested only when the user presses Record; audio is saved only when the user presses Save, only in IndexedDB through `src/recordstore.js`, and is never uploaded. The feature makes no network request. Do not claim that audio never leaves the browser: voice answers use the browser's speech recogniser, which in Chrome sends audio to Google. Release every microphone track on stop, discard, error and navigation.

## Modes

The app has two modes, described in full in `docs/requirements.md` (see "Modes" and "Build order"):

- **Practice** (default, no AI): spoken questions with serial or random order, a question level filter, difficulty (timer, tone, speech rate, repeat and skip rules) and optional self-marking.
- **Coach** (AI, needs an API key): everything in Practice plus AI scoring and feedback. Follow-ups and tidy-up are deferred to v2. Weak-area ordering is under "Later", merged with spaced repetition.

Also built, beyond Practice and Coach: question sets with JSON export and import, realistic interviewers (photos or clips, a matching voice, picked by difficulty), optional camera self-view, a lean session summary and History tab, and a set of speech-recognition improvements (keep listening, microphone choice, microphone check, optional on-device recogniser).

## How the code is organised

- `scripts/interviewpal.sh` starts, stops and reports on the local server; `scripts/devserver.py` is the small standard-library server behind it (127.0.0.1 only, `Cache-Control: no-store`). Its process ID and log live in `.run/`, which is git-ignored.
- `index.html` holds all four screens (Interview, Questions, History, Settings); `src/ui.js` switches between them. `styles.css` holds all styles.
- Logic that needs no page lives in small modules that can be tested on their own with Node: `parser.js` (the text rules), `sets.js`, `session.js`, `history.js`, `vocabulary.js`, `interviewers.js`, `phrases.js`, and from v1.1 `delivery.js`, `progress.js` and `recordings.js`.
- Everything saved in the browser goes through `src/storage.js`, except recordings, which go through `src/recordstore.js` (IndexedDB, because audio does not fit localStorage). Settings are saved with `saveSettings({ key: value })`, which merges, so never save a whole copy of the settings object.
- Anything a user's notes, answers or Claude's replies put on screen must be set with `textContent`, never as HTML.
- `src/claude.js` is the only file that talks to the Anthropic API, and Practice mode never loads it (Coach loads it on demand).

## Testing

- Unit tests are in `tests/` (Node's built-in test runner) for the pure modules: parser, sets, session, history, vocabulary, delivery, progress and recordings. Run `npm test` (same as `node --test tests/*.test.js`) and `npm run check`. `package.json` has no dependencies; it only sets `"type": "module"` and the two scripts. A GitHub Action runs both on every push. Add or update tests whenever a pure module changes. The speech recogniser and the screens are checked by hand in Chrome.
- Syntax check: `npm run check` (or `for f in src/*.js; do node --check $f; done`).
- Voice, microphone and camera behaviour can only be checked in a real browser.

## Environment: Ubuntu on WSL

- The project lives in the Linux filesystem (`~/interviewpal`), not under `/mnt/c`, for speed and reliable git.
- Run the dev server inside WSL with `scripts/interviewpal.sh start` (also `stop`, `status`, `restart`; `PORT=` and `NO_BROWSER=1` are options). `python3 -m http.server 8000` still works as a manual fallback.
- Choose the headset or microphone you actually use in the app's Microphone list (the Windows default may be the laptop microphone).
- Test in **Google Chrome on the Windows side** at `http://localhost:8010` (the script's default port; storage, including recordings, belongs to the exact address, so always use the same one). WSL forwards localhost automatically, and the Windows microphone works there.
- Do not test voice features by opening the WSL IP address. Microphone access needs `localhost` or HTTPS, so an IP address will block it.
- Claude Code itself must not launch a browser from inside WSL. Tell me the URL and I will open it. The one exception is the project's own `scripts/interviewpal.sh`, which is allowed to open Chrome on the Windows side when the owner runs it (and Claude Code tests it with `NO_BROWSER=1`, so no browser opens during testing).
- Microphone access also does not work on plain `file://` pages.
