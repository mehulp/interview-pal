# Interviewer photos and clips

Put photos or short video clips of a realistic interviewer here. If none are installed, the app uses its drawn face.
The interviewers that come with the app are AI-generated and are committed; see [NOTICE.md](NOTICE.md) (added in v1.1). If you add your own, they must be AI-generated or otherwise rights-cleared, must never use a real person's likeness, and must be listed in NOTICE.md before you commit them. Keep clips small.
There are two ways to make an interviewer: photos (easy) or video clips.

## Option 1: photos (a few stills of one person)

Use 4 to 6 photos of the same person with the same framing and background, for example a burst or a photo series:

- `neutral`: closed mouth, looking at the camera
- `neutral2` (optional): another closed-mouth look, for a small change of expression
- `blink`: eyes closed
- `talk` (one or more): mouth open in different shapes, as if speaking. More frames with different mouth shapes (for example a rounded "oo" and a wide "ee") make the talking look more natural

If a set has no separate second neutral photo, leave `neutral2` out. To use an interviewer only for some rounds in Automatic mode, add `"difficulty": ["hard"]` to its entry. For example, a tough-looking interviewer can be used for Hard rounds, and the others are picked at random for Easy and Medium.

To give an interviewer a matching voice, add `"voice": { "gender": "female" }` (or `"male"`) to its entry. You can also add `"name": "Heera"` to prefer a voice whose name contains that text, and `"pitch": 0.9` to make it a little lower or higher (between 0.5 and 1.5). The browser does not say whether a voice is male or female, so the app guesses from the voice's name. The Interview screen shows which voice was chosen. If no suitable voice is found on your device, the pitch is adjusted and the page says so.

The app swaps between them: blinks and slow expression changes while you answer, and quick mouth-open and closed frames while the interviewer speaks. Put the photos in a folder (letters, numbers, `-` or `_` in the name) and list them in `interviewers.json`:

```json
{
  "interviewers": [
    {
      "name": "Interviewer 1",
      "folder": "interviewer-1",
      "frames": {
        "neutral": "neutral.webp",
        "neutral2": "neutral2.webp",
        "blink": "blink.webp",
        "talk": ["talk1.webp", "talk2.webp", "talk3.webp", "talk4.webp"]
      }
    }
  ]
}
```

Any common image type works (`.webp`, `.jpg`, `.png`). The picture is cropped to a wide shape with the eyes in the upper third, so keep the face centred.

## Option 2: video clips

### Adding an interviewer with clips

1. Make a folder named after the interviewer, using only letters, numbers, `-` or `_`:
   `assets/interviewers/priya/`
2. Put two clips in it:
   - `listening.mp4` is played while you answer, and when the interviewer is idle
   - `talking.mp4` is played while the interviewer speaks
3. Add the interviewer to `interviewers.json`:
   ```json
   {
     "interviewers": [
       { "name": "Priya", "folder": "priya" }
     ]
   }
   ```
4. Reload the app. On the Interview screen, choose the interviewer under "Interviewer face".

For clips, leave out `frames` in `interviewers.json`.

You can add several interviewers, for example a friendly one and a stern one.

### What the clips should look like

- MP4 (H.264), 720p or 1080p, muted or with the sound removed, 10 to 20 seconds each, under about 10 MB.
- Same person, framing and lighting in both clips, so switching does not jump.
- Front-facing, looking straight into the camera, head and shoulders centred, eyes in the upper third.
- Still camera: no zoom, no cuts, hands out of frame.
- Clips do not need to loop perfectly. The app cross-fades at the loop point.
- `listening`: attentive, blinks, small slow nods, mouth closed.
- `talking`: speaking calmly to the camera, natural lip movement.

### Tips

- Generate one portrait image first, then make both clips from it with an "image to video" tool, so it is the same face.
- Use AI-generated people or footage you have the right to use. Do not use a real person's likeness without permission.
- If a clip is slow to start from a local server, re-save it with the "fast start" option (for ffmpeg: `-movflags +faststart`).
