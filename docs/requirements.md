# InterviewPal: Requirements

A daily mock-interview practice tool. You load your own Q&A notes and an animated interviewer asks the questions aloud. You answer by voice or typing. There are two modes: **Practice** (no AI, no key, no feedback) and **Coach** (Claude scores your answer against your notes).

## Status

**v1 is complete.** All eleven build steps are done (see "Build order"). The owner tested the app in Chrome on a laptop (Practice and Coach modes, question sets, History, the interviewer faces, self-view and voice answers). It is also tried on a real phone and works well, and it is published on GitHub Pages at https://mehulp.github.io/interview-pal/. Not yet verified: Safari and iPhone. Items in "Deferred to v2" and "Later" are not built. **v1.1 ("make it publishable") is complete**; see the section of that name below. It is tagged `v1.1.0`, and the end of v1 is tagged `v1.0.0` (commit `7417913`). The README screenshots are in (the demo GIF was skipped). **v1.4 (record video, download only) is built** (not yet tagged or pushed); see "v1.4" below. **v1.3 (record and replay answers) is built** (not yet tagged or pushed); see "v1.3" below. **v1.2 is built** (not yet tagged or pushed): the model answer on the Interview screen, the tidier "Try the demo" card, and the same question in more than one set. See "v1.2" below.

## Decisions (defaults confirmed)

| Topic | Decision |
|---|---|
| Modes | Practice (default, no AI, no API key) and Coach (AI, needs an API key) |
| Document formats | .md, .txt, .docx, .pdf |
| Question sets | Several named sets (for example Leadership, Technical). A question text is unique within a set, but the same question can be in several sets (from v1.2). Sets are picked at the start of a session, so any combination can be practised. Sets can be exported and imported as a JSON file |
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
    - **Unique within a set; the same question may be in several sets (from v1.2).** A question text (ignoring case and extra spaces) can exist only once inside one set, so loading a document, importing a file or adding the demo skips questions that already exist **in the set they are going into**, and reports how many were skipped. The same question can also be in other sets, each copy with its own answer, topic and level, so for example the demo set never stops a question from reaching your own set. (Before v1.2 a question could exist in only one set across all sets; saved data needs no change.)
    - **Move to set** takes a question out of one set and puts it into another. If the target set already has that question, the question is just removed from the old set, the target's copy is kept as it is, and the message says so.
    - **Repeats are removed when a session starts.** If several ticked sets (or a hand-edited set) hold the same question, it is asked once. The copy kept is the first one, in the order the sets are listed, that has a model answer; if none has one, the first. The count on the setup screen and the number of questions asked use the list after repeats are removed. History records the set the kept copy came from.
    - At session setup the user ticks one or more sets. The questions of all ticked sets form one pool (without repeats, see above), and order, question level, difficulty and count apply to that pool. The last choice is remembered.
    - **Backup:** "Export sets" saves all sets to a `.json` file. "Import sets" reads such a file. Sets with a name that already exists are merged into it, new names create new sets, and questions that already exist in the set they would be merged into are skipped. Files that are not valid InterviewPal exports are rejected with a clear message and change nothing.

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
- A question can be edited by hand into a duplicate of another question in the same set. This is not blocked when editing, but the repeat is removed when a session starts (see "Repeats are removed when a session starts").
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
| `src/sets.js` | Question set rules: duplicates within a set, move, export and import checking (no page code) |
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

- The camera (self-view) is used only to show a picture on your own screen. Frames are never recorded, stored or sent anywhere. The one exception is the optional video recording in v1.4: the camera is recorded only while the user is recording with Include video ticked, the video is never stored by the app, and the only way to keep it is the user's own Download. Nothing is uploaded.
- Recordings of answers (v1.3) are saved only on request, only in this browser's storage, and never uploaded. See "v1.3".
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
    - Nothing is recorded or sent anywhere. Delivery analytics never process or keep audio; only numbers. (The separate, optional recording feature in v1.3 saves audio locally only when the user presses Save.)
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

## v1.2: model answer on screen, a tidier demo card, and questions in more than one set

Three changes, each its own build step, one commit each. Nothing here adds a dependency, a server or a network call.

### Showing the model answer

17. **Show model answer on the Interview screen.** (done)
    - **Setting:** a new option on the setup screen, "Show model answer with each question". It is saved with `saveSettings`, like the other options, and is **off by default**.
    - **Button:** an Interview-screen button that reads **Show answer** or **Hide answer**. It changes the **current session only** and is not saved. It starts in the state the setting gives, and what the user picks stays for the rest of that session. The saved setting is never changed by it.
    - **The panel:** the question's reference answer is shown in a panel under the question and answer cards. It is full width, labelled **Model answer**, uses a readable font, and scrolls if the answer is long. On narrow screens it stacks below. It is set with `textContent` only, never as HTML.
    - **No reference answer:** the panel says "No model answer saved for this question."
    - **Never spoken.** The interviewer does not read the model answer aloud, and the timer keeps running.
    - **Self-marking:** if the answer is already visible when the answer ends, the separate "reveal" step is skipped (the user has seen it), but the **Got it / Partly / Missed** buttons are still shown. (A question with no reference answer has nothing to mark against, so, as before, it is not offered for self-marking.)
    - **When it counts as visible:** only while the question is open (being asked or answered). Turning it on while marking or reading Coach feedback happens after the answer is given, so it does not flag the session.
    - **Coach mode:** allowed. Showing the answer sends nothing extra, and changes nothing about marking.
    - **History flag.** A session where the model answer was visible at any point is recorded with `answersVisible: true` (and each question's result records whether it was visible for that question, `answerShown`). The summary and the History list show a short note, for example "The model answer was visible during this session, so the results may look better than a closed-book attempt." These sessions stay identifiable so that future progress charts can leave them out. The v1.1 progress view is **not** changed by this step: it keeps counting every session, and excluding flagged ones is left for later. Records saved before v1.2 have no flag and count as not visible.
    - **No network call** in either mode. This is local display only.

### The demo card

18. **Questions tab layout.** (done)
    - The **Try the demo** card moves to the **top** of the Questions tab, above Question sets.
    - New wording: "Adds about 20 sample questions to a separate set called Demo: Engineering Manager. It won't change the set you have open."
    - After adding, a confirmation shows how many questions were added, with an **Open demo set** button. The set that is currently open **does not change** (in v1.1 the demo set was opened automatically). Questions that already exist anywhere are still skipped, and the note says how many.
    - If the demo set already exists, the card is replaced by a **one-line note** saying so (it names the set and how many questions it has). It comes back if the demo set is deleted.

### Questions in more than one set

19. **Allow the same question in several sets.** (done) Replaces the v1 rule that a question can exist in only one set across all sets. Reason: after adding the demo set, a question in the user's own notes could be skipped as a duplicate of the demo's and never reach the user's own set, so it (and the user's own model answer) was missing from practice sets.
    - **Loading, importing and the demo** skip a question only if the target set already holds it. The skip message names the set ("already in this set"), not another set.
    - **Move to set**, **repeats removed at session start** and the **setup count**: as described under "Question sets" (item 13).
    - **The pool builder** (`src/session.js`) does the removal of repeats, as a pure, tested function. The copy kept is the first, in set order, that has a model answer (otherwise the first).
    - **Code that changes:** `src/sets.js` (the duplicate check is per set; move; messages), `src/session.js` (the new repeat removal) and where the setup screen counts questions, plus tests for all three. Export and import file formats do not change. Saved data needs no migration.
    - **Docs that change with it:** this file, the README (Questions tab, backup and limitations), `docs/architecture.md` and `docs/architecture.html`.

### Acceptance criteria for v1.2

