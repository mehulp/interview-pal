# InterviewPal: Requirements

A daily mock-interview practice tool. You load your own Q&A notes and an animated interviewer asks the questions aloud. You answer by voice or typing. There are two modes: **Practice** (no AI, no key, no feedback) and **Coach** (Claude scores your answer against your notes).

## Status

**v1 is complete.** All eleven build steps are done (see "Build order"). The owner tested the app in Chrome on a laptop (Practice and Coach modes, question sets, History, the interviewer faces, self-view and voice answers). It is also tried on a real phone and works well, and it is published on GitHub Pages at https://mehulp.github.io/interview-pal/. Not yet verified: Safari and iPhone. Items in "Deferred to v2" and "Later" are not built. **v1.1 ("make it publishable") is complete**; see the section of that name below. It is tagged `v1.1.0`, and the end of v1 is tagged `v1.0.0` (commit `7417913`). The README screenshots are in (the demo GIF was skipped). **v1.2 is planned and agreed but not started**: showing the model answer on the Interview screen, and a tidier "Try the demo" card (see "v1.2" below).

## Decisions (defaults confirmed)

| Topic | Decision |
|---|---|
| Modes | Practice (default, no AI, no API key) and Coach (AI, needs an API key) |
| Document formats | .md, .txt, .docx, .pdf |
| Question sets | Several named sets (for example Leadership, Technical). A question belongs to exactly one set. Sets are picked at the start of a session, so any combination can be practised. Sets can be exported and imported as a JSON file |
| Repository | Private to start |
| Main answer mode | Voice, with typing as fallback |
| Language / accent | Default English (India), `en-IN`. Separate pickers for the interviewer voice and the user's speech: en-IN, en-US, en-GB |
| Devices | Laptop and phone (mobile-friendly layout) |

## Goals

- Build confidence in facing an interviewer. The main reason for this app is to get over the fear of facing an interviewer, so the interviewer should look like a real person and the user should practise eye contact, not only the answers.
- Practice interviews daily using your own prepared questions and answers.
- Feel like a real interview: spoken questions, a visible interviewer, and time pressure.
- Work fully offline from AI: Practice mode needs no key and sends nothing to any AI service.
- In Coach mode, show what you missed compared with your own notes. (Tracking weak topics over time is planned for v2.)

## Non-goals (v1)

- No backend, no login, no user accounts.
- No paid or live lip-synced avatar service in v1. A realistic face is done with local photos or video clips instead (see "Realistic interviewer").
- No multi-user or sharing features.

## Modes

A mode picker lets the user choose Practice or Coach before each session. Practice is the default.

### Practice mode (no AI, no API key)

The interviewer asks the questions aloud. There is no scoring and no AI feedback. Nothing is sent to any AI service, and the app works with no API key saved.

- **Order:** serial (as in the document) or random.
- **Question level filter:** questions can optionally be tagged `easy` or `hard` in the document. The user can practise all questions, only easy ones, or only hard ones. Untagged questions count as "all" only. This is separate from the interview difficulty below, so it is called "question level" in the UI.
- **Difficulty:** easy, medium or hard. Difficulty changes four things (starting values, easy to tune later in `src/phrases.js` and the settings code):

| | Easy | Medium | Hard |
|---|---|---|---|
| Per-answer timer | None, or a long one (about 5 min) | About 2 min | About 90 sec |
| Tone and phrases | Warm, encouraging | Neutral, professional | Brisk, challenging |
| Speech rate | Slower (about 0.9) | Normal (1.0) | Faster (about 1.1) |
| Repeat question | Allowed | Allowed | Not allowed |
| Skip question | Allowed | Allowed | Not allowed |

- **Interviewer phrases:** the lines the interviewer says around each question (opening, "next question", "take your time", "time is up", closing) are stored in `src/phrases.js`, with a few variants per difficulty so it does not sound repetitive.
- **Timer:** a visible countdown per answer. When it reaches zero the interviewer says a time-up line and moves on. The timer is optional on easy.
- **Self-marking (optional, off by default):** a toggle "Reveal my reference answer and self-mark". After each answer the reference answer from the user's notes is shown, and the user taps Got it / Partly / Missed. Self-marks are saved in history (and can feed weak-area ordering in v2).
- **Show model answer (optional, off by default; v1.2):** see "Showing the model answer" below. It works in Coach mode too.

### Coach mode (AI, needs an API key)

