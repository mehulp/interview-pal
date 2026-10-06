# InterviewPal: Requirements

A daily mock-interview practice tool. You load your own Q&A notes and an animated interviewer asks the questions aloud. You answer by voice or typing. There are two modes: **Practice** (no AI, no key, no feedback) and **Coach** (Claude scores your answer against your notes).

## Decisions (defaults confirmed)

| Topic | Decision |
|---|---|
| Modes | Practice (default, no AI, no API key) and Coach (AI, needs an API key) |
| Document formats | .md, .txt, .docx, .pdf |
| Repository | Private to start |
| Main answer mode | Voice, with typing as fallback |
| Language / accent | Default English (India), `en-IN`. Separate pickers for the interviewer voice and the user's speech: en-IN, en-US, en-GB |
| Devices | Laptop and phone (mobile-friendly layout) |

## Goals

- Practice interviews daily using your own prepared questions and answers.
- Feel like a real interview: spoken questions, a visible interviewer, time pressure, and in Coach mode follow-ups.
- Work fully offline from AI: Practice mode needs no key and sends nothing to any AI service.
- In Coach mode, show what you missed compared with your own notes, and track weak topics over time.

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
- **Self-marking (optional, off by default):** a toggle "Reveal my reference answer and self-mark". After each answer the reference answer from the user's notes is shown, and the user taps Got it / Partly / Missed. Self-marks are saved in history and count towards weak topics.

### Coach mode (AI, needs an API key)

Everything in Practice mode (order, level filter, difficulty, timer, phrases), except that AI marking replaces self-marking, plus:

- Scoring out of 10 and feedback against the reference answer (covered, missed, one tip), shown as text and spoken aloud (the spoken part can be switched off).
- Follow-up questions generated from the answer.
- A third order option: weak areas first, based on past scores and self-marks.
- An optional "Tidy up with AI" button on the document review screen for messy files.

Until an API key is saved in Settings, Coach mode is disabled in the mode picker, with a note pointing to Settings.

## Functional requirements

### Must have (v1)

1. **Load documents.** Upload one or more .md, .txt, .docx or .pdf files, or paste text. In Practice mode the questions and answers are found by a **rule-based parser** (no AI). The user can review and edit the list before starting.
2. **Review screen.** Shows every extracted pair. The user can edit, add and delete pairs, set a question's level (easy or hard) and fix anything the parser did not recognise. Text the parser could not place is listed so nothing is silently lost.
3. **Session setup.** Choose mode, number of questions, order, question level filter and difficulty (Coach mode adds weak-areas-first order).
4. **Interviewer voice.** Questions are read aloud with browser text-to-speech, preferring a voice for the chosen accent and falling back to any English voice.
5. **Voice answers.** Browser speech recognition with a live transcript the user can correct. A typing box is always available as a fallback.
6. **Animated avatar.** A simple SVG interviewer with idle, talking and listening states. The mouth animates while speech plays.
7. **Practice mode loop.** Spoken questions with difficulty, tone, timer, order, repeat and skip rules, and optional self-marking, as described above.
8. **Coach mode.** Scoring, feedback, follow-ups and weak-area ordering, as described above.
9. **Session summary.** Practice: questions asked, time taken, and self-marks if used. Coach: scores per question, an overall score and topics to revisit.
10. **Local storage.** Documents, settings, API key and session history are stored in the browser only.

### Should have (v2)

- A "give me a hint" control.
- Panel-style interviewer persona (friendly and tough are covered by difficulty tone).
- Daily streak.

### Later

- Realistic video avatar through a third-party service.
- Export and import of session history.
- Installable as a phone app (PWA).

## Non-functional requirements

- **Simple:** static site, no build step required for v1 (plain HTML, CSS, JavaScript with ES modules). A bundler can be added later if needed.
- **Private:** documents and the API key never leave the browser except for Anthropic API calls, which happen only in Coach mode (feedback, follow-ups and the optional tidy-up). Practice mode makes no AI calls. Nothing is sent to any other server by the app.
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

An answer is optional in Practice mode, because the interviewer only needs the question. Text that matches no pattern goes to the review screen as unplaced text, where the user can turn it into a pair or delete it. In Coach mode the review screen also has an optional **Tidy up with AI** button that sends the text to Claude to extract pairs from messy files.

### Modules

| File | Responsibility |
|---|---|
| `src/avatar.js` | SVG interviewer and its state animations |
| `src/speech.js` | Text-to-speech and speech recognition wrappers |
| `src/phrases.js` | Interviewer phrases and tone per difficulty (easy, medium, hard) |
| `src/claude.js` | API client, prompts, JSON parsing (Coach mode only) |
| `src/parser.js` | File reading (md, txt, docx, pdf) and rule-based Q&A extraction |
| `src/session.js` | Question ordering and filtering, session flow, timer, difficulty rules, scoring |
| `src/storage.js` | localStorage for settings, notes and history |
| `src/ui.js` | Screens: mode picker, setup, review, interview, summary, settings |

## Prompts (Coach mode, starting point)

**Tidy up with AI (optional):** "Extract every interview question and its reference answer from this text. Return only JSON: `[{"question": "...", "answer": "...", "topic": "...", "level": "easy|hard|null"}]`."

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
4. Rule-based document parser and review screen (edit, add, delete pairs).
5. Practice mode loop: difficulty, tone (`src/phrases.js`), timer, order, level filter, repeat and skip rules, optional self-marking.
6. Mode picker, Settings (API key, model) and Claude client.
7. Coach mode: scoring, feedback, follow-ups, weak-area ordering, and "Tidy up with AI" on the review screen.
8. Session summary and history.
9. Mobile polish, README, GitHub Pages deployment.

## Acceptance criteria for v1

- With no API key, load a .docx with 10 questions, review the extracted pairs, and run a Practice session with difficulty, timer and order.
- In Practice mode no request is sent to any AI service.
- Coach mode is disabled with a note until an API key is saved in Settings.
- Hear each question, answer by voice, and see the live transcript.
- In Coach mode, receive a score and feedback per answer within a few seconds.
- See a summary at the end, and find it in history after reloading the page.
- Everything works on Chrome on a laptop; typing works on a phone.
