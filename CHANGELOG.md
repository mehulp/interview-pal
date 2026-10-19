# Changelog

All notable changes to InterviewPal. Dates are when the work was finished.

## Unreleased (v1.2)

- **Show model answer** on the Interview screen: a setting (off by default) and a Show answer / Hide answer button for the current session. The panel is full width under the cards, never spoken, and the timer keeps running. In self-marking the reveal step is skipped when the answer is already visible. Sessions where it was visible are flagged in History and on the summary, in Practice and Coach modes.
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