Everything in Practice mode (order, level filter, difficulty, timer, phrases), except that AI marking replaces self-marking, plus:

- Scoring out of 10 and feedback against the reference answer (covered, missed, one tip), shown as text and spoken aloud (the spoken part can be switched off).

Planned for v2 (not in v1, see "Deferred to v2" below): follow-up questions, weak-area-first ordering and a "Tidy up with AI" button.

Rules for scoring:
- If the answer box is empty, the answer scores 0 and no AI call is made.
- If a question has no reference answer, Claude judges the answer on general merit and the feedback says so.
- Skipped questions are not scored.
- Only the question, the reference answer and the user's answer are sent to the API.
- Each answer's feedback is shown, then the user presses Next. If the AI call fails, the user can retry or skip the feedback.

Until an API key is saved in Settings, Coach mode is disabled in the mode picker, with a note pointing to Settings.

## Functional requirements

### Must have (v1)

1. **Load documents.** Upload one or more .md, .txt, .docx or .pdf files, or paste text. In Practice mode the questions and answers are found by a **rule-based parser** (no AI). The user can review and edit the list before starting. Loaded questions are added to the set that is open on the Questions screen.
2. **Review screen.** Shows every extracted pair. The user can edit, add and delete pairs, set a question's level (easy or hard) and fix anything the parser did not recognise. Text the parser could not place is listed so nothing is silently lost.
3. **Session setup.** Choose mode, which sets to draw from (one or several), number of questions, order, question level filter and difficulty.
4. **Interviewer voice.** Questions are read aloud with browser text-to-speech, preferring a voice for the chosen accent and falling back to any English voice.
5. **Voice answers.** Browser speech recognition with a live transcript the user can correct. A typing box is always available as a fallback. To get the most out of the browser's recogniser:
    - Pieces of recognised speech are joined with spaces, so words never run together.
    - The microphone stays open when the browser stops listening by itself (for example after a pause), until the user presses Stop or Next, or the time runs out. It gives up with a message only after a long silence or repeated failures.
    - When the user presses Next, or time runs out, the app waits a moment (up to about 1.5 seconds) for the last words to arrive before it takes the answer.
    - **On-device recognition with vocabulary hints (optional, experimental, off by default; Chrome only).** The user can switch on the browser's on-device recogniser, which can be given a list of expected words. The app builds the list from the current question, its topic and its reference answer: acronyms, technical terms and longer words, with the common words removed. If the browser, or the chosen accent, does not support it, the app says so and uses the standard recogniser. Nothing is sent anywhere by the app. The on-device language pack is downloaded by the browser once.
    - **Microphone choice.** A "Microphone" picker on the setup screen lists the computer's microphones (for example a laptop microphone and a Bluetooth headset). The chosen one is used for voice answers and for the microphone check. The default is the browser's default microphone, whose name is shown. If a browser does not support choosing a microphone, the default one is used, and the page says how to change the default in the system sound settings.
    - **Microphone check (Settings).** A level meter that shows the microphone's name and how loud the user is, with advice (too quiet, too loud, or a headset that is in a low-quality call mode). It records and stores nothing.
6. **Animated avatar.** A simple SVG interviewer with idle, talking and listening states. The mouth animates while speech plays. This drawn face is always available and is the fallback when no photos or clips are installed.
7. **Realistic interviewer (photos or video clips).** The interviewers are photos or short video clips of a realistic person: AI-generated images and clips, or material the owner has the right to use. The three interviewers that ship with the app are AI-generated and are committed to the repo (from v1.1; see "v1.1: make it publishable"). Someone running their own copy can add or replace interviewers. The app uses the files locally. No paid service, and nothing is uploaded.
    - Each interviewer is a folder `assets/interviewers/<name>/` with `listening.mp4` (played while the user answers and when idle) and `talking.mp4` (played while the interviewer speaks). A small list file, `assets/interviewers/interviewers.json`, names the interviewers.
    - Clips loop smoothly: two copies of a clip take turns and cross-fade at the seam, so a clip does not need to be a perfect loop. Switching between listening and talking also cross-fades.
    - **Photo frames (alternative to clips).** An interviewer can instead be a small set of still photos of the same person with the same framing: a neutral frame, an optional second neutral frame, an eyes-closed frame for blinking, and one or more mouth-open frames for talking. The app swaps between them with short fades: blinks and slow expression changes while listening, and quick mouth-open and closed frames while the interviewer speaks. Which photo plays which role is set in `interviewers.json`.
    - The clips are muted. The voice is the browser's text-to-speech, so the mouth does not match the exact words. This is accepted.
    - **A matching voice.** Each interviewer can have a voice profile in `interviewers.json` (female or male, optionally a voice-name hint and a pitch). The browser does not say whether a voice is male or female, so the app guesses from the voice's name (for example Heera is female, Ravi is male), preferring the chosen accent and then any English voice. The page shows which voice was chosen. If no suitable voice exists on the device, the pitch is adjusted and the page says so.
    - The user can choose the interviewer on the setup screen, and several interviewers can be installed (for example a friendly one and a stern one). If no photos or clips exist, or they fail to load, the drawn face is used and a message says so. This fallback stays in v1.1.
    - **Automatic (the default choice):** the interviewer is picked when a session starts. An interviewer marked for a difficulty in `interviewers.json` (for example `"difficulty": ["hard"]` for a tough-looking interviewer) is used for that difficulty. Otherwise one of the unmarked interviewers is picked at random, avoiding the same face twice in a row when there is a choice. The user can still pick one interviewer, or the drawn face, by hand.
    - With "reduce motion" switched on, nothing moves. A still frame is shown for each state.
    - The face is shown large and centred, so the eyes are near the top of the picture and close to the webcam.
