# InterviewPal: Requirements

A daily mock-interview practice tool. You load your own Q&A notes and an animated interviewer asks the questions aloud. You answer by voice or typing. There are two modes: **Practice** (no AI, no key, no feedback) and **Coach** (Claude scores your answer against your notes).

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

- Practice interviews daily using your own prepared questions and answers.
- Feel like a real interview: spoken questions, a visible interviewer, and time pressure.
- Work fully offline from AI: Practice mode needs no key and sends nothing to any AI service.
- In Coach mode, show what you missed compared with your own notes. (Tracking weak topics over time is planned for v2.)

## Non-goals (v1)

- No backend, no login, no user accounts.
- No realistic video avatar.
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
5. **Voice answers.** Browser speech recognition with a live transcript the user can correct. A typing box is always available as a fallback.
6. **Animated avatar.** A simple SVG interviewer with idle, talking and listening states. The mouth animates while speech plays.
7. **Practice mode loop.** Spoken questions with difficulty, tone, timer, order, repeat and skip rules, and optional self-marking, as described above.
8. **Coach mode.** AI scoring and feedback for each answer, as described above.
9. **Session summary.** Practice: questions asked, time taken, and self-marks if used. Coach: scores per question, an overall score and topics to revisit.
10. **Local storage.** Question sets, settings, API key and session history are stored in the browser only.
11. **Question sets.** The user keeps several named sets of questions, for example "Leadership", "Technical" or "Behavioural".
    - There is always at least one set. The default is called "My questions". Questions saved before sets existed are moved into it automatically.
    - Sets can be created, renamed and deleted (deleting asks for confirmation). Set names are unique.
    - **One question, one set.** A question is stored inside exactly one set. There is no copy. "Move to set" takes it out of one set and puts it into another. A question text (ignoring case and extra spaces) can exist only once across all sets, so loading a document or importing a file skips questions that already exist anywhere and reports how many were skipped and in which set they are.
    - At session setup the user ticks one or more sets. The questions of all ticked sets form one pool, and order, question level, difficulty and count apply to that pool. The last choice is remembered.
    - **Backup:** "Export sets" saves all sets to a `.json` file. "Import sets" reads such a file. Sets with a name that already exists are merged into it, new names create new sets, and duplicate questions are skipped. Files that are not valid InterviewPal exports are rejected with a clear message and change nothing.

### Should have (v2)

- Follow-up questions generated from the user's answer (Coach mode).
- Weak-area-first ordering, based on past scores and self-marks, as a third order option (Coach mode).
- An optional "Tidy up with AI" button on the review screen, for messy files that the rule-based parser cannot read (Coach mode).
- A "give me a hint" control.
- Panel-style interviewer persona (friendly and tough are covered by difficulty tone).
- Daily streak.

### Later

- Realistic video avatar through a third-party service.
- Export and import of session history (question sets already have export and import in v1).
- Installable as a phone app (PWA).

## Non-functional requirements

- **Simple:** static site, no build step required for v1 (plain HTML, CSS, JavaScript with ES modules). A bundler can be added later if needed.
- **Private:** documents and the API key never leave the browser except for Anthropic API calls, which happen only in Coach mode (answer feedback). Practice mode makes no AI calls. Nothing is sent to any other server by the app.
- **Cheap:** a 10-question Coach session should cost only a few cents on a Sonnet-class model. Keep prompts small by sending only the current question, reference answer and user answer. Practice mode costs nothing.
- **Browser support:** Chrome (laptop and Android) is the primary target. Safari and iOS have limited speech recognition, so typing must always work.
- **Responsive:** usable on a phone screen, with large mic and next buttons.
- **Accessible:** captions for everything spoken, keyboard operable, respects reduced-motion settings.

## Technical approach

- **Stack:** HTML, CSS, JavaScript (ES modules). Libraries loaded from a CDN: `mammoth` for .docx and `pdf.js` for .pdf.
- **Speech:** Web Speech API (`speechSynthesis` and `SpeechRecognition` / `webkitSpeechRecognition`). Speech rate comes from the difficulty setting.
- **AI (Coach mode only):** Anthropic Messages API called directly from the browser, with the header `anthropic-dangerous-direct-browser-access: true`. The model name is a setting, defaulting to a current Sonnet model.
- **API key:** entered once in Settings and stored in localStorage. Acceptable for a personal tool. The key must never be committed to the repo. Practice mode never reads it.
- **Structured output:** prompts ask Claude to return JSON only. The client strips code fences and validates before use.
- **Hosting:** GitHub Pages.

### Rule-based parser

`.docx` and `.pdf` files are first turned into plain text in the browser (`mammoth`, `pdf.js`). Then the same text rules apply to every format. The parser tries these patterns:

