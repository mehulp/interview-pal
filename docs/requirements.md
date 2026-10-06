# InterviewPal: Requirements

A daily mock-interview practice tool. You load your own Q&A notes, an animated interviewer asks the questions aloud, you answer by voice, and Claude compares your answer with your notes and gives short feedback.

## Decisions (defaults confirmed)

| Topic | Decision |
|---|---|
| Document formats | .md, .txt, .docx, .pdf |
| Repository | Private to start |
| Main answer mode | Voice, with typing as fallback |
| Language / accent | Default English (India), `en-IN`. Separate pickers for the interviewer voice and the user's speech: en-IN, en-US, en-GB |
| Devices | Laptop and phone (mobile-friendly layout) |

## Goals

- Practice interviews daily using your own prepared questions and answers.
- Feel like a real interview: spoken questions, a visible interviewer, follow-ups, time pressure.
- Show what you missed compared with your own notes, and track weak topics over time.

## Non-goals (v1)

- No backend, no login, no user accounts.
- No realistic video avatar.
- No multi-user or sharing features.

## Functional requirements

### Must have (v1)

1. **Load documents.** Upload one or more .md, .txt, .docx or .pdf files, or paste text. Claude extracts question and answer pairs even when the format is loose. The user can review and edit the extracted list before starting.
2. **Session setup.** Choose number of questions, order (in sequence, random, weak areas first) and interviewer strictness.
3. **Interviewer voice.** Questions are read aloud with browser text-to-speech, preferring an `en-IN` voice and falling back to any English voice.
4. **Voice answers.** Browser speech recognition with a live transcript the user can correct. A typing box is always available as a fallback.
5. **Animated avatar.** A simple SVG interviewer with idle, talking and listening states. The mouth animates while speech plays.
6. **Per-answer feedback.** Claude compares the answer with the reference answer and returns: a score out of 10, what was covered, what was missed, and one improvement tip. Feedback is shown as text and spoken aloud (the spoken part can be switched off).
7. **Session summary.** Scores per question, an overall score, and topics to revisit.
8. **Local storage.** Documents, settings, API key and session history are stored in the browser only.

### Should have (v2)

- Follow-up questions generated from the user's answer.
- Weak-area targeting using past scores, and a daily streak.
- Interviewer personas: friendly, tough, panel style.
- Optional countdown timer per answer.
- Skip, repeat question, and "give me a hint" controls.

### Later

- Realistic video avatar through a third-party service.
- Export and import of session history.
- Installable as a phone app (PWA).

## Non-functional requirements

- **Simple:** static site, no build step required for v1 (plain HTML, CSS, JavaScript with ES modules). A bundler can be added later if needed.
- **Private:** documents and the API key never leave the browser except for calls to the Anthropic API. Nothing is sent to any other server.
- **Cheap:** a 10-question session should cost only a few cents on a Sonnet-class model. Keep prompts small by sending only the current question, reference answer and user answer.
- **Browser support:** Chrome (laptop and Android) is the primary target. Safari and iOS have limited speech recognition, so typing must always work.
- **Responsive:** usable on a phone screen, with large mic and next buttons.
- **Accessible:** captions for everything spoken, keyboard operable, respects reduced-motion settings.

## Technical approach

- **Stack:** HTML, CSS, JavaScript (ES modules). Libraries loaded from a CDN: `mammoth` for .docx and `pdf.js` for .pdf.
- **Speech:** Web Speech API (`speechSynthesis` and `SpeechRecognition` / `webkitSpeechRecognition`).
- **AI:** Anthropic Messages API called directly from the browser, with the header `anthropic-dangerous-direct-browser-access: true`. The model name is a setting, defaulting to a current Sonnet model.
- **API key:** entered once in Settings and stored in localStorage. Acceptable for a personal tool. The key must never be committed to the repo.
- **Structured output:** prompts ask Claude to return JSON only. The client strips code fences and validates before use.
- **Hosting:** GitHub Pages.

### Modules

| File | Responsibility |
|---|---|
| `src/avatar.js` | SVG interviewer and its state animations |
| `src/speech.js` | Text-to-speech and speech recognition wrappers |
| `src/claude.js` | API client, prompts, JSON parsing |
| `src/parser.js` | File reading (md, txt, docx, pdf) and Q&A extraction |
| `src/session.js` | Question ordering, session flow, scoring |
| `src/storage.js` | localStorage for settings, notes and history |
| `src/ui.js` | Screens: setup, interview, summary, settings |

## Prompts (starting point)

**Extract Q&A:** "Extract every interview question and its reference answer from this text. Return only JSON: `[{"question": "...", "answer": "...", "topic": "..."}]`."

**Evaluate answer:** "You are a {persona} interviewer for an Engineering Manager role. Compare the candidate's answer with the reference answer. Return only JSON: `{"score": 0-10, "covered": [...], "missed": [...], "tip": "...", "spoken_feedback": "two short sentences"}`."

**Voice answers:** answers may come from speech recognition, so the evaluate prompt must say: "The answer is a voice transcript and may contain misheard words or misspellings. Judge the meaning, not the spelling, and do not penalise recognition errors." The user can also edit the transcript before submitting.

## Privacy and GitHub notes

- Keep personal Q&A notes out of the repo. They are loaded in the browser and never need to be committed. A `my-notes/` folder is git-ignored for local use.
- GitHub Pages on a **private** repo needs a paid GitHub plan. On a free plan, either make the repo public (safe, because it holds no keys or notes) or run the app locally with `python3 -m http.server`.

## Build order

1. Project scaffold and static page that loads.
2. Avatar with idle, talking and listening states.
3. Speech: speak a line, then capture a spoken answer.
4. Claude client and Settings (API key, model).
5. Document parser and Q&A review screen.
6. Interview loop with feedback.
7. Session summary and history.
8. Mobile polish, README, GitHub Pages deployment.

## Acceptance criteria for v1

- Upload a .docx with 10 questions, review the extracted pairs, and start a session.
- Hear each question, answer by voice, and see the live transcript.
- Receive a score and feedback per answer within a few seconds.
- See a summary at the end, and find it in history after reloading the page.
- Everything works on Chrome on a laptop; typing works on a phone.