8. **Self-view (optional, off by default).** A small mirrored picture of the user's own camera in the corner of the interview screen, to help with eye contact and posture. It uses the camera only to show the picture on screen. It never records, saves, uploads or analyses anything, never uses the microphone, and switches off when the session ends or the tab is left. It can be turned on at setup or with a button during the interview.
9. **Practice mode loop.** Spoken questions with difficulty, tone, timer, order, repeat and skip rules, and optional self-marking, as described above.
10. **Coach mode.** AI scoring and feedback for each answer, as described above.
11. **Session summary and history (lean version).**
    - **Summary.** Shown when a session ends. It has: questions asked out of the total, skipped, timed out, and time taken; the result (Coach: the average score; Practice with self-marking: how many Got it, Partly and Missed; Practice without marking: no result, because nothing is scored); **topics to revisit** (questions with a Coach score of 5 or less, or self-marked Partly or Missed, grouped by topic); and a question-by-question list where each question opens to show the user's answer and, in Coach mode, the feedback (covered, missed, tip) or the self-mark.
    - **History.** Every session that has at least one recorded answer is saved automatically when it ends, including one that was ended early or left by switching tabs. A History tab lists past sessions, newest first, with date, mode, difficulty, how many questions and the result. Opening one shows the same summary. A single session can be deleted, and the whole history can be cleared, each after a confirmation. Only the latest 200 sessions are kept.
    - **Answers visible (v1.2).** If the model answer was on screen at any point during a session, the session record is flagged (see "Showing the model answer"), and the summary and the History list say so.
    - History is stored in the browser only, and it contains the user's answers. It is not part of the sets export. Charts, trends and export of history are not in v1. A progress view with trends comes in v1.1, and export of history stays under "Later".
12. **Local storage.** Question sets, settings, API key and session history are stored in the browser only.
13. **Question sets.** The user keeps several named sets of questions, for example "Leadership", "Technical" or "Behavioural".
    - There is always at least one set. The default is called "My questions". Questions saved before sets existed are moved into it automatically.
    - Sets can be created, renamed and deleted (deleting asks for confirmation). Set names are unique.
    - **One question, one set.** A question is stored inside exactly one set. There is no copy. "Move to set" takes it out of one set and puts it into another. A question text (ignoring case and extra spaces) can exist only once across all sets, so loading a document or importing a file skips questions that already exist anywhere and reports how many were skipped and in which set they are.
    - At session setup the user ticks one or more sets. The questions of all ticked sets form one pool, and order, question level, difficulty and count apply to that pool. The last choice is remembered.
    - **Backup:** "Export sets" saves all sets to a `.json` file. "Import sets" reads such a file. Sets with a name that already exists are merged into it, new names create new sets, and duplicate questions are skipped. Files that are not valid InterviewPal exports are rejected with a clear message and change nothing.

### Should have (v2)

- Follow-up questions generated from the user's answer (Coach mode).
- An optional "Tidy up with AI" button on the review screen, for messy files that the rule-based parser cannot read (Coach mode).
- A "give me a hint" control.
- Panel-style interviewer persona (friendly and tough are covered by difficulty tone).

