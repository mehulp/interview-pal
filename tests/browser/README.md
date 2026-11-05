# Scripted browser checks

These scripts drive the real app in a headless Chromium. They cover what the unit tests in `tests/*.test.js` cannot: leaving a session, ending while speech is still arriving, late camera permissions, failed saves, importing while the set changes, recording, themes and so on.

They are **not** part of `npm test` and the GitHub Action does not run them, because they need tools that are not project dependencies.

## What you need

- **Node 22 or newer** and **Python 3** (the local server is `scripts/devserver.py`).
- **`playwright-core`.** Install it without touching `package.json`: `npm install --no-save playwright-core`. Or point at an existing copy: `PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core`.
- **A Chromium or Chrome.** `playwright-core` does not include one. Either run `npx playwright-core install chromium`, or use one you already have: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`.

The scripts start Chromium with a fake camera and microphone, so no hardware is needed. They replace the speech engine with a small stand-in, so **they cannot tell you how real speech recognition, a real microphone or a real camera behaves**. Those need a person (see the manual checklists in `docs/requirements.md`).

## Running them

```bash
npm run test:browser                    # all checks, one after another (starts and stops its own server)
node tests/browser/run-all.mjs appearance regression   # only some, by file name
```

Or run one by hand against a server you started yourself (`python3 scripts/devserver.py 8804`):

```bash
BASE_URL=http://localhost:8804/ node tests/browser/step1-session.mjs
```

Each check prints `PASS` or `FAIL` lines and ends with `ALL PASSED` or `N FAILED`. The exit code is 0 only if everything passed. A check that takes screenshots writes them to the folder named by `SHOTS_DIR` (default: a temporary folder, printed at the end).

## The checks

| File | What it covers |
|---|---|
| `step1-session.mjs` | Leaving a session (Cancel and OK), incomplete answers, no duplicate History, End while speech arrives, double End, recording-only responses, cancelled and double-clicked startup, late camera permission |
| `step1-finalise.mjs` | Next, Skip or the time limit followed by End (original outcome kept, no next question, no Coach request, score unset), a late Coach reply, expiry using a fake clock |
| `step1-questions.mjs` | A failed save with retry, importing notes while the set changes or is deleted, a read failure |
| `regression.mjs` | A full session, self-marking, the model answer, the same question in two sets, audio recording (save, reload, play, delete), video (download only, nothing stored) |
| `workspace.mjs` | The interview workspace and recording review: layout at desktop, short laptop, phone and 200%-zoom sizes, the reference and response panels and tabs, what counts as "viewed", self-marking and Coach feedback, recording in progress and pending (audio and video, an earlier question's), one camera picture, the header indicator, and the full-width summary |
| `library.mjs` | The question library (UX redesign Step 6): browse and select by ID, search and filters, Edit/Save/Cancel, validation, failed saves with retry and copy, guards for unsaved edits, delete with Undo (and its failures), move conflicts, the Set actions menu, Practise this set (no media, no preset change), the import preview (destination fixed, duplicates, unrecognised text, cancel, repeated clicks, deleted destination, failed read and save), backup compatibility, old data without IDs, keyboard, phone, 200% layout and all four themes |
| `setup.mjs` | The setup screen (UX redesign Step 5): a new installation on Guided rehearsal, a returning user's saved settings untouched, presets applied only when chosen and Customised, counts and notes (duplicates, filters, oversized requests, empty sets), AI Coach without a key, Speak/Type and unsupported speech, recording back to Off between sessions, the microphone test and camera preview (cleanup on tab change, Start and microphone change; late permissions; refusal and typing), the configuration reaching the interview (reference shown or hidden, countdown, assisted flag), keyboard order, phone width, 200% layout and all four themes |
| `lifecycle.mjs` | The answer and review lifecycle (UX redesign Step 4): the sequence and the main button in each phase, nothing captured while the interviewer speaks, Speak and Type, recording Off / Audio / Video, a failed recogniser with a good recording and the reverse, a slow or refused permission, a recorder that never stops, double clicks, the hard time limit (fake clock), End during finalisation, empty responses and the skipped / incomplete outcomes, pending recordings across questions, Coach retry / error / skip / empty text, self-marking that does not advance, assisted flags, Repeat, old History, phone layout and keyboard focus |
| `appearance.mjs` | The colour themes: switching, persistence, invalid and missing preferences, blocked storage, keyboard, phone width, 200% zoom, contrast, and that no camera or microphone is requested |

`lib.mjs` holds the shared helpers (launching, the speech and media stand-ins, starting a session). Earlier, more detailed recording and video checks from the v1.3 and v1.4 work were not kept; `regression.mjs` covers their main paths.
