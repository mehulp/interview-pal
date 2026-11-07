# Changelog

All notable changes to InterviewPal. Dates are when the work was finished.

## Unreleased (Study Hub link)

- **Open a Study Hub plan's practice pack:** a link like `?pack=system-design-week-1&plan=<id>` opens setup with the curated **System Design — Week 1** pack (six questions on consistent hashing and the CAP theorem) ticked for that visit only. One click adds the pack to your library (safe to repeat; your edits are kept). You still choose Guided or Mock and press Start.
- **Back to study plan** on the setup screen, the Questions page and the summary of a linked session. The destination comes from a trusted Study Hub address (local or hosted) plus a validated plan ID, never from the link.
- Unknown packs and invalid plan IDs are refused with a clear message, and a link arriving during a session leaves it untouched. The Questions screen now also picks up changes made in another tab.
- The agreement between the two apps is in `docs/study-hub-integration.md`.

## v2.0.0 (2026-11-05)

A complete redesign of the interface, plus the recording features built since v1.1. Your saved sets, History, settings, API key and saved recordings carry over unchanged. In short: four colour themes, a wide two-column interview with a clear Ready / Answering / Finishing / Review sequence, a simpler one-screen setup with Guided and Mock presets, an optional audio and video recording of answers (video is download-only), and a searchable question library with safe editing and an import preview. The details, step by step:

### UX redesign — Step 6: Question library and import preview

- **A library instead of a page of forms:** pick a set, search and filter its questions (text, topic, complexity, including untagged), read the whole question and reference in a detail view, and edit with an explicit **Edit → Save / Cancel**. On a phone: list first, then the question with a Back button.
- **Honest saving:** "Saved" appears only after the browser really stored the change. If it cannot, your draft stays, with Try again, Copy and Download. Switching question, set or tab with unsaved edits asks Save, Discard or Stay.
- **Validation:** a question can't be empty or repeat another in the same set; the same question is fine in different sets.
- **Delete with Undo** (same ID, content and position; no timer), and a **warning before moving** a question into a set that already has it.
- **Practise this set** opens setup with just that set ticked, without starting anything or touching other choices.
- **Import preview:** notes are read, then every found question is listed (duplicates marked, unrecognised text shown) for you to select and confirm. The destination is fixed when you start, and checked again at confirmation. Cancel changes nothing.
- **Set actions** (rename, clear, delete, **Export all sets**) moved into a menu. Backup file format unchanged; backup import and the demo are now kept only if saving succeeds.
- Test helper: when "Start answer" does not reach "Finish answer" the lifecycle check now prints what the page looked like.

### UX redesign — Step 5: Simpler interview setup

- **One setup screen, three sections:** Questions, Practice approach, and Response and devices, with the less common options under **More options**. A summary above Start says what you are about to do, including the time limit and feedback.
- **Guided rehearsal and Mock interview presets.** Applied only when you choose one (and once on a brand-new installation); your saved choices are never overwritten. The screen says **customised** when you change something afterwards.
- **Clearer names:** Question level → **Question complexity**; Difficulty → **Interview pressure** (Relaxed, Standard, Challenging), with the same rules and stored values, and a plain explanation of the time limit, repeat and skip.
- **Feedback is its own choice:** No feedback, Self-review or AI Coach (the same Coach; unavailable without a key, with a link to Settings).
- **Test microphone and Preview camera in setup.** Neither records or transcribes; both stop when you leave setup or press Start, and a late permission is released. Allowing a camera preview is not consent to record video.
- **Recording is chosen per session:** Off / Audio / Video in setup, never remembered, Off every time setup opens.
- **Honest counts:** how many questions match after the complexity filter and removing repeats, a note when you ask for more than exist, and a link to Questions when there are none.
- The microphone check on the Settings tab now shares the same checker and also releases a late permission.

### UX redesign — Step 4: Coordinated answer and review lifecycle

