# Pre-publish checklist

Run this before the first push to GitHub, and again before making a repository public or tagging a release. Every command is run from the project folder.

## 1. Scan the whole git history for secrets

```bash
# API keys and tokens in any commit (no output means none found)
git log --all -p --no-color | grep -n -i -E "sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[bp]-|-----BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key['\"]?\s*[:=]\s*['\"][A-Za-z0-9_-]{16,}"
```

The only match you should see is this checklist's own command line (the scan finds the text of the scan). Anything else needs a look.

## 2. Scan the history for private files

```bash
# Every file name ever committed that looks private (no output means none found)
git log --all --name-only --pretty=format: | sort -u | grep -i -E "my-notes|\.env|\.key|interviewpal-sets|zone\.identifier|\.docx|\.pdf|demo-videos|\.webm|\.mp4"

# The full list of files ever committed, to read through by eye
git log --all --name-only --pretty=format: | sort -u | grep -v '^$'

# Who is named as the author (this becomes public)
git log --all --format='%an <%ae>' | sort | uniq -c
```

## 3. Confirm the ignore rules still work

```bash
git check-ignore -v my-notes interviewpal-sets-2026-01-01.json .env demo-videos
```

All four must be listed. Then check that nothing private is staged or untracked:

```bash
git status --short --ignored
```

## 4. Check what is published

- `git ls-files assets/interviewers` lists only files named in `assets/interviewers/NOTICE.md`.
- No file is larger than about 10 MB: `git ls-files -z | xargs -0 du -k | sort -n | tail`.
- `npm run check` and `npm test` both pass (the GitHub Action runs the same).
- The README has no placeholder left that should have been filled: the live demo link and the screenshots.

## 5. Tag

```bash
git tag v1.0.0 7417913        # the end of v1 (done once)
git tag v1.1.0                # the finished v1.1 work
git push origin main --tags   # only when you are ready to publish
```

## Last run

2026-10-12, 37 commits, before step 16 was finished:

| Check | Result |
|---|---|
| Secret patterns in all history | None found |
| Private-looking file names ever committed | None found |
| Authors in history | One: the owner |
| `my-notes/`, `interviewpal-sets-*.json`, `.env`, `demo-videos/` ignored | Yes |
| Largest tracked file | About 140 KB |
| Personal text in tracked files | Only the owner's name in the LICENSE |
