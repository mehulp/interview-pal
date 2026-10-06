# InterviewPal: brief for Claude Code

Build the app described in `docs/requirements.md`. Read that file first; it is the source of truth.

## Working style

- The owner is semi-technical. Explain what you are doing in plain language, and keep the code simple and readable with short comments.
- Build in the order listed under "Build order" in the requirements. After each step, tell me how to run and test it, then wait for my go-ahead.
- Make a small git commit after each working step with a clear message.
- Prefer plain HTML, CSS and JavaScript (ES modules), no build step. Ask before adding any dependency beyond `mammoth` and `pdf.js`.

## Rules

- Never commit an API key, and never put one in code. The key is entered in Settings and kept in localStorage.
- Never commit personal notes. Keep `my-notes/` in `.gitignore`.
- Documents and answers go only to the Anthropic API. No analytics, no other servers.
- Voice defaults to `en-IN`; fall back gracefully if that voice is missing.
- Typing must always work, because speech recognition is unreliable on some browsers.
- Respect `prefers-reduced-motion` in avatar animations.

## First task

1. Create the folder structure from the Modules table in the requirements, plus `.gitignore`, `README.md` and `LICENSE` (MIT).
2. Create `index.html` with a basic responsive layout and a placeholder avatar.
3. Show me how to run it locally with `python3 -m http.server`.

Stop there and wait for my feedback before step 2 of the build order.

## Environment: Ubuntu on WSL

- The project lives in the Linux filesystem (`~/interviewpal`), not under `/mnt/c`, for speed and reliable git.
- Run the dev server inside WSL: `python3 -m http.server 8000`.
- Test in **Google Chrome on the Windows side** at `http://localhost:8000`. WSL forwards localhost automatically, and the Windows microphone works there.
- Do not test voice features by opening the WSL IP address. Microphone access needs `localhost` or HTTPS, so an IP address will block it.
- Do not try to launch a browser from inside WSL. Tell me the URL and I will open it.
- Microphone access also does not work on plain `file://` pages.