- **A clear sequence for every question:** question spoken, Ready (**Start answer**), Answering (**Finish answer**), Finishing, then a stable **Review** with **Next question**. Nothing advances by itself, not even when the time runs out. End session stays available throughout.
- **Speak or Type, and Recording Off, Audio or Video**, chosen in the workspace. Recording is Off at the start of every session. Start answer starts what you chose without ever pausing the countdown, and capture never runs while the interviewer is speaking.
- **Speech and recording are reported separately:** either can fail while the other works, and typing is always there. Failed capture is never restarted by itself.
- **Finishing waits for the last words and the recording result** (with limits, so it cannot hang), then opens Review with your response, any recording and the reference. Self-marking no longer moves on by itself.
- **Honest empty responses:** a recording alone is "No response", Coach is not asked and nothing is scored zero; you can type your response or continue without feedback. Outcomes are Answered, No response, Skipped, Timed out or Incomplete.
- **Pending recordings:** never overwritten; starting an answer with recording while one is pending explains your options and offers Continue without recording. Retry is now "Record again" (recording only).
- Repeat question is now available only before you start answering.
- Fixed: words typed while the microphone was listening could be overwritten by a late speech result. Typing now always wins.

### UX redesign — Step 3: Interview workspace and recording review

- **A wider two-column interview:** a large interviewer portrait on the left, and on the right an answer workspace with the question as its heading, progress and countdown, and the reference and response panels beside the portrait. Narrow screens stack. Setup and the other screens keep their widths.
- **Reference answer and Your response tabs** (accessible, keyboard-friendly) keep a typed draft and focus where they are. The "model answer was visible" note now counts only when the reference was actually on screen.
- **Calmer controls:** Answer/Stop and Next first, quieter secondary buttons, and a separate, quiet End session. Self-view moves under the portrait.
- **Recording review inside the workspace** (reusing the same player), with no forced scrolling or focus change when a recording finishes, and a compact header indicator with Open review when it is not on screen. One live camera picture at a time, and a steady "Recording video" line.
- **A full-width summary** replaces the live interview when the session ends.

### UX redesign — Step 2: Shared appearance and colour themes

- **Four light colour themes** in Settings → Appearance: Sage & Forest (the default), Warm Teal, Muted Plum and Classic Blue, chosen from accessible preview cards (native radio inputs, a visible "Selected" mark, keyboard support). The choice applies at once, is remembered, and is set before the page is first drawn, so there is no flash of another theme.
- **Shared colour roles:** every interface colour now comes from semantic variables, including the charts and the recording and alert panels. A white header with a subtle border, a restrained active-tab treatment, and filled primary / quieter secondary buttons. Portraits, camera feeds and recorded media are not recoloured.
- The Step 1 browser checks are kept in `tests/browser/` with a runner (`npm run test:browser`) and honest run instructions.

### UX redesign — Step 1: Reliability

- **Leaving a session asks first.** Switching tab mid-interview now asks; Cancel carries on with the answer, timer and recording untouched, OK ends the session and leaves.
- **Ending a session is safer.** One end path for End, Coach's End and leaving: it waits for the last spoken words, finishes a submission already under way (with its original outcome), and never starts a new question or Coach request. An answer you had started but not submitted is kept as **incomplete** (not scored, not counted in self-marks, weak topics or delivery figures); old history is unaffected.
- **Startup and camera:** a double-clicked Start no longer starts two sessions, leaving during startup cancels it quietly, and a late camera permission after self-view was switched off is released at once.
- **Questions screen:** failed saves are reported with a retry (edits stay on the page), and loading notes keeps the set you pressed Find questions on, handles that set being deleted, and always restores its button.

### v1.4

- **Record video (optional, download only).** An unticked-by-default Include video box in the recorder panel. While recording, a small mirrored preview of you appears in the recorder panel and the rest of the screen stays as it is; the file contains only your camera and microphone. Up to 7 minutes. A video is never stored in the browser: replay it, then Download it. Warnings before leaving or discarding until it has been downloaded. Nothing is uploaded.

### v1.3

- **Record and replay your answers** (optional): Record and Stop on the Interview screen with an optional target length (alert when reached, recording continues), a 10-minute limit, replay with seeking, and Save, Discard, Retry or Download. Saved attempts (several per question) are kept in this browser's IndexedDB and listed on the History tab and under the current question. Adds no audio upload.

### v1.2

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
