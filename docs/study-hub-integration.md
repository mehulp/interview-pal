# Study Hub ↔ InterviewPal: the shared contract

Both repos follow this page. If you change it, change it in both (`interviewpal/docs/study-hub-integration.md` and `study-hub/docs/interviewpal-integration.md`). It covers saved pairings and the round trip only. AI generation and syncing practice results back are separate work.

## The idea

A Study Hub learning plan can be paired with an InterviewPal practice pack. The plan then shows **Practise in InterviewPal**. InterviewPal opens its normal setup with that pack ticked for the visit, the person chooses how to practise and presses Start, and afterwards **Back to study plan** returns to the same plan.

## The pack

| | |
|---|---|
| Stable key | `system-design-week-1` (never the display name) |
| Display name | System Design — Week 1 |
| Content | Curated in InterviewPal: `src/packs.js` (six questions on consistent hashing and CAP theorem) |

Study Hub stores only the key. Supported keys are explicit on both sides: Study Hub's items service accepts only keys in `schemas.InterviewPalPackKey` (anything else is rejected with 422) and its form offers only the labels in `web/src/lib/interviewpalPacks.ts`; InterviewPal ignores keys it does not ship. To add a pack: add it to `src/packs.js` (InterviewPal), then to those two Study Hub places.

## The link (Study Hub → InterviewPal)

    <InterviewPal base URL>?pack=<pack key>&plan=<Study Hub plan UUID>

- `pack` must be a shipped key. An unknown key changes nothing and shows a message.
- `plan` must be a UUID. Anything else is ignored (the pack still opens; there is no Back button).
- The base URL keeps any base path and a trailing slash: `http://localhost:8010/` locally, `https://mehulp.github.io/interview-pal/` hosted.
- Study Hub builds the link from the plan's **saved** pairing; the base URL comes from `VITE_INTERVIEWPAL_URL` at build time.

## The way back (InterviewPal → Study Hub)

InterviewPal never uses an address from the link. It builds `<trusted origin>/plans/<validated plan UUID>`.

| InterviewPal running on | Trusted Study Hub origin |
|---|---|
| localhost, 127.0.0.1, [::1] | `http://localhost:5173` |
| anywhere else (hosted) | `https://study-hub.mehul-patankar.workers.dev` |

These two values are `STUDY_HUB_ORIGINS` in `src/packs.js`. Change them there if Study Hub moves.

**Back to study plan** is offered on the Interview setup screen and the Questions page (each asks "without practising?" first) and on the summary of a session started from the link. Leaving follows the existing safeguards: an unsaved question edit asks Save / Discard / Stay, and the browser asks before leaving with an unsaved recording.

## What InterviewPal guarantees

- The link ticks the pack **for that visit only**; the usual saved selection is untouched, even after a linked session.
- The person still chooses Guided rehearsal or Mock interview and presses Start.
- Adding the pack to the library is one explicit click, safe to repeat (no duplicates, no overwriting edits; a renamed set is still found by its key).
- A link that arrives during a running session does not touch it.

## Setting it up

Local: InterviewPal `scripts/interviewpal.sh start` (port 8010) and Study Hub on 5173. Study Hub needs no setting if InterviewPal is at `http://localhost:8010/`. Hosted: set `VITE_INTERVIEWPAL_URL=https://mehulp.github.io/interview-pal/` when building Study Hub; InterviewPal needs no setting (it picks the hosted Study Hub origin because it is not on localhost). The Study Hub database change is migration `0004` in the items service (see Study Hub's `docs/interviewpal-integration.md`).