(The daily streak moved to v1.1, under the progress view. Weak-area-first ordering moved to "Later", merged with spaced repetition.)

### Later

- **Weak-area-first ordering and spaced repetition** (one feature). Uses past scores and self-marks from History as a third order option, and brings missed questions back sooner than ones answered well. Needs the history from step 10, which exists.
- **STAR check** (Coach mode). Checks whether an answer covered Situation, Task, Action and Result, and says which part was weak.
- A live, lip-synced avatar through a third-party service (v1 uses local photos or video clips instead).
- Export and import of session history (question sets already have export and import in v1).
- Installable as a phone app (PWA).
- A more accurate speech-to-text engine that runs in the browser (for example Whisper). It needs an extra library and a model download of tens to hundreds of MB, and the transcript would appear after the user stops speaking, not live. Not started; waiting for a decision.

## Non-functional requirements

- **Simple:** static site, no build step required for v1 (plain HTML, CSS, JavaScript with ES modules). A bundler can be added later if needed.
- **Private:** documents and the API key never leave the browser except for Anthropic API calls, which happen only in Coach mode (answer feedback). Practice mode makes no AI calls. Nothing is sent to any other server by the app.
- **Cheap:** a 10-question Coach session should cost only a few cents on a Sonnet-class model. Keep prompts small by sending only the current question, reference answer and user answer. Practice mode costs nothing.
- **Browser support:** Chrome (laptop and Android) is the primary target. Safari and iOS have limited speech recognition, so typing must always work.
- **Responsive:** usable on a phone screen, with large mic and next buttons and tap targets of at least 44 pixels. The layout stacks into one column on narrow screens. (Checked in a narrow browser window and on a real phone.) The microphone on a phone needs HTTPS, so on a phone use the GitHub Pages address; typing always works.
- **Accessible:** captions for everything spoken, keyboard operable, respects reduced-motion settings.

## Known limitations

- Voice input uses the browser's recogniser, so accuracy depends on the microphone, the room and the accent setting. A headset or a microphone close to the mouth helps most. A stronger in-browser engine is listed under "Later".
- Choosing a specific microphone for recognition, and the on-device recogniser, need a recent Chrome. Other browsers use the default microphone and the standard recogniser.
- The browser does not say whether a text-to-speech voice is male or female, so the match is guessed from the voice's name. A device with no suitable voice gets a pitch adjustment only.
- The interviewer's mouth moves in a generic pattern and does not follow the exact words.
- A question can be edited by hand into a duplicate of another set's question. The one-question-one-set rule is enforced when loading and importing, not when editing.
- Leaving a session by switching tabs ends it (what was answered is saved to History).
- History and the API key are not part of any export.
- Tried on a real phone; not tested in Safari or on an iPhone.

## Technical approach

- **Stack:** HTML, CSS, JavaScript (ES modules). Libraries loaded from a CDN: `mammoth` for .docx and `pdf.js` for .pdf.
- **Speech:** Web Speech API (`speechSynthesis` and `SpeechRecognition` / `webkitSpeechRecognition`). Speech rate comes from the difficulty setting.
- **AI (Coach mode only):** Anthropic Messages API called directly from the browser, with the header `anthropic-dangerous-direct-browser-access: true`. The model name is a setting, defaulting to `claude-sonnet-5-5` (a current Sonnet model). Requests use low-to-medium thinking effort and never send options that the current models reject (such as `temperature`).
- **API key:** entered once in Settings and stored in localStorage. Acceptable for a personal tool. The key must never be committed to the repo. Practice mode never reads it.
- **Structured output:** prompts ask Claude to return JSON only. The client strips code fences and validates before use.
- **Hosting:** GitHub Pages (static files only).
- **Local run:** `scripts/interviewpal.sh` (start, stop, status, restart) runs `scripts/devserver.py`, a standard-library static server that listens on `127.0.0.1` only and sends `Cache-Control: no-store`. No new dependency. `python3 -m http.server` still works.
- **Where data is kept (localStorage, this browser and this address only):**

| Key | What it holds |
|---|---|
| `interviewpal.settings` | Choices such as mode, difficulty, accents, microphone, interviewer, model name |
| `interviewpal.sets` | The question sets and their questions |
| `interviewpal.history` | Finished sessions, including the user's answers (latest 200) |
| `interviewpal.apiKey` | The Anthropic API key, if one was saved |

  Clearing the browser's site data deletes all of this. Question sets can be backed up with Export; history and the API key are not exported. Browsers keep separate storage for `localhost` and for a hosted address, so use Export and Import to move sets between them.

