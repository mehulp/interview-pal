# InterviewPal

A daily mock-interview practice tool. Load your own Q&A notes, an animated interviewer asks the questions aloud, you answer by voice (or typing), and Claude gives short feedback compared with your notes.

Status: early scaffold. See [docs/requirements.md](docs/requirements.md) for the full plan.

## Run locally

No build step is needed. From this folder:

```bash
python3 -m http.server
```

Then open <http://localhost:8000> in Chrome. The microphone works on `localhost` and on HTTPS, but not on `file://` pages.

## Privacy

- Your API key is entered in Settings and stored only in your browser (localStorage). It is never committed.
- Documents and answers are sent only to the Anthropic API. No analytics, no other servers.
- Put personal notes in `my-notes/`, which is git-ignored.

## License

MIT, see [LICENSE](LICENSE).
