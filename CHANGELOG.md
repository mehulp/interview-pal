# Changelog

All notable changes to InterviewPal. Dates are when the work was finished.

## Unreleased (UX redesign — Step 2: Shared appearance and colour themes)

- **Four light colour themes** in Settings → Appearance: Sage & Forest (the default), Warm Teal, Muted Plum and Classic Blue, chosen from accessible preview cards (native radio inputs, a visible "Selected" mark, keyboard support). The choice applies at once, is remembered, and is set before the page is first drawn, so there is no flash of another theme.
- **Shared colour roles:** every interface colour now comes from semantic variables, including the charts and the recording and alert panels. A white header with a subtle border, a restrained active-tab treatment, and filled primary / quieter secondary buttons. Portraits, camera feeds and recorded media are not recoloured.
- The Step 1 browser checks are kept in `tests/browser/` with a runner (`npm run test:browser`) and honest run instructions.

## Unreleased (UX redesign — Step 1: Reliability)

- **Leaving a session asks first.** Switching tab mid-interview now asks; Cancel carries on with the answer, timer and recording untouched, OK ends the session and leaves.
- **Ending a session is safer.** One end path for End, Coach's End and leaving: it waits for the last spoken words, finishes a submission already under way (with its original outcome), and never starts a new question or Coach request. An answer you had started but not submitted is kept as **incomplete** (not scored, not counted in self-marks, weak topics or delivery figures); old history is unaffected.
- **Startup and camera:** a double-clicked Start no longer starts two sessions, leaving during startup cancels it quietly, and a late camera permission after self-view was switched off is released at once.
- **Questions screen:** failed saves are reported with a retry (edits stay on the page), and loading notes keeps the set you pressed Find questions on, handles that set being deleted, and always restores its button.

## Unreleased (v1.4)

- **Record video (optional, download only).** An unticked-by-default Include video box in the recorder panel. While recording, a small mirrored preview of you appears in the recorder panel and the rest of the screen stays as it is; the file contains only your camera and microphone. Up to 7 minutes. A video is never stored in the browser: replay it, then Download it. Warnings before leaving or discarding until it has been downloaded. Nothing is uploaded.

## Unreleased (v1.3)

- **Record and replay your answers** (optional): Record and Stop on the Interview screen with an optional target length (alert when reached, recording continues), a 10-minute limit, replay with seeking, and Save, Discard, Retry or Download. Saved attempts (several per question) are kept in this browser's IndexedDB and listed on the History tab and under the current question. Adds no audio upload.

## Unreleased (v1.2)

- **Show model answer** on the Interview screen: a setting (off by default) and a Show answer / Hide answer button for the current session. The panel is full width under the cards, never spoken, and the timer keeps running. In self-marking the reveal step is skipped when the answer is already visible. Sessions where it was visible are flagged in History and on the summary, in Practice and Coach modes.
- **The same question can now be in several sets.** A question is unique within a set only, so the demo set no longer stops a question from reaching your own set. When several ticked sets share a question it is asked once (the copy with a model answer is used). Moving a question into a set that already has it just removes it from the old one.
- **Try the demo** card moved to the top of the Questions tab. It no longer changes the open set, shows a count and an Open demo set button, and becomes a one-line note once the demo set exists.

## v1.1.0 (2026-10)

Make it publishable.

- The three AI-generated interviewers are now part of the repository, with a `NOTICE.md` that says how they were made and that they are not MIT-licensed. The drawn face is still the fallback if the files fail to load.
- **Try the demo:** a button on the Questions tab that loads 20 generic Engineering Manager questions with model answers. No network call.
- **Delivery analytics:** filler words, words per minute (spoken answers only) and use of the timer, per answer and for the session, saved in History. Worked out on the device from text and timings; no audio is kept.
- **Progress view** on the History tab: score and self-mark trend, sessions per day, a weak-topics heat map and a daily streak. Plain SVG and CSS.
- Unit tests with Node's built-in test runner, and a GitHub Action that runs the syntax check and the tests on every push.
- README opening, changelog and a pre-publish checklist.
- Published on GitHub Pages and checked on a real phone.
- README screenshots, and a styled architecture page (`docs/architecture.html`) alongside the Markdown one.

## v1.0.0 (2026-10)

The first complete version.

- Practice mode (no AI, no key) with serial or random order, a level filter, three difficulties, a timer and optional self-marking.
- Coach mode (Anthropic API key) with a score and feedback for each answer.
- Question sets with JSON export and import, and a rule-based reader for .md, .txt, .docx and .pdf notes.
- Realistic interviewers from photo frames, with a matching voice and a pick by difficulty. Optional camera self-view that never records.
- Voice answers with keep-listening, microphone choice, a microphone check and an optional on-device recogniser.
- Session summary and a History tab. Phone-friendly layout.