### Rule-based parser

`.docx` and `.pdf` files are first turned into plain text in the browser (`mammoth`, `pdf.js`). Then the same text rules apply to every format. The parser tries these patterns:

1. `Q:` / `A:` lines, and `Question:` / `Answer:` lines (case-insensitive, with or without a number such as `Q1.`; bold markers are ignored). The answer can run over several lines.
2. Markdown headings: headings that end in `?` are the questions and the text below is the answer. Without such headings, the deepest heading level is used for questions, and the headings above set the topic.
3. Numbered questions (`1.`, `2)`) with the lines below them as the answer. If some numbered lines end in `?`, only those are questions.
4. As a last resort, a short paragraph that starts with a line ending in `?`.

Optional tags on a question: `[easy]` or `[hard]` at the end of the question line, or a line `Level: easy` / `Level: hard` under it. A nearby heading, or a line `Topic: ...` under the question, sets the topic.

An answer is optional in Practice mode, because the interviewer only needs the question. Text that matches no pattern goes to the review screen as unplaced text, where the user can turn it into a pair or delete it. (An optional **Tidy up with AI** button for messy files is planned for v2.)

### Modules

| File | Responsibility |
|---|---|
| `src/avatar.js` | The interviewer's face: drawn SVG fallback, photo frames or looping video clips, with idle, talking and listening states |
| `src/interviewers.js` | Reads the list of installed interviewers (photos or clips, voice profile, difficulty) and picks one for a difficulty |
| `src/selfview.js` | Optional mirrored camera picture (stays on screen only) |
| `src/speech.js` | Text-to-speech (with a voice that matches the interviewer) and speech recognition wrappers (keeps listening, joins text, chosen microphone, optional on-device mode) |
| `src/vocabulary.js` | Picks the key words from a question and its reference answer, to help the recogniser |
| `src/miccheck.js` | Microphone level meter and advice (nothing is recorded) |
| `src/phrases.js` | Interviewer phrases and tone per difficulty (easy, medium, hard) |
| `src/claude.js` | API client, prompts (evaluate answer), JSON parsing and checking (Coach mode only) |
| `src/parser.js` | File reading (md, txt, docx, pdf) and rule-based Q&A extraction |
| `src/session.js` | Question ordering and filtering, session flow, timer, difficulty rules |
| `src/storage.js` | localStorage for settings, question sets, API key and history |
| `src/sets.js` | Question set rules: duplicates, move, export and import checking (no page code) |
| `src/settings.js` | Settings screen: API key, model, test connection |
| `src/practice.js` | Practice screen: setup, interview loop, self-marking, end-of-session summary |
| `src/history.js` | Session records: building, summarising, topics to revisit, keeping the latest 200 (no page code) |
| `src/summary.js` | Draws a session summary (used at the end of a session and on the History tab) |
| `src/historyscreen.js` | History tab: list of past sessions, open, delete, clear |
| `src/progressview.js` (v1.1) | Draws the progress view (SVG and CSS) on the History tab |
| `src/delivery.js` (v1.1) | Filler words, words per minute and length against the timer for voice answers (pure) |
| `src/progress.js` (v1.1) | Score and self-mark trend, sessions per day, weak-topics heat map and daily streak from stored history (pure) |
| `src/demoset.js` (v1.1) | The generic Engineering Manager demo questions, loaded by "Try the demo" |
| `src/review.js` | Questions screen: set picker, load notes, review, edit, add, move and delete pairs, export and import |
| `src/ui.js` | The app shell: creates the avatar and switches between the Interview, Questions, History and Settings tabs |

## Prompts (Coach mode, starting point)

**Tidy up with AI (v2, not built yet):** "Extract every interview question and its reference answer from this text. Return only JSON: `[{"question": "...", "answer": "...", "topic": "...", "level": "easy|hard|null"}]`."

**Evaluate answer:** "You are a {persona} interviewer for an Engineering Manager role. Compare the candidate's answer with the reference answer. Return only JSON: `{"score": 0-10, "covered": [...], "missed": [...], "tip": "...", "spoken_feedback": "two short sentences"}`." The persona follows the chosen difficulty tone (warm, neutral or challenging).

**Voice answers:** answers may come from speech recognition, so the evaluate prompt must say: "The answer is a voice transcript and may contain misheard words or misspellings. Judge the meaning, not the spelling, and do not penalise recognition errors." The user can also edit the transcript before submitting.