1. `Q:` / `A:` lines, and `Question:` / `Answer:` lines (case-insensitive, with or without a number).
2. A heading (Markdown `#` lines, or a short line ending in `?`) with the answer text below it, up to the next heading.
3. Numbered questions (`1.`, `2)`) with the lines below them as the answer.

Optional tags on a question: `[easy]` or `[hard]` at the end of the question line, or a line `Level: easy` / `Level: hard` under it. A nearby heading can set the topic.

An answer is optional in Practice mode, because the interviewer only needs the question. Text that matches no pattern goes to the review screen as unplaced text, where the user can turn it into a pair or delete it. (An optional **Tidy up with AI** button for messy files is planned for v2.)

### Modules

| File | Responsibility |
|---|---|
| `src/avatar.js` | SVG interviewer and its state animations |
| `src/speech.js` | Text-to-speech and speech recognition wrappers |
| `src/phrases.js` | Interviewer phrases and tone per difficulty (easy, medium, hard) |
| `src/claude.js` | API client, prompts (evaluate answer), JSON parsing and checking (Coach mode only) |
| `src/parser.js` | File reading (md, txt, docx, pdf) and rule-based Q&A extraction |
| `src/session.js` | Question ordering and filtering, session flow, timer, difficulty rules, scoring |
| `src/storage.js` | localStorage for settings, question sets, API key and history |
| `src/sets.js` | Question set rules: duplicates, move, export and import checking (no page code) |
| `src/settings.js` | Settings screen: API key, model, test connection |
| `src/practice.js` | Practice screen: setup, interview loop, self-marking, end-of-session list |
| `src/review.js` | Questions screen: set picker, load notes, review, edit, add, move and delete pairs, export and import |
| `src/ui.js` | Screen switching and the interview, setup, summary and settings screens |

## Prompts (Coach mode, starting point)

**Tidy up with AI (v2, not built yet):** "Extract every interview question and its reference answer from this text. Return only JSON: `[{"question": "...", "answer": "...", "topic": "...", "level": "easy|hard|null"}]`."

**Evaluate answer:** "You are a {persona} interviewer for an Engineering Manager role. Compare the candidate's answer with the reference answer. Return only JSON: `{"score": 0-10, "covered": [...], "missed": [...], "tip": "...", "spoken_feedback": "two short sentences"}`." The persona follows the chosen difficulty tone (warm, neutral or challenging).

**Voice answers:** answers may come from speech recognition, so the evaluate prompt must say: "The answer is a voice transcript and may contain misheard words or misspellings. Judge the meaning, not the spelling, and do not penalise recognition errors." The user can also edit the transcript before submitting.

## Privacy and GitHub notes

- Keep personal Q&A notes out of the repo. They are loaded in the browser and never need to be committed. A `my-notes/` folder is git-ignored for local use.
- Voice input uses the browser's speech recognition. In Chrome this sends the audio to Google's speech service, which is outside this app's control. Typing sends nothing anywhere.
- GitHub Pages on a **private** repo needs a paid GitHub plan. On a free plan, either make the repo public (safe, because it holds no keys or notes) or run the app locally with `python3 -m http.server`.

## Build order

1. Project scaffold and static page that loads. (done)
2. Avatar with idle, talking and listening states. (done)
3. Speech: speak a line, then capture a spoken answer. (done)
4. Rule-based document parser and review screen (edit, add, delete pairs). (done)
5. Practice mode loop: difficulty, tone (`src/phrases.js`), timer, order, level filter, repeat and skip rules, optional self-marking. (done)
6. Mode picker, Settings (API key, model) and Claude client. (done)
7. Coach mode: AI scoring and feedback for each answer (shown as text, spoken aloud with an off switch).
8. Question sets with JSON export and import (added after step 7).
9. Session summary and history (on hold until after real use).
10. Mobile polish, README, GitHub Pages deployment.

### Deferred to v2

Decided to keep these out of v1 and build them later (they were the planned "7b"):

- Follow-up questions generated from the answer.
- Weak-area-first ordering using past scores and self-marks (needs the history from step 8).
- "Tidy up with AI" on the review screen.
- From the earlier v2 list: a "give me a hint" control, a panel-style persona and a daily streak.

## Acceptance criteria for v1

- With no API key, load a .docx with 10 questions, review the extracted pairs, and run a Practice session with difficulty, timer and order.
- In Practice mode no request is sent to any AI service.
- Coach mode is disabled with a note until an API key is saved in Settings.
- Hear each question, answer by voice, and see the live transcript.
- In Coach mode, receive a score and feedback per answer within a few seconds.
- See a summary at the end, and find it in history after reloading the page.
- Keep three or four question sets, tick two of them, and run one session with questions from both.
- Move a question to another set, and see that it is no longer in the old set. Loading a document that repeats an existing question skips it.
- Export sets to a file, clear the browser data (or use a different browser), import the file, and get the same sets back.
- Everything works on Chrome on a laptop; typing works on a phone.
