# Interviewer clips

Put short video clips of a realistic interviewer here. Until you do, the app uses its drawn face.

## Adding an interviewer

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

You can add several interviewers, for example a friendly one and a stern one.

## What the clips should look like

- MP4 (H.264), 720p or 1080p, muted or with the sound removed, 10 to 20 seconds each, under about 10 MB.
- Same person, framing and lighting in both clips, so switching does not jump.
- Front-facing, looking straight into the camera, head and shoulders centred, eyes in the upper third.
- Still camera: no zoom, no cuts, hands out of frame.
- Clips do not need to loop perfectly. The app cross-fades at the loop point.
- `listening`: attentive, blinks, small slow nods, mouth closed.
- `talking`: speaking calmly to the camera, natural lip movement.

## Tips

- Generate one portrait image first, then make both clips from it with an "image to video" tool, so it is the same face.
- Use AI-generated people or footage you have the right to use. Do not use a real person's likeness without permission.
- If a clip is slow to start from a local server, re-save it with the "fast start" option (for ffmpeg: `-movflags +faststart`).