## Privacy and GitHub notes

- The camera (self-view) is used only to show a picture on your own screen. Frames are never recorded, stored or sent anywhere.
- Interviewer photos and clips live in `assets/interviewers/`. **From v1.1 they are committed and published.** The rule for committed media: it must be AI-generated or otherwise rights-cleared, it must be listed in `assets/interviewers/NOTICE.md`, and it must never use a real person's likeness. Keep clips small (under about 10 MB each). No paid or third-party avatar service. The shipped ones are AI-generated and are not covered by the MIT licence (see the NOTICE file).
- `demo-videos/` (screen recordings) stays git-ignored.
- Keep personal Q&A notes out of the repo. They are loaded in the browser and never need to be committed. A `my-notes/` folder is git-ignored for local use, and so are exported sets (`interviewpal-sets-*.json`).
- Voice input uses the browser's speech recognition. In Chrome this sends the audio to Google's speech service, which is outside this app's control. Typing sends nothing anywhere.
- GitHub Pages on a **private** repo needs a paid GitHub plan. On a free plan, either make the repo public (safe, because it holds no keys or notes) or run the app locally with `python3 -m http.server`.

## Build order

1. Project scaffold and static page that loads. (done)
2. Avatar with idle, talking and listening states. (done)
3. Speech: speak a line, then capture a spoken answer. (done)
4. Rule-based document parser and review screen (edit, add, delete pairs). (done)
5. Practice mode loop: difficulty, tone (`src/phrases.js`), timer, order, level filter, repeat and skip rules, optional self-marking. (done)
6. Mode picker, Settings (API key, model) and Claude client. (done)
7. Coach mode: AI scoring and feedback for each answer (shown as text, spoken aloud with an off switch). (done)
8. Question sets with JSON export and import (added after step 7). (done)
9. Realistic interviewer video clips and optional self-view (added after step 8). Photos or clips are supplied by the user; the drawn face stays as the fallback. Added later within this step: a voice that matches each interviewer, and picking the interviewer by difficulty. (done)
10. Session summary and history (lean version: summary, saved sessions, History tab; no charts or export). (done)
11. Mobile polish, README, GitHub Pages deployment. (done: phone styling, a full README and a deployment guide are written; publishing is a manual step for the owner, because it needs the owner's GitHub account)

Also added after the first test round, outside the original plan: better speech recognition (keep listening, join words, wait for the last words, microphone choice, microphone check, optional on-device recogniser with vocabulary hints). (done)

### Deferred to v2

Decided to keep these out of v1 and build them later (they were the planned "7b"):

- Follow-up questions generated from the answer.
- Weak-area-first ordering using past scores and self-marks (needs the history from step 10; now merged with spaced repetition under "Later").
- "Tidy up with AI" on the review screen.
- From the earlier v2 list: a "give me a hint" control, a panel-style persona. (The daily streak moved to v1.1.)

## v1.1: make it publishable

Goal: make the project ready to publish on GitHub Pages and to show to others. Agreed with the owner. Each item is its own build step, done in this order, with a small commit per step. Nothing here adds a dependency, a server or a network call.

12. **Publish all interviewers.** (done) The owner has decided to publish all interviewer photos and clips. They are AI-generated: the images were made with ChatGPT (plan and month: to be confirmed by the owner, not guessed), and the videos were made from those images with a script. No real person's photo was used.
    - Remove the ignore rule for `assets/interviewers/*/` in `.gitignore`, so the folders, `interviewers.json` and the media files are tracked.
    - Before committing, report the size of each file and the folder total (currently about 2.2 MB in total). If any file is over about 10 MB, tell the owner before committing it.
    - Add `assets/interviewers/NOTICE.md`. It says: the images are AI-generated with ChatGPT (plan and month from the owner); the videos were produced from those images with a script; the people shown are not real and no real person's photo was used; the files are not covered by the MIT licence; and they are included for demonstration only and are not licensed for reuse or redistribution.
    - Add a one-line "AI-generated" disclosure to the README, linking to the NOTICE file.
    - Replace every statement that the images are git-ignored or must never be committed: README (The interviewers, Publishing on GitHub Pages, Troubleshooting, Project layout), this file (the realistic interviewer item and "Privacy and GitHub notes", done as part of this planning), `CLAUDE.md` (Rules), `assets/interviewers/README.md` and `docs/architecture.md`. Remove the README note saying the published site shows only the drawn face.
    - The drawn face stays as the fallback if the files fail to load.
13. **Demo set.** (done; the card is moved and reworded in v1.2, step 18) A "Try the demo" button on the Questions tab loads about 20 generic Engineering Manager questions with model answers, topics and easy/hard levels. It goes through the existing import path, so the duplicate rules apply and nothing is loaded twice. The questions are generic, nothing employer-specific, and the data is part of the app's code (`src/demoset.js`), so there is no network call. The owner reviews the wording before it is committed.
14. **Delivery analytics (no AI, local only).** (done) For voice answers: count filler words, measure words per minute, and compare the length of the answer with the timer.
    - The logic is in a pure module, `src/delivery.js`, testable in Node. It works on the answer text and timings only.
    - Shown per answer in the session summary, with session totals, and saved in the history record. Older records without it still display.
    - Typed answers are excluded from the pace figure (a typing speed says nothing about speaking pace). Each recorded answer therefore needs to say whether it was spoken or typed, and how long the answer took.
    - Nothing is recorded or sent anywhere. No audio is kept; only numbers.
    - **Definitions (as built).** *Filler words*: um, uh, er, erm, ah, hmm, you know, I mean, sort of, kind of, basically, actually, literally ("like" is not counted, because it is too often a normal word). Chrome's recogniser often leaves "um" and "uh" out, so the count can be low; the summary says so. *Pace*: words that came from speech recognition divided by the time the microphone was on, shown only when there are at least 10 spoken words and 5 seconds. Labelled slow under 110, steady up to 170 and fast above that, words per minute. *Length against the timer*: seconds used as a percentage of the timer (only when there is a timer). Fillers and the timer comparison are worked out for any answer with text; the pace only for answers that were spoken. Skipped questions and empty answers have no delivery numbers.
15. **Progress view and daily streak** (done) on the History tab, built from stored history only. It shows the score and self-mark trend over time, sessions per day, a weak-topics heat map, and the daily streak (moved here from the v2 list). Plain SVG or CSS, no chart library. The calculations are in a pure module, `src/progress.js` (testable in Node, and added to the tests); the drawing is in a page module, `src/progressview.js`, with the charts as plain SVG and the heat map as CSS. Details as built: the trend chart plots one dot per session as a percentage (a Coach average of 7.5/10 is 75%; self-marks count Got it as full, Partly as half, Missed as none); sessions per day covers the last 14 days; the heat map shows, for each topic, how many scored or self-marked answers were weak (Coach score of 5 or less, or Partly or Missed), weakest first, as a percentage and a count so colour is not the only signal; the streak counts consecutive days with at least one saved session and stays alive until the end of the day after the last session. Skipped questions are ignored. The view is at the top of the History tab and hides when a session is opened.
16. **Repo polish.** (done; the architecture page stays out of the repo for now)
    - Unit tests with Node's built-in test runner in `tests/*.test.js` (run with `npm test`) for `parser.js`, `sets.js`, `session.js`, `history.js`, `vocabulary.js` and `delivery.js` (and `progress.js`, which is new). This needs a small `package.json` containing only `"type": "module"` and a test script, with no dependencies, so Node reads the modules as ES modules.
    - A GitHub Action that runs the syntax check and the tests on every push.
    - A README that opens with a one-paragraph pitch, a live demo link placeholder, and screenshot and GIF placeholders.
    - A `CHANGELOG.md`.
    - **Pre-publish checklist** (in the README or `docs/`): scan the whole git history for API keys and personal notes; confirm that `my-notes/` and `interviewpal-sets-*.json` are still ignored.
    - Tag commit `7417913` (the end of v1) as `v1.0.0`, and the finished v1.1 work as `v1.1.0`. Tags stay local until the owner pushes them.

### Acceptance criteria for v1.1

- A fresh clone, opened from GitHub Pages, shows the interviewers (not only the drawn face). With the files removed, the drawn face still works.
- `assets/interviewers/NOTICE.md` exists, lists every committed file, and the README links to it.
- "Try the demo" adds the demo questions once. Pressing it again skips them all as duplicates. No network request is made.
- A voice answer shows filler words, words per minute and length against the timer in the summary, with session totals. A typed answer shows no pace. The figures survive a reload (they are in History).
- The History tab shows the trends, sessions per day, the heat map and the streak, with no chart library, and an empty history shows a friendly empty state.
- `node --test tests/` passes locally and in the GitHub Action.
- The pre-publish checklist has been run and its result reported to the owner.

## v1.2: model answer on screen, and a tidier demo card

Two small changes, each its own build step, one commit each. Nothing here adds a dependency, a server or a network call.

### Showing the model answer

17. **Show model answer on the Interview screen.**
    - **Setting:** a new option on the setup screen, "Show model answer with each question". It is saved with `saveSettings`, like the other options, and is **off by default**.
    - **Button:** an Interview-screen button that reads **Show answer** or **Hide answer**. It changes the **current session only** and is not saved. It starts in the state the setting gives, and what the user picks stays for the rest of that session. The saved setting is never changed by it.
    - **The panel:** the question's reference answer is shown in a panel under the question and answer cards. It is full width, labelled **Model answer**, uses a readable font, and scrolls if the answer is long. On narrow screens it stacks below. It is set with `textContent` only, never as HTML.
    - **No reference answer:** the panel says "No model answer saved for this question."
    - **Never spoken.** The interviewer does not read the model answer aloud, and the timer keeps running.
    - **Self-marking:** if the answer is already visible when the answer ends, the separate "reveal" step is skipped (the user has seen it), but the **Got it / Partly / Missed** buttons are still shown.
    - **Coach mode:** allowed. Showing the answer sends nothing extra, and changes nothing about marking.
    - **History flag.** A session where the model answer was visible at any point is recorded with `answersVisible: true` (and each question's result records whether it was visible for that question, `answerShown`). The summary and the History list show a short note, for example "The model answer was visible during this session, so the results may look better than a closed-book attempt." These sessions stay identifiable so that future progress charts can leave them out. The v1.1 progress view is **not** changed by this step: it keeps counting every session, and excluding flagged ones is left for later. Records saved before v1.2 have no flag and count as not visible.
    - **No network call** in either mode. This is local display only.

### The demo card

18. **Questions tab layout.**
    - The **Try the demo** card moves to the **top** of the Questions tab, above Question sets.
    - New wording: "Adds about 20 sample questions to a separate set called Demo: Engineering Manager. It won't change the set you have open."
    - After adding, a confirmation shows how many questions were added, with an **Open demo set** button. The set that is currently open **does not change** (in v1.1 the demo set was opened automatically). Questions that already exist anywhere are still skipped, and the note says how many.
    - If the demo set already exists, the card is replaced by a **one-line note** saying so (it names the set and how many questions it has). It comes back if the demo set is deleted.

### Acceptance criteria for v1.2

- With the setting off, the Interview screen shows a **Show answer** button and no model answer. Pressing it shows the panel for the current and later questions of this session, and leaves the saved setting alone.
- With the setting on, the answer is shown from the first question, and **Hide answer** hides it for this session only.
- A question with no reference answer shows "No model answer saved for this question." Nothing is spoken, the timer keeps counting, and no network request is made (checked in the browser's network tab, in both modes).
- With self-marking on and the answer visible, pressing Next goes straight to Got it / Partly / Missed, with no extra reveal screen.
- A session with the answer shown is flagged, and the summary and the History list show the note. A session where it was never shown has no note.
- Narrow screens show the panel below the cards without sideways scrolling.
- The demo card is the first card on the Questions tab. Adding the demo leaves the open set alone, shows the count and an **Open demo set** button, and a second visit shows the one-line note instead of the card.

## Acceptance criteria for v1

- With no API key, load a .docx with 10 questions, review the extracted pairs, and run a Practice session with difficulty, timer and order.
- In Practice mode no request is sent to any AI service.
- Coach mode is disabled with a note until an API key is saved in Settings.
- Hear each question, answer by voice, and see the live transcript.
- In Coach mode, receive a score and feedback per answer within a few seconds.
- See a summary at the end, and find the session on the History tab after reloading the page. Open it to see the answers and feedback, delete one session, and clear the history.
- Keep three or four question sets, tick two of them, and run one session with questions from both.
- Move a question to another set, and see that it is no longer in the old set. Loading a document that repeats an existing question skips it.
- Export sets to a file, clear the browser data (or use a different browser), import the file, and get the same sets back.
- With clips installed in `assets/interviewers/`, pick the interviewer on the setup screen and see the person listen while you answer and talk while the question is read. With no clips, the drawn face still works.
- With self-view on, see your own mirrored camera picture. The camera light goes off when the session ends.
- Everything works on Chrome on a laptop; typing works on a phone.
