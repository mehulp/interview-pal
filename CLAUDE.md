# InterviewPal: brief for Claude Code

Build the app described in `docs/requirements.md`. Read that file first; it is the source of truth.

## Working style

- The owner is semi-technical. Explain what you are doing in plain language, and keep the code simple and readable with short comments.
- Build in the order listed under "Build order" in the requirements. After each step, tell me how to run and test it, then wait for my go-ahead.
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
- Respect `prefers-reduced-motion` in avatar animations.

## Modes

The app has two modes, described in full in `docs/requirements.md` (see "Modes" and "Build order"):

- **Practice** (default, no AI): spoken questions with serial or random order, a question level filter, difficulty (timer, tone, speech rate, repeat and skip rules) and optional self-marking.
- **Coach** (AI, needs an API key): everything in Practice plus AI scoring and feedback. Follow-ups, weak-area ordering and tidy-up are deferred to v2.

The build order was updated: 4 parser and review screen, 5 Practice loop, 6 mode picker, settings and Claude client, 7 Coach scoring and feedback, 8 question sets with JSON export and import, 9 summary and history (on hold until after real use), 10 polish and deployment. Steps 1 to 6 are done, and step 7 is built and awaiting testing. Do not build the v2 items (see "Deferred to v2" in the requirements) unless asked. Keep to one step at a time and wait for my go-ahead after each.

## First task (done)

1. Create the folder structure from the Modules table in the requirements, plus `.gitignore`, `README.md` and `LICENSE` (MIT).
2. Create `index.html` with a basic responsive layout and a placeholder avatar.
3. Show me how to run it locally with `python3 -m http.server`.

Stop there and wait for my feedback before step 2 of the build order.

## Environment: Ubuntu on WSL

- The project lives in the Linux filesystem (`~/interviewpal`), not under `/mnt/c`, for speed and reliable git.
- Run the dev server inside WSL: `python3 -m http.server 8000`.
- Test in **Google Chrome on the Windows side** at `http://localhost:8000`. WSL forwards localhost automatically, and the Windows microphone works there.
- Do not test voice features by opening the WSL IP address. Microphone access needs `localhost` or HTTPS, so an IP address will block it.
- Do not try to launch a browser from inside WSL. Tell me the URL and I will open it.
- Microphone access also does not work on plain `file://` pages.