- With the setting off, the Interview screen shows a **Show answer** button and no model answer. Pressing it shows the panel for the current and later questions of this session, and leaves the saved setting alone.
- With the setting on, the answer is shown from the first question, and **Hide answer** hides it for this session only.
- A question with no reference answer shows "No model answer saved for this question." Nothing is spoken, the timer keeps counting, and no network request is made (checked in the browser's network tab, in both modes).
- With self-marking on and the answer visible, pressing Next goes straight to Got it / Partly / Missed, with no extra reveal screen.
- A session with the answer shown is flagged, and the summary and the History list show the note. A session where it was never shown has no note.
- Narrow screens show the panel below the cards without sideways scrolling.
- Load the same question into two different sets: both keep it. Load it into the same set again: it is skipped, and the message says it is already in that set.
- Add the demo set, then load notes containing a demo question into your own set: your set gets it, with your own answer.
- Tick two sets that share a question: it is asked once, the setup count counts it once, and the copy with a model answer is the one used.
- Move a question into a set that already has it: it leaves the old set, the target is unchanged, and the message says so.
- The demo card is the first card on the Questions tab. Adding the demo leaves the open set alone, shows the count and an **Open demo set** button, and a second visit shows the one-line note instead of the card.

## v1.3: record and replay your answers

Approved by the owner. Optional audio recording of spoken answers, saved only when the user chooses, with an optional target length. Built as the steps below, one commit each. No backend, no new dependency, no upload.

### Product decisions (approved)

- **Explicit and optional.** The microphone is requested only when the user presses Record, never on page load. Nothing is saved without pressing Save.
- **Storage:** the browser's IndexedDB, on this computer. Every saved attempt also has a **Download** button that gives an ordinary audio file. There is no backend and no folder picker.
- **Target length:** off by default. Presets 1 min, 90 sec, 2 min and 3 min, or a custom number of seconds. Reaching it shows a visual alert and recording continues.
- **Maximum length:** 10 minutes, then recording stops by itself.
- **Several attempts per question.** They are listed on the History tab and can be reached from the current question on the Interview screen.

### How it works

- **Recorder panel (Interview screen).** Record is enabled only while the question is in its answering phase, so the interviewer's voice is not recorded. While recording it shows the elapsed time, the time remaining against the target, and **which microphone is in use**. Elapsed time comes from timestamps, so a background tab stays accurate. At the target the panel changes colour and says "Target reached", then "+m:ss over". There is no sound, and no animation when "reduce motion" is on. At 10 minutes it stops by itself.
- **Chosen microphone.** The microphone chosen on the Interview screen is used. If it cannot be opened, the default microphone may be used instead, but the panel then says so and names the device. The device name is saved with the attempt.
- **Recording ends** on Stop, Next, Skip, the difficulty timer ending, End session, and any tab navigation. The microphone is released every time. A recording stopped by a lost microphone keeps what was recorded and says so.
- **Review.** A stopped recording is an **unsaved attempt**, shown in a shared panel that stays visible on every tab, labelled with the question it belongs to. It has a player, **Save**, **Discard**, **Download** and **Retry**. There is one unsaved attempt at a time: Record is off until it is saved or discarded.
- **Question association.** The question is captured when recording starts (not when it ends) and travels with the attempt. If the user has moved to another question, the previous attempt can only be saved or discarded (and downloaded). **Retry** is offered only while the original question is still the active one and the practice state allows recording.
- **Page exit.** Leaving or closing the page while recording or with an unsaved attempt shows the browser's "leave site?" warning. This is only a warning: an unsaved recording is **not** recovered after a crash or a forced close.
- **Failed save.** If saving fails (storage blocked, full, or other), the audio is kept so the user can try Save again or Download it. The message says what went wrong in plain words.
- **Saved attempts** show the date, the question, the target length (or none) and the actual length. Each can be played (with seeking), downloaded or deleted (after a confirmation). Listing them loads only the details, never all the audio; audio is read only when one is played or downloaded.

### Linking, editing and re-import

An attempt is linked to a question by the question's **normalised text** (the same comparison `sets.js` uses), and a copy of the text and the set name are saved with it. Question ids are not used, because they change on import. If the question is edited, the recording stays under its old text. If the question is deleted, the recordings are kept, and the user deletes them explicitly. Loading the same question again links it to its old recordings again.

### Storage, persistence and privacy

- Recordings live in IndexedDB under the browser profile and **the exact address (origin, including the port)**. Another address (`localhost:8010` vs `localhost:8000`, `127.0.0.1`, or the published site) or another browser has its own, separate recordings. Clearing site data, or the browser clearing storage when the disk is low, deletes them. The app asks the browser for persistent storage once, but the browser may decline or not support it, and the app says which. **Download** is the way to keep an important attempt.
- Audio and details are saved together in one step, so there is no half-saved attempt. The details are in a separate store from the audio so lists stay light.
- **The recording feature adds no audio upload and no network request.** It is separate from voice answers: when the user presses 🎤 Answer, the browser's speech recogniser works exactly as before, and in Chrome that sends audio to Google's speech service (see the notes above and the README). The app makes no claim that audio never leaves the browser.
- Delivery analytics are unchanged: they use only the answer text and timings and never process audio.
- Recording and voice answers can be used at the same time. Both use the microphone; this has not been tested with every headset. **Repeat question** while recording would record the interviewer's voice too, so record after the question has been asked.

### Build steps

20. **Docs and rules** for this feature (this section, README, CLAUDE.md, architecture). (done)
21. (done) **`src/recordings.js` and tests.** Pure: choosing a supported audio format, recorder states, time and target maths, question snapshot, retry rule, validation, file names, grouping.
22. (done) **`src/recordstore.js`.** The IndexedDB adapter: details and audio in separate stores, saved and deleted together, listing without audio, plain error kinds (unavailable, full, other), persistent-storage request.
23. (done) **`src/recorder.js` and the recorder panel** (record, stop, timer and target alert, device name, errors, late permission answers).
24. (done) **Review panel, saving and lifecycle:** shared panel, Save, Discard, Download, Retry rules, failed-save retry, page-exit warning, hooks into the practice flow, saved attempts for the current question.
25. (done) **History "Recordings" card and playback** (seeking, one player at a time, object URLs released), docs, changelog and architecture updates.

### How it was checked, and what is still open (v1.3)

- **Checked in headless Chromium with a fake microphone:** record, target alert, stop, replay, seeking, save, reload, History listing, playback, download, delete; question association (Next while recording, Retry only for the original question); Skip, End session and tab switching; the page-exit warning; pending permission answered late, repeated clicks, Cancel; permission denied and no microphone; a chosen microphone that is missing (fallback named); microphone lost mid-recording; the 10-minute limit; failed save (quota) then retry; unavailable storage; object URLs released on discard, replace, delete and redraw; reduced motion; phone width; no network requests. Both the WebM/Opus format (Chrome's default) and the MP4 format (forced, as Safari would use) were recorded and replayed with seeking.
- **Still needs a real microphone and browser:** how a real headset sounds and behaves; recording and voice dictation together; a Bluetooth headset in call mode; Safari, Firefox and phones (only Chromium was run); a very long (10-minute) recording; persistent storage on a real profile.

### Acceptance criteria for v1.3

- The microphone prompt appears only after pressing Record. With the microphone denied, missing or unplugged, a plain message appears and typing still works.
- Recording shows elapsed and remaining time and the microphone name. At the target an alert appears and recording continues. At 10 minutes it stops.
- A finished recording can be replayed (including seeking) before saving. Discard and Retry free the audio and the player, and the microphone light goes off.
- Saved attempts survive closing and reopening the browser, list with date, target and actual length, and can be played, downloaded and deleted.
- An attempt is never shown under a different question than the one it was recorded for, even after moving on or an asynchronous delay. Retry appears only for the original active question.
- Next, Skip, End session and switching tabs stop a recording. An unsaved attempt stays reachable from every tab. Leaving the page warns.
- A failed save keeps the audio, allows another Save and Download, and says why.
- Listing attempts does not load their audio. Object URLs are released when players are replaced or removed.
- No network request is made by the recording feature.

## v1.4: record video (download only)

Approved by the owner. An optional extension of the v1.3 recorder: record the camera as well as the microphone, and keep the result **only as a downloaded file**. (Revised after the first version: it does **not** take over the screen. See "Nothing takes over the screen".)

### Product decisions (approved)

- **Video is optional and explicit.** A box **Include video**, unticked each time the page loads, sits in the recorder panel. Nothing records the camera unless that box is ticked and Record is pressed. Camera self-view stays on screen only and never records on its own.
- **Never stored in the browser.** A video recording is not saved to IndexedDB or anywhere else the app keeps data. There is no Save button for video. The only way to keep it is **Download**, which saves an ordinary video file to the computer. The app also refuses to save a video through the audio store.
- **Maximum length 7 minutes** (audio recording keeps its 10 minutes). Modest quality (about 1 Mbps at up to 720p) so files stay a sensible size, roughly 7 MB a minute.
- **The file contains only the user.** The recording is the camera and the microphone and nothing else: no interviewer, no screen, no notes. (The saved file is not mirrored.)
- **Nothing takes over the screen.** While recording video the page stays exactly as it is, so the user can still see the interviewer, the question, the model answer, notes and the timers. The only addition is a **small mirrored preview** of the camera in the recorder panel (with the clock, the target alert and the Stop button already there), so the user can check they are in frame. There is no full-screen view and no request for full screen.
- **Reuse of the self-view camera.** If self-view is on, the recording takes a copy of its camera track instead of opening the camera again. Stopping the recording leaves self-view as it was.
- **Nothing is uploaded and nothing analysed.** Camera frames are never sent anywhere and never analysed.

### How it works

- Everything about timing, targets, the alert, the microphone name and its fallback notice, question association, Retry rules and stopping on Next, Skip, End session and tab changes works as for audio (see v1.3). The target alert shows in the recorder panel, as for audio.
- After Stop, the **unsaved-recording panel** (on every tab) shows a video player with seeking, **Download** as the main action, **Retry** (same rules as audio) and **Discard**. Until the video has been downloaded, leaving the page shows the browser warning, and Discard asks for confirmation. Once it has been downloaded, neither happens.
- The file name uses the question and the date, with the real format's extension (for example `.webm`, or `.mp4` where the browser records that).
- Failure cases are as for audio, with camera wording: camera or microphone blocked, no camera, camera in use, camera disconnected mid-recording (what was recorded is kept and can be downloaded), the 7-minute limit.
- The History tab's Recordings card lists audio recordings only. Videos are not in it, because the app does not keep them.

### Privacy and wording

- Video recording adds no upload and no network request. Camera frames are recorded only while recording video, and the file exists only in memory until the user downloads it. Closing the page or discarding loses it, and the browser warns first (a warning only, not recovery after a crash).
- A downloaded video is an ordinary file on the user's disk and is outside the app's control. It contains the user's face and voice, so it should be kept private.
- As in v1.3, the app makes no claim that audio never leaves the browser: voice answers still use the browser's speech recogniser.

### Build steps

26. **Docs and rules** (this section, README, CLAUDE.md camera rule, architecture). (done)
27. (done) **Pure rules in `src/recordings.js`** and tests: video formats, 7-minute cap, extensions, "videos cannot be saved in the browser", camera error wording.
28. (done) **`src/recorder.js` video support** (camera and microphone together, track copy from self-view, tracks released) and a `getVideoTrack()` on self-view.
29. (done) **Small preview, the video review panel and download-only flow** in `src/recpanel.js`, `index.html` and `styles.css`; the store refuses video.
30. (done) **Docs, architecture and changelog final; checks.**

### How it was checked, and what is still open (v1.4)

- **Checked in headless Chromium with a fake camera and microphone:** Include video off by default and audio unaffected; one permission request for camera and microphone; no full-screen request and no overlay; only one camera track and one microphone track are captured (no screen capture); the interviewer, question, timer and model answer stay visible and usable while recording (the model answer was opened and typing worked during a recording); the small preview is mirrored, muted and no wider than 260 pixels; the clock and the target alert in the recorder panel; Stop removes the preview and both camera and microphone are released; the video replays and seeks; nothing is written to the browser store (counted); the store itself refuses a video; the page-exit warning and the Discard confirmation until the video is downloaded, and neither after; the download's file name and extension; Next while recording (labelled with the original question, no Retry, no Save); Retry for the same question; self-view's camera is not opened a second time and self-view carries on afterwards; camera permission denied; the 7-minute limit; the camera disconnected mid-recording; phone width. No network requests and no page errors.
- **Still needs a real camera and browser:** how the real camera and microphone look and sound; a 7-minute recording and its file size; the downloaded file playing in your usual player; Safari, Firefox and phones (only Chromium was run).

### Acceptance criteria for v1.4

- Include video is off by default. With it off, nothing about audio recording changes, and the camera is not touched.
- With it on, pressing Record asks for camera and microphone (once), then the recorder panel shows a small mirrored preview of the camera. The rest of the page does not change: the interviewer, the model answer, notes and timers stay visible and usable, and nothing goes full screen. The file contains only the camera and microphone.
- A recording stops at 7 minutes by itself, and on Next, Skip, End session and tab changes, exactly as audio does. The camera and microphone lights go off.
- After Stop the video can be replayed and sought, and downloaded. There is no Save button, and nothing is written to IndexedDB (checked).
- Leaving the page or discarding warns until the video has been downloaded.
- Self-view still works afterwards if it was on. If self-view was on, no second camera open is needed.
- No network requests are made by the feature.

## UX redesign — Step 1: Reliability (unreleased)

First step of the redesign proposed in `docs/InterviewPal_UX_Code_Review.md`. It changes how sessions end, how startup and the camera cope with things finishing late, and how the Questions screen reports saving and importing. **No appearance or layout change** and no change to the answer flow. Not assigned a version yet.

### Behaviour

- **Leaving a session asks first.** Clicking another tab (Questions, History, Settings, or the Settings link) during a session shows a confirmation. **Cancel** carries on with the interview and leaves the answer, the timer and any recording exactly as they were. **OK** ends the session and leaves. Nothing is asked when no session is running, on the summary screen, or while startup is still in progress (that is simply cancelled).
- **One way to end a session.** The End session button, the Coach screen's End button and the leave confirmation all use the same path, which runs once however many times it is triggered. It waits (briefly, as Next does) for the last spoken words, then ends the session and shows the summary. No new question is asked and no new Coach request is started.
- **An answer already being submitted is finished first, once.** If Next, Skip or the time limit had already been triggered, that submission completes with its original outcome (answered, skipped or timed out) before the session ends. It is never relabelled incomplete. If Coach marking had not finished, the score stays unset.
- **Unfinished answers are kept as incomplete.** If a non-empty answer (typed or spoken) had been started but not submitted when the session ends, it is saved as a result marked `incomplete: true`, with the text exactly as it stood after the final spoken words arrived. It is excluded from Coach scores and averages, self-mark totals, weak-topic analysis (topics to revisit, the Progress heat map) and delivery figures. It is never sent to Coach. The summary and the History list show it as "incomplete", with the words that were written. Old History records have no such flag and display as before.
- **Recordings are unaffected by ending.** A recording in progress is stopped and becomes the pending attempt, still labelled with the question it was recorded for. A recording with no written or spoken text does not create a result: it is not mistaken for a submitted answer. Audio and video storage rules are unchanged.
- **Startup is guarded.** Pressing Start stays disabled until the first question begins, so a double click cannot start two sessions. If the user leaves the Interview tab while the interviewer's face or the voice are still loading, startup is cancelled: no hidden session starts, nothing is spoken, and returning to the Interview tab shows the setup screen again.
- **Camera self-view cannot reopen late.** If self-view is switched off, or the session ends, before the camera permission is answered, the camera that arrives is released immediately. Pressing self-view repeatedly never makes more than one camera request at a time.
- **Questions are saved honestly.** If saving the sets fails (storage blocked or full), the Questions screen says so, keeps the edits on the page, and offers **Try saving again**. Messages such as "Moved" or "Renamed" never claim more than was done: when the change is not saved they say so.
- **Loading notes keeps its destination.** The set is fixed when **Find questions** is pressed. Changing the open set while the notes are being read does not redirect them. If the set was deleted meanwhile, nothing is added and the message says why. The button and status are restored whether reading succeeds or fails, and a second click while reading is ignored.

### Tests

Unit: the leave rule and the unfinished-answer rule (`session.js`), the incomplete flag and its exclusion from scores, self-mark totals, weak-topic analysis and delivery totals (`history.js`, `progress.js`, `delivery.js`), and self-view with a deferred permission (`selfview.js`). Browser (scripted, headless Chromium): Cancel keeps answer, timer and recording; OK saves an incomplete answer; no duplicate History after leaving twice; End while speech is still arriving; Next then End (original outcome, no advance, no Coach request); double End; a recording with no text; startup cancelled and double-clicked; late camera permission; failed save and retry; import with a changed or deleted destination, and button restoration.

### How it was checked (Step 1)

Unit tests (113 in all) and scripted headless-Chromium checks passed for: Cancel keeping answer, timer and recording; OK saving an incomplete draft with the words that arrived late; no duplicate History when leaving again or from the summary or setup (no prompt there); Next, Skip and time-limit expiry followed by End (original outcome kept, no next question, no marking, no Coach request, score left unset, late Coach reply ignored); a double-clicked End and Start; a recording with no words (no result, recording kept with its original question, microphone released); startup cancelled by leaving; a late camera permission released; a failed save reported with retry; notes import with the set changed or deleted during reading, and a read failure. The recording, video, model-answer and shared-question features were re-checked as regression.

**Still needs a real browser and hardware:** the confirmation box as Chrome shows it; ending while really speaking into a microphone (the speech engine was replaced by a stand-in whose last words arrive late); allowing a real camera prompt after ending; a blocked or full real browser storage.

### Limits of this step

The confirmation is the browser's plain OK/Cancel box (labelled buttons come with the later layout work). A session that was ended cannot be resumed. Exact links between recordings and individual session results are not added. Summary wording such as "questions asked" is unchanged.

## UX redesign — Step 2: Shared appearance and colour themes (unreleased)

Second step of the redesign in `docs/InterviewPal_UX_Code_Review.md`. It changes **colours and the header only**. Interview layout, widths, typography, timing, recording consent, session flow, question editing and Coach behaviour are untouched. Not assigned a version yet.

### Themes

Settings has a new **Appearance** section at the top, with four light themes. Cards are always white; the page background, text and accent come from the theme.

| Theme (id) | Page | Text | Accent |
|---|---|---|---|
| Sage & Forest (`sage`, the default) | `#F6F7F2` | `#24332C` | `#35634D` |
| Warm Teal (`teal`) | `#F5F7F7` | `#243438` | `#176B70` |
| Muted Plum (`plum`) | `#F7F5F8` | `#332D3B` | `#715185` |
| Classic Blue (`blue`) | `#F6F7FB` | `#1D2433` | `#3B5BDB` |

- **Theme picker.** Four preview cards built from native radio inputs in one fieldset. Each shows its name, a short description and swatches of its page, card, text and accent colours. The chosen card is marked with a visible tick and the word **Selected** and a thicker border, so selection never depends on colour alone. Arrow keys move between cards; the focused card has a clear focus ring.
- **Applies at once, everywhere.** Choosing a card changes every screen immediately, with no reload.
- **Saved as one validated ID.** Only a valid theme ID is stored, as the `theme` setting through `saveSettings` (merged, so other settings are untouched). A missing, unknown or unreadable value means Sage & Forest. If the browser refuses to store it, the new theme still applies for this visit and the screen says it will not be remembered.
- **No flash of the wrong theme.** A tiny classic script in the page head (`src/theme-boot.js`) sets the saved theme before the page is first drawn. It reads the one `theme` setting directly from the settings key, which is a **narrow exception** to the rule that everything saved goes through `storage.js`; it lists the valid IDs itself, and a test checks that list matches `src/themes.js`. Without the script, or with unreadable storage, the page simply starts in Sage & Forest.
- Changing the theme never asks for the microphone or camera and never touches other settings.

### Colour roles

All interface colours come from semantic variables, defined once per theme in `styles.css`: page, surface, subtle surface, reference surface, text, muted text, border, strong (control) border, accent, accent hover, accent foreground, selected background and border, focus, and danger, warning and success (each with a tinted background). Hard-coded colours in the stylesheet and in generated markup (the Progress charts, the recording panels, alerts) are replaced by these. **Not recoloured:** portraits and clips, the drawn fallback face, camera feeds and recorded media, and the heat-map's weak-to-strong shading (data colours, shown with the percentage in words).

- **Header and navigation.** A white header with a subtle bottom border. The active tab has a restrained accent treatment (tinted background, accent text, an underline and heavier weight), not just a colour change.
- **Buttons.** Primary actions stay filled with the accent; secondary actions are quieter outlines. Meaning and placement are unchanged.
- **Status colours** are the same in every theme and always come with words or a symbol (for example the low-time warning symbol before the countdown, and "Selected", "Recording", "not saved" texts).
- **Contrast** (checked from the stylesheet by a unit test, for every theme): text 7:1 or better on the page, cards, subtle and reference surfaces; muted text and the accent used as text 4.5:1 or better on all of them; white text on the accent and its hover colour 4.5:1 or better; focus ring and control borders 3:1 or better; status text 4.5:1 or better on its tinted background.

### Tests

Unit: theme ID validation and the default; the boot script (valid, unknown, missing, unreadable and throwing storage) and that its ID list matches `themes.js`; every theme defines every colour role; every contrast target above, computed from the stylesheet. Browser (`tests/browser/appearance.mjs`): all four themes on every screen, persistence across reload, unknown and missing preferences, blocked storage, keyboard use, phone width and 200% zoom, computed contrast on rendered controls, other settings preserved, and that no camera or microphone was requested.

### How it was checked (Step 2)

125 unit tests (including the theme and contrast tests) and the scripted browser check `tests/browser/appearance.mjs` passed. The browser check covers: the default; the picker's markup and its "Selected" word; each theme applying at once and saving only its ID while every other setting is untouched; the head script restoring the theme with the app's own scripts blocked; unknown, wrongly typed, missing and damaged saved values; blocked and throwing storage; arrow-key selection and visible focus rings; every visible piece of text on eleven screens and states (settings, questions, setup, an active interview with the reference answer showing, a recording in progress, an unsaved recording, self-marking, the summary, Coach feedback, History with the Progress charts, and a past session) in all four themes at 4.5:1 (3:1 for large text), no sideways scrolling on any of them; the four main screens at 390 px wide and at a 640 px window at double scale (200% zoom); and that no camera or microphone was requested by changing or showing themes. Pictures of every state in each theme are in `docs/images/themes/`.

**A bug found and fixed on the way (not caused by this step):** with a real microphone listed in the Microphone drop-down, the Interview setup was wider than a 640 px window (669 px), already so before Step 1. Allowing grid items and drop-downs to shrink fixed it, with no change to the layout.

**Still needs a person and a real browser:** how each theme looks on your own screen and in daylight; Safari and Firefox (only Chromium was run); a Windows high-contrast or forced-colours mode; and the check that your saved choice survives closing and reopening Chrome.

### Limits of this step

No dark mode, colour picker or new fonts. Existing widths and type sizes are kept; the workspace layout comes in Step 3. Contrast was checked for the interface colours above, not as a full accessibility audit.

## UX redesign — Step 3: Interview workspace and recording review (unreleased)

Third step of the redesign in `docs/InterviewPal_UX_Code_Review.md`. It changes how the **live interview, the recording review and the summary are laid out and presented**. Setup, the other screens, timing, pressure rules, Coach behaviour, and the answer lifecycle (Answer/Stop, Next, Repeat, Skip, self-marking) are unchanged; Start answer / Finish answer is Step 4. No version assigned yet.

### Desktop layout

- **A wider container only for the live interview** (up to about 1280 CSS pixels). Setup and the other screens keep their widths.
- **Two columns when there is room** (about 960 px and wider): the interviewer column on the left, about 35–40% of the width (a column of roughly 360–440 px on roomy screens), and the **answer workspace** on the right. The portrait stays large, because eye contact is a core goal; on roomy, tall screens it stays in view while the workspace scrolls.
- **Interviewer column:** the portrait (with the self-view picture, or the video-recording preview, in its corner), the line the interviewer just said, and the quiet supporting notes (the chosen voice, camera messages). The Self-view button sits here because it is about the camera.
- **Answer workspace, top to bottom:** progress and the countdown; **the current question as a prominent heading** (it stays through answering, self-marking and Coach feedback); then the reference and response panels; the response controls; the recorder; and the recording review. The reference therefore sits beside the portrait, near the top of the screen, not below both columns.
- **Narrow screens** (under about 960 px): everything stacks in one column: a compact interviewer, the question, the answer content, the controls. No fixed heights that could clip content on short screens or at 200% zoom; no bars fixed to the bottom of the screen, so actions stay reachable with the phone keyboard open.

### Reference answer and your response

- When the reference is on (the setting, or the Show answer button: both unchanged), the workspace shows **Reference answer** and **Your response** as two clearly labelled panels. **With room** (the two-column layout, about 960 px and wider) they are stacked, the reference above the response, so someone typing never has to click to find the box. **On narrow screens** they become two tabs, to save height, using the standard accessible tab pattern (arrow keys, Home and End); the reference is selected when it is first shown, and later questions keep whichever tab you chose (so someone who types stays on their response). When the reference is off there is only the response.
- **Typed text is never lost or moved:** switching tabs keeps the draft exactly as it is and does not move focus. The Your response tab shows the number of words so far, so progress is visible while reading the reference; spoken words keep flowing into the response while the Reference tab is open.
- **"Viewed" means actually displayed.** The `answerShown` flag (and so the History note) is set only while the Reference panel is on screen during the answer (with room: whenever the reference is on; on narrow screens: while its tab is open, so a question answered on the Your response tab is not marked as having had the reference seen). Starting a session scrolls to the top of the interview. Having the reference available but never selecting it does not count; once shown, it stays recorded for that question.
- **Reading comfort:** about 18 px text, 1.6 line spacing, a restrained themed surface, and a readable line length. On roomy desktops a long reference scrolls inside its own panel; the panel is a named region reachable by keyboard. On short screens or at high zoom it simply grows with the page.
- **Self-marking** is unchanged: after Next the question stays on screen, the reference is shown (once) and the Got it / Partly / Missed buttons follow.

### Controls

Response actions are grouped: the main pair (Answer/Stop and Next) first, then quieter secondary buttons (Repeat question, Skip, Show/Hide answer). **End session** is separate, at the foot of the workspace and visually quiet, so it is never next to routine progression. Hard difficulty still hides Repeat and Skip. The recorder panel is more compact (one row of controls), with the consent wording kept as a short supporting line.

### Recording review and preview

- **One review panel, reused.** The existing player and its buttons (Save audio, Download, Retry where applicable, Discard) live inside the answer workspace during the interview, under the controls, so they are reachable during self-marking and Coach feedback too. The same player elements are moved, never duplicated. There is still only one pending recording, with the same storage rules, loss warnings and navigation safeguards.
- **No forced scrolling.** When a recording finishes the page does not move and focus does not move; the review panel appears in place and its status line is announced politely.
- **A compact indicator** appears in the page header whenever a recording is pending and its review is not on screen (on other tabs, on the setup screen, or on the summary): a short line naming the question, with an **Open review** button. Opening it shows the same review panel at the foot of the page and moves focus to it; **Hide review** puts it away. The summary is never displaced by it.
- **Earlier questions are labelled.** If the pending recording belongs to an earlier question, the review says so in its heading and its text, shows that question's words, and offers Retry only when its question is still the active one.
- **One live camera picture at a time.** While video is recording, the only live picture is the recording preview, in the portrait's corner; it is the stream being recorded. If self-view is on, its picture is hidden meanwhile but its camera and state are untouched, and it comes back when the recording ends. **Hide preview / Show preview** only hides the picture. A **"● Recording video"** line (and "● Recording audio" for audio) stays visible under the portrait whatever the preview is doing. Permissions and track ownership are as before (the recorder copies self-view's track and never stops it).

### Session summary

When the session ends the live interview (portrait and workspace) is replaced by a **full-width summary** with the closing line at its top, and keyboard focus moves to the summary heading. A pending recording is not shown above or inside it; the header indicator is its way in.

### Behaviour changes in this step

Only what is listed above: the reference/response tabs and the stricter "viewed" rule, the new places for Self-view, End session and the recording review, one preview at a time, no forced scroll, the header indicator, the full-width summary with focus on its heading, and a word count and a "● Recording" line as small supporting aids. Nothing in timing, submission, Coach, storage or consent changes.

### Tests

Browser (`tests/browser/workspace.mjs`): the layout at desktop, a short laptop viewport, 390 px and a 640 px window at double scale; the reference alongside the portrait; tabs, keyboard use, preserved drafts and focus; reference shown or hidden and the `answerShown` flag in History for each case (including available but never displayed); long questions and long references; self-marking and Coach feedback with the question and review visible; recording in progress, pending audio and video, an earlier question's pending recording, the indicator and Open review; no scroll or focus change when a recording finishes; one preview and one set of players; both camera tracks released; the summary. Earlier browser checks are updated where the markup moved.

### How it was checked (Step 3)

125 unit tests and the scripted browser checks passed, the new one being `tests/browser/workspace.mjs`: desktop (1366 x 800) and a wide 1920 x 1000 window, a short 1280 x 560 laptop window, 390 px wide, and a 640 px window at double scale; the container width, two columns, the 340–440 px portrait column, the question heading, the reference beside the portrait, stacked panels with room and accessible tabs on narrow screens (arrow keys, Home and End, preserved draft, no focus theft, word count, resizing across the breakpoint with the draft kept); the reference size, line spacing, scroll region and keyboard scrolling; each way the reference can be shown or not, and what History records (never shown, on from the start, toggled on and off across three questions, seen only while self-marking, and available but never displayed on a narrow screen); long questions and long references; self-marking and Coach feedback with the question on screen; video recording with and without self-view (one live picture, the preview is a copy of the camera track and carries camera and microphone, self-view hidden and restored, both recording tracks released and self-view's still live, Hide preview keeping the Recording line); pending audio and video in the workspace, an earlier question's recording (labelled, no Retry, saved under the original question); a recording that finishes while the person is typing (no scroll, no focus move, announced politely); the header indicator, Open review, Hide review and focus; the summary full width with focus on its heading and not displaced by the review; one id per element, one audio and one video player; nothing fixed to the screen on a phone; reduced motion; and text contrast in all four themes. The earlier browser checks were updated where markup moved and still pass. Screenshots are in `docs/images/workspace/`.

**Found and fixed on the way:** starting a session left the page scrolled partway down from the setup screen (it now starts at the top); the review buttons did not wrap on a phone and widened the page; and the reference/response tab reset on every question, which made phone typists click again each time (it now keeps your choice).

**Still needs a person and a real browser:** how it feels on your own screen; real microphone and camera behaviour; Safari and Firefox; real browser zoom (see below).

### Limits of this step

Real browser zoom cannot be driven from the test tool, so 200% is checked as a window of half the width at double scale, which gives the same layout width but is not a true zoom. Real microphone and camera behaviour still needs a person. The standalone reference panel inside the summary and the History detail are not part of this step.

## UX redesign — Step 4: Coordinated answer and review lifecycle (unreleased)

Fourth step of the redesign in `docs/InterviewPal_UX_Code_Review.md`. Each question now follows one clear sequence, and the screen says plainly which step it is on. Setup, Guided/Mock presets, the question library, pause/resume and full answer retakes are **not** part of this step. Steps 1 to 3 (safe ending, themes, workspace) are kept. No version assigned yet.

### The sequence

**Question spoken → Ready → Answering → Finishing → Review → Next question.**

| Step | Main button | What is happening |
|---|---|---|
| Question spoken | Start answer (switched off) | The interviewer is asking. Nothing is captured. |
| Ready | **Start answer** | The question has been asked. The user thinks, or types. Nothing is captured until Start answer. |
| Answering | **Finish answer** | The chosen response method and any chosen recording are on. |
| Finishing | *Finishing…* (switched off) | Listening and recording are stopped and their last results awaited. |
| Review | **Next question**, or **Finish session** on the last question | The handed-in response, any recording, the reference answer, self-marking or Coach feedback. Nothing advances by itself. |

**End session** is available throughout and uses the safe ending from Step 1. While Finishing, the main button is switched off, so a double click cannot hand the answer in twice or move on early.

**Skip** (where the difficulty allows it) hands in nothing and moves straight on, as before; it still waits for listening and recording to stop first.

### Response method and recording (in the workspace)

- **Respond by: Speak or Type.** Speak is the default where the browser supports speech recognition, otherwise Type (Speak is switched off with a note). The last choice is remembered in the settings as `answerMethod`. The response box is always there, in both methods: spoken words appear in it, and typing in it is always possible. Typing while listening stops listening, so the transcript cannot overwrite the typed words, and nothing already written is ever lost by switching method.
- **Recording: Off, Audio or Video.** **Off for every new session**, chosen in the workspace (it is not saved as a setting, so a recording never starts because of an earlier session). The target length keeps its saved setting. Changing the choice is possible before Start answer; the choice is shown but never silently changed afterwards.
- **Start answer starts what was chosen.** If Speak is chosen it starts listening; if Audio or Video is chosen it starts recording. The answer begins at once: these permission requests happen in the background and never delay, pause or reset anything. If the microphone or camera is refused, or is slow to answer, the screen says what is wrong in the right place, and typing carries on.
- **Two separate status lines**: *Speech to text* (listening, stopped, not available, why) and *Recording* (off, recording with the time, kept, failed, why). Either can work while the other fails: a recording is kept even if no text was heard, and the text is kept if the recording failed.
- **No automatic restarting.** A capture that failed is never started again by the app. The user can press **Listen again** (speech) or use **Record again** (recording).
- **Nothing is captured while the interviewer speaks**, because capture only starts at Start answer. **Repeat question** is therefore only available in Ready (before Start answer, where nothing is being captured); it does not touch the countdown, and pressing Start answer while it is speaking cuts it off first. This is a change from before, when Repeat could be used mid-answer.

### Timing: four different things

1. **Preparation time**: from the end of the spoken question until Start answer.
2. **Answer time**: from Start answer until Finish answer (shown on screen as "Preparing" or "Answering" with a clock).
3. **The interview countdown** (the hard limit, only where the difficulty has one: unchanged rules): starts when the question has been spoken, keeps running through preparation, permission questions and answering, and stops when the answer is handed in. Pressing Start answer or a browser permission box never pauses or resets it.
4. **The recording target and the recording cap.** The target (shown in the recorder) is only a cue and never hands in the answer. The cap (10 minutes for audio, 7 for video) stops the *recording* only; the interview and the answer carry on.

**When the countdown runs out** the current response is handed in once, with whatever has been written or heard, marked **timed out**, and the screen goes to Review. It does not move on by itself. If the user had not started, the response is a timed-out **No response**.

### Finishing is awaited, and bounded

Finish answer (and the time limit) stop listening and recording **together** and wait for both: the last spoken words, and the recording result. There are no fixed sleeps. Each wait has a limit: the recogniser's own (about 1.5 seconds) and the recorder's (3 seconds), with an overall cap of 5 seconds on the recording; if a result never arrives, the microphone is released, the recording is reported as failed, and the screen goes on to Review. It can never stay on "Finishing…". The text handed in is a snapshot taken after those waits, tied to the question it was for. If End is pressed meanwhile, Step 1's rules apply unchanged: this answer is finished once with its own outcome, and the session ends without advancing or asking Coach.

### Review

- Shows the **handed-in response** (labelled with its outcome and with how long preparing and answering took), the **recording** if there is one (the same single review panel), and the **reference answer** (always, in Review). The reference is **never** counted as seen during the answer because of Review: only what was on screen before the answer was handed in counts toward the assisted-answer note.
- **Self-marking** (where on): choose Got it, Partly or Missed. The choice is shown with a tick and can be changed; choosing does **not** move on. **Next question** is a separate button.
- **Coach feedback** (where on, with a key): appears here. If it fails, **Try again** asks again for the *same* response (never a new result) and **Skip feedback** carries on; Next waits for one of them. Only the response *text* ever goes to Coach: never a recording or a camera frame.
- **No text, only a recording:** the screen says AI feedback needs text, and offers **Type my response** (to add or correct the words, then ask for feedback) or **Continue without feedback**. Nothing is made up, and a missing response is **not** scored zero automatically.

### Outcomes (in Review, the summary and History)

| Outcome | When |
|---|---|
| **Answered** | Words were handed in. |
| **No response** | Handed in with no words (a recording alone does not make words). |
| **Skipped** | Skip was used. |
| **Timed out** | The countdown ran out (with the words, or as "timed out · no response"). |
| **Incomplete** | The session ended before the answer was handed in; kept but never scored (Step 1). |

Incomplete answers stay out of scores, self-marks, weak topics and delivery figures. No response is likewise not scored or marked as a delivery sample.

### Pending recordings

There is still only one pending (unsaved) recording at a time, and it is **never overwritten**. If a recording is chosen and one is still pending when Start answer is pressed, the answer does **not** start; the screen explains that the earlier recording must be saved, downloaded or discarded first, and offers **Continue without recording** (for this answer only, the Recording choice itself is not changed). Audio is still saved only with Save; video still has Download only; the loss warnings and the camera and microphone rules are unchanged. **Record again** (formerly Retry) replaces **the recording only**, while that question is still on screen (being answered, or in its review); it never changes the written or spoken answer, and there is no answer retake in this step. Pressing Download only starts a download: the screen says to check the Downloads folder, because the app cannot know the file arrived.

### Data

Results get two optional numbers, `prepSeconds` and `answerSeconds`, defaulting to 0 in old records; `seconds` keeps its old meaning (time since the question was spoken). "No response" is worked out from the words, not stored. Nothing else is migrated.

### Tests

Unit: the phases, the outcome rules and counts, the new fields' defaults, old-record compatibility. Browser (`tests/browser/lifecycle.mjs`, and the earlier checks updated to the new buttons): every step of the sequence; spoken and typed responses with recording Off, Audio and Video; speech failing while the recording works and the reverse; permission refused or slow with the countdown and typing unaffected; a recorder that never reports back; double-clicked Finish and Next; the countdown running out during speech and in Ready; End during Finishing; self-marking without advancing; Coach retry, error, skip and an empty transcript (no request, no zero); pending recordings across questions and the Continue-without-recording choice; the assisted-answer note, incomplete exclusions and old History; stopped media tracks; the phone layout; keyboard focus.

### Limits of this step

No Guided or Mock presets, no setup changes, no pause or resume, no answer retakes or retake history. Real microphone, camera and speech-recognition behaviour needs a person with real hardware.

### How it was checked (Step 4)

- **Unit tests** (`npm test`, 132): the phase rules, the main-button states, Repeat and Skip rules, outcome labels, the `noResponse` count and old-record defaults.
- **Syntax** (`npm run check`) is clean.
- **Scripted browser checks** (`npm run test:browser`, headless Chromium with a fake microphone and camera and a stand-in speech recogniser): all seven suites pass (390 checks). The new `tests/browser/lifecycle.mjs` covers the verification list: every phase and main-button state; nothing captured while the interviewer speaks; Speak and Type; recording Off, Audio and Video; recognition failing with a good recording and the reverse; a refused and a slow permission (the hard countdown is not paused, Finish does not hang, a late grant leaves no microphone on); a recorder that never reports stopping (the review opens within the bound, tracks released); triple-clicked Finish and Next; the hard limit with a fake clock (hands in once, opens the review, no auto-advance); End during Finishing with a recording (one result, original outcome, no review, no Coach request); empty, skipped and incomplete outcomes in History and the summary; one pending recording across questions with Continue without recording and Record again; Coach error then Try again, Skip feedback, and an empty transcript (no request, no 0; typing it afterwards gives feedback once); self-marking that does not advance; assisted flags; Repeat only in Ready; an old History record; the phone layout and keyboard focus. The earlier suites (reliability, themes, workspace, regression) were updated to the new buttons and still pass, including the contrast audit in all four themes.
- **A bug found by these checks and fixed:** a late result from the speech recogniser could overwrite words typed while it was listening. Typing now wins (the transcript no longer touches the box once you have typed).

Representative screenshots (desktop and phone: Ready, Answering, Review) are in `docs/images/lifecycle/`.

### Still to check by hand in real Chrome (hardware the scripts cannot reach)

1. Speak with your real microphone: Start answer begins listening, words appear, Finish answer waits for the last words. Try Listen again after a pause.
2. Choose Audio: the browser's microphone prompt appears after Start answer, the answer carries on while it is open, and the Recording line and the countdown behave. Allow it, finish, and play, Save and Download the recording.
3. Choose Video with a real camera: the small preview shows, Finish answer stops it, only Download is offered, the camera light goes off.
4. Deny the microphone in the prompt (and, separately, block it in the address bar): the Recording line explains it, typing carries on, nothing is recorded, and the next Start answer asks again only when you press it.
5. Let the Hard timer run out while you are speaking: the review opens once, with your words, and does not move on by itself.
6. Press Next question twice quickly, and Finish answer twice quickly: only one step happens.
7. Self-mark: nothing advances until Next question.
8. On the phone (Android Chrome): the Start / Finish button, the Speak and Type choice, the recording choice and the review are all reachable; the keyboard does not hide the main button.
9. In Coach mode with a real key: an answer gets feedback in the review; switch the network off for one answer to see Try again and Skip feedback.
10. Safari and iPhone are still untested.

## UX redesign — Step 5: Simpler interview setup (unreleased)

Fifth step of the redesign in `docs/InterviewPal_UX_Code_Review.md`. Goal: starting daily practice is straightforward, with sensible defaults and the uncommon details tucked away. It stays **one setup screen** (no wizard). Steps 1 to 4 (safe ending, themes, workspace, answer lifecycle) are kept as they are. The question library (Step 6), scoring, answer retakes and pause/resume are **not** part of this step, and there are no new dependencies.

### Three sections and More options

1. **Questions.** Tick one or more sets. The screen says how many questions are available **after the level filter and after removing repeats**, and how many a session will actually contain. Then: number of questions, order, and **Question complexity** (the old "Question level": All / Easy only / Hard only; the stored values `all`, `easy`, `hard` and the per-question `level` are unchanged). If the requested number is more than the matching questions, it says so ("You asked for 10, but only 6 match, so the session will have 6."). With no usable questions at all, a clear link goes to the Questions tab.
2. **Practice approach.** Two presets, **Guided rehearsal** and **Mock interview** (see below), and, separately, **Feedback**: *No feedback*, *Self-review* or *AI Coach*. Feedback maps onto what already exists: No feedback = Practice mode with self-marking off; Self-review = Practice mode with self-marking on; AI Coach = Coach mode (it is the same Coach, not a new mode). AI Coach is unavailable until an API key is saved in Settings, with a link to Settings. A checkbox **Show the reference answer while I answer** is here too, because the two presets differ on it.
3. **Response and devices.** *Respond by* **Speak** / **Type** (the same `answerMethod` setting the interview uses; Type is chosen and Speak is off where the browser cannot recognise speech). The **microphone** list with a **Test microphone** button. An optional **Preview camera** button. **Recording: Off / Audio / Video**.

A **More options** disclosure holds: **Interview pressure** (see below) and the optional timer on Relaxed, interviewer and own **accent**, the **interviewer face**, **speaking the Coach feedback aloud**, and the **experimental on-device recogniser**. Essentials and device readiness stay visible without opening it.

### Presets

| | Guided rehearsal | Mock interview |
|---|---|---|
| Reference answer | shown while answering | hidden at first (the Show answer button still works during the interview) |
| Interview pressure | Relaxed (no hard countdown) | Standard (the existing countdown, repeat and skip rules) |
| Feedback | Self-review | Self-review |
| Recording | Off | Off |

- A preset is applied **only** when the person chooses it, or on a **genuinely new installation** (no practice settings saved yet), which starts on Guided rehearsal. Nobody's saved choices are overwritten on first load, and an existing user with no preset simply sees "Your own settings" (neither preset selected).
- After choosing a preset, every control can still be changed. When the current choices differ from the chosen preset, the screen shows **Customised**. Presets are applied once, at the click: they are not re-applied by unrelated changes, by changing sets, count or feedback, or by the screen refreshing.
- Presets touch only setup choices. They never change History, and they do not replace the real reference tracking: whether the reference counted as seen is still decided by whether it was actually on screen while answering (Step 3), so revealing it during a mock answer still marks that answer as assisted.
- The preset and the other choices are remembered in the saved settings (`preset`: `guided`, `mock` or empty). **Recording is never remembered** (below).

### Interview pressure

"Difficulty" is renamed **Interview pressure**: **Relaxed** = the existing Easy, **Standard** = Medium, **Challenging** = Hard. The stored values `easy`, `medium`, `hard` and every rule are unchanged. The screen explains the chosen level accurately in one line, for example for Standard: "Time limit: 2 min per answer, counted from when the question has been asked (it does not pause when you press Start answer). When it ends, what you have is handed in for review. Repeat is allowed before you start answering. Skip is allowed." Relaxed has no limit unless its timer box is ticked (5 min). Challenging has 90 seconds and no repeat or skip. The **hard countdown** is always called the time limit, and the optional recording **target length** (set in the recorder panel) is called a target: it is a cue only, and neither replaces the other.

### Device checks

- **Test microphone** reuses the existing microphone check (`miccheck.js`, also used on the Settings tab) through one shared controller. It opens the chosen microphone and draws a level meter. It never records, saves, transcribes or sends anything. It stops by itself after 15 seconds, when pressed again, when the microphone choice changes, when the tab is left, when Start is pressed, or when the page is hidden. A permission that is answered late is released at once.
- **Preview camera** is requested only when pressed, shows a small mirrored picture on the setup screen, and stops when turned off, when the tab is left, when Start is pressed, or if the request is cancelled before it is ready (a late permission is released). It is the same camera owner logic as self-view. **Allowing the preview is not consent to record video**: the recording choice is separate.
- Pressing Start ends any setup device check **before** the session starts its own media.
- Typing always works: with no speech recognition, no microphone or a refused permission, the setup says so and Type remains.
- Privacy wording stays accurate: Practice makes no call to any AI service, but browser speech recognition may send speech to the browser's provider (in Chrome, to Google). The setup does not claim Practice is offline.

### Recording choice

**Recording: Off / Audio / Video** in setup is the starting value for the session's recording choice in the workspace panel. It is **Off every time the setup screen opens** (new page load, or coming back to setup after a session), and is not saved: the line beside it says "Not remembered: Off unless you choose it here for this session." Choosing it does not start anything: capture only begins when Start answer is pressed (Step 4). Video is still download-only and audio still needs Save. The target length stays in the recorder panel (labelled as a target).

### The start summary

Above the Start button: one line such as "10 questions · Introduction & HR · Guided rehearsal · Speak · Recording off", and a second line with the actual time limit and the feedback choice ("Time limit: none · Feedback: Self-review"). Start is disabled **only** when practice is genuinely impossible (no sets ticked, no usable questions, or no questions match the filter) and then says what to do. AI Coach without a key is not a disabled Start: the Coach choice itself is off, with the Settings link.

### Compatibility

Existing settings (`mode`, `practiceSelfMark`, `practiceDifficulty`, `showModelAnswer`, `practiceEasyTimer`, `practiceSets`, `selfView`, `micDeviceId`, accents, interviewer, `answerMethod`, `answerTargetSec`, theme), sets, History, the API key and saved recordings are untouched. Settings are written only with the merging `saveSettings`. The only new setting is `preset`. The interview lifecycle, the countdown, pending-recording handling and the end and navigation safeguards are unchanged.

### Tests

Unit: presets, feedback mapping both ways, new-install detection, "Customised", the explanation lines, count notes and the Start block. Browser (`tests/browser/setup.mjs`, and the earlier checks updated to the new controls): a new user, saved settings kept, customised presets; changing sets, count or feedback keeps the other choices; empty sets, unmatched filters, duplicates and oversized counts; no API key; no speech recognition; recording back to Off between sessions; the device checks' cleanup, late permissions and typing fallback; the right configuration reaching the Step 4 lifecycle; all themes; keyboard use; phone width and a 200% zoom layout. Real microphone and camera behaviour needs a person.

### Limits of this step

The microphone and camera checks are simulated with fake devices in the scripts. Whether the level meter, permission prompts and device switching behave on real hardware, and Safari and iPhone, are checked by hand.

### How it was checked (Step 5)

- **Unit tests** (`npm test`, 141): presets, the settings a preset writes, feedback mapping both ways, new-install detection, "customised", pressure wording, count notes, the Start block and the summary lines. **Syntax** (`npm run check`) is clean.
- **Before starting**, the final Step 4 commit (`e0413a0`) was checked out separately and the lifecycle, workspace and regression suites were run against it: all passed. (Its only code changes after the earlier full run were hiding Repeat/Skip in review and a header wrap, both already present in that run.)
- **Scripted browser checks** (`npm run test:browser`, headless Chromium, fake microphone and camera, stand-in speech recogniser): all eight suites pass. The new `tests/browser/setup.mjs` (97 checks) covers: a new installation on Guided rehearsal; More options closed and opened from the keyboard; a returning user's saved settings left byte-for-byte unchanged on load; presets applied only on choice, Customised, and no reapplying when sets, count, feedback or the tab change; duplicates, the complexity filter, oversized counts, no set ticked, an unmatched filter and empty sets (with the Questions link); AI Coach without and with a key (mapped to mode `coach`, no new mode); Speak/Type with and without recognition; Recording back to Off after a session and after a reload, never saved, and not recording or requesting the microphone until Start answer; the microphone test (no recorder, no recognition, stops on Stop, tab change, microphone change and Start; late permission after Cancel or after leaving is released; a refused microphone or camera and typing still works); the camera preview (video only, stops everywhere, a late permission released, allowing it does not record or imply self-view); the right configuration reaching the interview (Guided: reference shown, no countdown, self-marking; Mock: reference hidden, countdown running; revealing it mid-answer keeps the assisted flag); keyboard order and radio groups; 390px width; a 640px window at double scale; and the contrast audit of the setup screen in all four themes. The earlier suites were updated to the new controls and still pass.
- **Real browser zoom** was not available; "200% zoom" is emulated with a 640px-wide window at device scale 2. It checks the layout, not the browser's zoom feature.
- One timing flake appeared once in the Step 4 lifecycle check under load (a 10 second wait for the answer to start) and did not repeat on re-runs; it is noted rather than explained.

### Still to check by hand (Step 5; real hardware)

1. Open setup on a brand-new browser profile: Guided rehearsal is selected and the summary reads correctly. Then, with some saved settings, reload: nothing changes by itself.
2. Pick Mock interview, change one thing, and see "customised"; change sets and the number of questions and see nothing else move.
3. With your real microphone: **Test microphone** shows a moving meter and sensible advice, the microphone light goes off at once when you press Stop, switch tabs or press Start. Choose a different microphone and test again.
4. With a real camera: **Preview camera** shows you, and the camera light goes off when you stop the preview, leave setup or press Start. Allowing it must not start recording.
5. Deny the microphone (and, separately, the camera) in the browser prompt: the messages are clear and you can still type and start.
6. Choose Audio (then Video), start, and check nothing records until Start answer; finish the session, come back to setup and see Recording is Off.
7. Try setup on your phone (Android Chrome): all three sections, the More options drawer and the Start button are reachable with the keyboard open.
8. In Chrome's zoom (Ctrl +) at 200%: setup stays usable without sideways scrolling.
9. Safari and iPhone remain untested.

## UX redesign — Step 6: Question library and import preview (unreleased)

Sixth and last step of the redesign in `docs/InterviewPal_UX_Code_Review.md`. The Questions tab changes from a page of expanded forms into a library you can browse, search, read and edit one question at a time, with a safer notes import. Steps 1 to 5 are kept. The backup file format, import validation, same-name set merging and within-set duplicate rule are **unchanged**; there are no new dependencies, no framework, and no change to recordings or History (editing a question never rewrites History or the link to saved recordings).

### Browse and detail

- **Header:** a compact **set selector** (a drop-down, so it collapses on any width) with **New set**; the set title and count; **Add question**, **Import questions** and **Practise this set** beside the title; and a **Set actions** menu holding Rename, Delete set, Clear all questions in this set and **Export all sets** (it exports every set, and says so).
- **Two panes, never three:** a searchable **question list** and the selected question's **detail**. Wide windows show them side by side; on a phone the list comes first, then a full-screen detail with a **Back** button.
- **Rows** show the question (shortened to a title), its topic, its complexity (Easy / Hard / Not tagged) and **Reference answer** or **No reference**. The detail shows the **whole** question and the whole reference answer in a readable, wrapping view.
- Selection is by the question's **stable ID**, never by its position in the list. Questions that somehow lack an ID get one when the screen opens (saved on the next save).

### Search and filters

Search matches the question text and the topic within the open set. A **topic** filter (including *No topic*) and a **complexity** filter (All, Easy, Hard, *Not tagged*) narrow the list. The screen says how many match and, if none do, why. **Clear filters** restores the full list in its saved order. Filtering never changes saved questions. If the selected question is filtered out: when it is only being viewed the selection clears and focus stays where the person is typing; when it is being **edited**, the editor stays open, says it is hidden by the filters, and the draft is kept.

### Editing, validation and saving

- **Edit** opens the selected question in a form with labelled fields (Question, Reference answer, Topic, Complexity); **Save** and **Cancel** end it. **Add question** opens an empty draft in the same form; nothing is added until Save, and Cancel discards it.
- **Validation:** the question must not be empty, and must not already be in **this set** (the same normalisation as imports: ignoring capitals and extra spaces). The same question may exist in a different set. A problem is shown next to the field and announced.
- **Honest saving:** the success message appears only after the browser has really stored the change. The live data is updated only after a successful store, so a failed save never leaves the library half-changed. On failure the draft stays open, the screen says it was **not saved**, and offers **Try again**, **Copy unsaved text** and **Download as a file**.
- **Unsaved edits are guarded.** Switching to another question, set, Add, Practise this set, or leaving the Questions tab (which also covers starting practice) asks **Save**, **Discard** or **Stay**. If Save fails the person stays. Closing the page warns too. User text is always shown as text, never as markup.

### Delete, move and set actions

- **Delete a question** removes it at once and shows **Undo**. Undo restores the same ID, content and position. It stays available until the person deletes another question, opens another set, leaves the Questions tab, or reloads the page: there is **no timer**, so it never expires while someone is editing, and the bar says so. If saving the delete or the undo fails, the screen says exactly what did (or did not) happen and nothing is changed.
- **Move to set** keeps the existing behaviour, but first warns when the other set already has the same question: the existing copy there is kept, and this one only leaves the current set.
- Deleting a set and clearing a set's questions keep their confirmations. Rename, Delete set, Clear and Export sit in the Set actions menu (keyboard-operable: Escape closes it and returns focus), away from the routine actions.

### Practise this set

Switches to the Interview tab with **only this set ticked** in setup. It does not start a session, does not request the microphone or camera, does not apply a preset, and leaves every other setup choice as it was (Recording is Off, as always on opening setup). The unsaved-edit guard applies first.

### Importing notes (preview before anything is added)

Separate from the JSON backup restore. **Import questions** opens a panel: choose files or paste text, press **Find questions**. The **destination set is fixed at that moment** and shown throughout, so opening another set while reading cannot redirect it. The result is a **preview**: each detected question (with its reference answer, topic and complexity) with a checkbox, **duplicates** marked (already in the destination, or repeated in these notes) and not selectable, a count line ("12 found · 10 selected · 2 already in "Technical" · 3 unrecognised"), and the **unrecognised text** where it can be read, copied, or turned into a proposed question. **Add N questions to "Set"** confirms; **Cancel** changes nothing. At confirmation the destination must still exist and duplicates are checked again against the **current** data. Repeated clicks cannot commit twice. If reading fails the input stays and the controls work again; if saving fails nothing was added, the preview stays, and the screen says so. Success is announced only after the store succeeds.

### Backup (unchanged format)

Export all sets and Import sets files work as before (same-name sets merge; within-set duplicates skipped; the same question allowed in different sets; an invalid file changes nothing). Import and the demo now also apply to a copy and are kept only if saving succeeds. Existing sets, IDs, History and recordings stay usable.

### Accessibility and appearance

All colours come from the existing theme roles. Fields and messages are labelled; the list, menus and dialogs work with the keyboard. Focus is moved deliberately: to the editor after Add or Edit, to the question after Save or Cancel, to the neighbouring row after Delete, to the restored row after Undo, to the row after Back, to the preview heading after Find questions. Long references wrap and scroll within the page; the layout works at phone width and at a 200% zoom width.

### Tests

Unit (`tests/library.test.js`): filtering and search (topic, complexity, untagged, order restored), validation and duplicate rules, edit/add/delete/undo/move on copies (the originals are never mutated), import preview and the confirmation re-check. Browser (`tests/browser/library.mjs`, with the Step 1 questions check adapted): browse and select by ID, search and filters, hiding a selected question, edit/save/cancel, validation, failed save with retry and copy, guards (Save, Discard, Stay, failed Save), delete and undo (including failure), move conflicts, Practise this set (no media, no preset change), the import preview (selection, duplicates, unrecognised text, cancel, destination deleted, repeated clicks, failed read and failed save), backup compatibility, keyboard focus, phone width, a 200% layout and all four themes. The known intermittent Step 4 lifecycle failure keeps its assertion and gains failure diagnostics in the test helper (see the notes at the end of this step).

### Limits of this step

Browser zoom is emulated with a narrow window at device scale 2 (not the real zoom feature), and the phone is an emulated viewport. Clipboard behaviour and a real mobile keyboard need a person. A saved recording is still linked to a question by its text: editing the text means earlier recordings may no longer appear under it (they stay in History and on the Recordings card), and the screen says so when the text of a question is changed.

### How it was checked (Step 6)

- **Unit tests** (`npm test`, 157; 16 new in `tests/library.test.js`): filtering and search, validation and the duplicate rules, dirty detection, edit/add/delete/undo/move/clear on copies (the originals are never mutated), undo refusals, the import preview and the re-checked commit. **Syntax** (`npm run check`) is clean.
- **Scripted browser checks** (`npm run test:browser`, headless Chromium): all nine suites pass (624 checks) on the final code. The new `tests/browser/library.mjs` (139 checks) covers browsing and selection by ID, search and every filter, Edit/Save/Cancel and focus, validation, a failed save with retry, copy and download, the guards (Save, Discard, Stay, Escape, and a failed Save that does not navigate), a filter hiding a question being edited, delete and Undo (no timer, failures, a refused conflicting Undo), move conflicts, the Set actions menu from the keyboard, Practise this set (no media request, no preset or other setup change, no session), the import preview (destination fixed while another set is opened, duplicates, unrecognised text, selection, Cancel, three quick clicks on Confirm, a duplicate made meanwhile, a deleted destination, a failed save, a file that cannot be read), backup compatibility (merge, within-set duplicates, same question across sets, invalid and unsaveable files change nothing), old data without IDs, keyboard order, a 390px phone (list, detail, Back, editor), a 640px window at double scale, and the contrast audit in all four themes. The Step 1 questions check was adapted to the new markup, and the other suites were updated where they used the old forms.
- **Representative screenshots** (desktop list and detail, editor, import preview; phone list, detail and editor) are in `docs/images/library/`.
- **Simulated, not real:** the phone is an emulated viewport, "200% zoom" is a narrow window at device scale 2 (not the browser's zoom), the clipboard is stubbed to refuse (so the copy fallback is what is tested), and no real mobile keyboard was used.

### The intermittent Step 4 lifecycle failure (unresolved)

It showed once in a full run under load: "Start answer" did not reach "Finish answer" within 10 seconds in the Coach scenario. It did not reproduce in six later runs of the lifecycle check (three repeats in a row and three full runs). Nothing was hidden: the assertion is unchanged (same selector, same 10 second wait, no retry, no extra sleep). What was added: if it happens again, the helper now throws with what the page looked like just before the click and at the failure (the main button's HTML, the hint, the progress, the clocks, the speech and recording lines, whether a pending recording blocked the start, which screen was open, the focused element) and the page errors. The cause is **not known**. Reported separately here rather than fixed.

### Still to check by hand (Step 6)

1. Add, edit, save and cancel questions; try an empty question and a repeated one. Reload and check they are still there.
2. With some unsaved text in the editor, try to switch question, set and tab, and choose Save, Discard and Stay in turn.
3. Delete a question, wait a while, and Undo: it returns in the same place. Delete a few and use Undo only on the last.
4. Move a question into a set that already has it and read the warning.
5. Press **Practise this set**: setup opens with only that set ticked, nothing starts, and no microphone or camera prompt appears.
6. Import a real Word, PDF and Markdown file: the preview lists the questions, duplicates are marked, and nothing is added until you confirm.
7. On your phone: the list, the question view with Back, the editor with the keyboard open, and the preview are all usable.
8. In Chrome's zoom at 200%: the library stays usable with no sideways scrolling.
9. Use a screen reader or keyboard only through Add, Save, Delete and Undo, and check that focus lands sensibly each time.
10. In a private window (where storage may be limited) check that a failed save shows the Try again, Copy and Download options.
11. Safari and iPhone remain untested.

## Pilot: practise a Study Hub plan in InterviewPal (local, unreleased)

A local pilot, frontend only in both apps. InterviewPal must keep working exactly as a standalone app.

- **The link.** Study Hub's plan page shows **Practise in InterviewPal** for any plan that is paired with a pack. The pairing is saved on the plan in Study Hub (an optional `interviewpal_pack_key`, chosen in the plan form), so renaming the plan or the pack breaks nothing. (The first pilot paired one plan by an environment setting; that is replaced.) The shared contract is in `docs/study-hub-integration.md`. It opens `<InterviewPal address>/?pack=system-design-week-1&plan=<plan ID>`. The pack is identified by a stable **key**, never by its display name; `plan` is only the plan to come back to.
- **The pack.** `src/packs.js` ships **System Design — Week 1** (key `system-design-week-1`): six questions, three on consistent hashing and three on the CAP theorem, mixing explanation, scenario and trade-off questions, each with a concise reference answer.
- **Setup.** The link opens the normal setup with that pack's set ticked **for this visit only**: nothing is saved, so opening and abandoning it leaves the usual selection alone, and a session started from the link does not save its selection as the usual one either. Guided rehearsal or Mock interview is still the person's choice, and nothing starts until they press Start. A banner says what the link asked for.
- **Making the pack available.** If the pack is not in the question library, the banner offers one explicit button, **Add this question set**. It creates an ordinary set that remembers the pack key (renaming it never breaks the link). It is safe to repeat: a set that already has the key is left alone; a set that already has the pack's name but no key is adopted and only missing questions are added; the person's own edits are never overwritten.
- **Bad links.** An unknown pack key changes nothing and says so. A plan value that is not a UUID is ignored (the pack still opens, with no Back button and a note). A link that arrives while a session is running does not touch the session.
- **Back to study plan.** The summary of a session that was started from the link shows **Back to study plan**. Its address is built from a trusted Study Hub origin and the validated plan ID; no address is ever taken from the link. The trusted origins are configuration in `src/packs.js` (`STUDY_HUB_ORIGINS`): `http://localhost:5173` when InterviewPal runs on localhost, and `https://study-hub.mehul-patankar.workers.dev` otherwise (hosted). Leaving the page follows the existing unsaved-recording safeguard (the browser asks first if a recording is not saved or downloaded). A session not started from a link shows no such button.
- **Back without practising.** When the visit came from a link with a valid plan ID, the Interview setup screen (the first page after the link) and the Questions page both show **Back to study plan**. It asks "Go back to your Study Hub plan without practising?" first (Cancel stays), asks the usual Save / Discard / Stay question first if a question is being edited, and builds its address the same safe way. It is not shown for ordinary visits or links with an invalid plan ID.
- **Another tab.** The Questions screen picks up changes made to the sets in another tab (for example the pack added by a link), so an old tab cannot save over them.
- **Later, not now:** user-configurable pairings, several packs per plan, AI-generated sets, and sharing between accounts.
- **Checked** with `tests/packs.test.js` and `tests/browser/studyhub-link.mjs`, including a full round trip with a Study Hub dev server. Study Hub's sign-in was mocked (see the report), not a real account.

## Acceptance criteria for v1

- With no API key, load a .docx with 10 questions, review the extracted pairs, and run a Practice session with difficulty, timer and order.
- In Practice mode no request is sent to any AI service.
- Coach mode is disabled with a note until an API key is saved in Settings.
- Hear each question, answer by voice, and see the live transcript.
- In Coach mode, receive a score and feedback per answer within a few seconds.
- See a summary at the end, and find the session on the History tab after reloading the page. Open it to see the answers and feedback, delete one session, and clear the history.
- Keep three or four question sets, tick two of them, and run one session with questions from both.
- Move a question to another set, and see that it is no longer in the old set. Loading a document that repeats a question already in the same set skips it (from v1.2 the same question may exist in other sets).
- Export sets to a file, clear the browser data (or use a different browser), import the file, and get the same sets back.
- With clips installed in `assets/interviewers/`, pick the interviewer on the setup screen and see the person listen while you answer and talk while the question is read. With no clips, the drawn face still works.
- With self-view on, see your own mirrored camera picture. The camera light goes off when the session ends.
- Everything works on Chrome on a laptop; typing works on a phone.
