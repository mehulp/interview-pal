// Interviewers: finds out which interviewer clip folders are installed.
// The list lives in assets/interviewers/interviewers.json (see the README next to it).

export const CLIPS_DIR = 'assets/interviewers';

// File names must be plain names (no folders, no leading dot).
const SAFE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const isFile = (name) => typeof name === 'string' && SAFE_FILE.test(name);

// Photo frames: { neutral, neutral2 (optional), blink, talk: [one or more] }, or null if not given/valid.
function readFrames(frames) {
  if (!frames || typeof frames !== 'object') return null;
  const talk = Array.isArray(frames.talk) ? frames.talk.filter(isFile) : [];
  if (!isFile(frames.neutral) || !isFile(frames.blink) || !talk.length) return null;
  return { neutral: frames.neutral, neutral2: isFile(frames.neutral2) ? frames.neutral2 : '', blink: frames.blink, talk };
}

const LEVELS = ['easy', 'medium', 'hard'];

// Optional "difficulty": ["hard"] means this interviewer is used for those rounds in Automatic mode.
const readDifficulty = (d) => (Array.isArray(d) ? d.filter((x) => LEVELS.includes(x)) : []);

// Optional "voice": { "gender": "female", "name": "Heera", "pitch": 0.9 }. All parts are optional.
function readVoice(voice) {
  if (!voice || typeof voice !== 'object') return null;
  const gender = voice.gender === 'female' || voice.gender === 'male' ? voice.gender : '';
  const name = typeof voice.name === 'string' ? voice.name.trim().slice(0, 40) : '';
  const pitch = Number.isFinite(voice.pitch) ? Math.min(1.5, Math.max(0.5, voice.pitch)) : 1;
  return gender || name || pitch !== 1 ? { gender, name, pitch } : null;
}

// Returns [{ name, folder, frames, difficulty, voice }]. `frames` is null for video-clip interviewers.
// Any problem (no file, bad JSON) just means "none installed".
export async function loadInterviewers() {
  try {
    const response = await fetch(`${CLIPS_DIR}/interviewers.json`, { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data?.interviewers)) return [];
    return data.interviewers
      .filter((i) => typeof i?.name === 'string' && i.name.trim() && /^[A-Za-z0-9_-]+$/.test(i?.folder || ''))
      .map((i) => ({ name: i.name.trim(), folder: i.folder, frames: readFrames(i.frames), difficulty: readDifficulty(i.difficulty), voice: readVoice(i.voice) }));
  } catch {
    return [];
  }
}

// Automatic mode: choose who interviews you for this difficulty.
//   - An interviewer that lists this difficulty is used (for example the tough one for "hard").
//   - Otherwise one of the interviewers that list no difficulty is picked at random.
//   - avoidFolder is last time's pick, so you do not get the same face twice in a row when there is a choice.
export function pickInterviewer(list, difficulty, avoidFolder = '') {
  const matched = list.filter((i) => i.difficulty.includes(difficulty));
  const open = list.filter((i) => !i.difficulty.length);
  const pool = matched.length ? matched : open.length ? open : list;
  const fresh = pool.filter((i) => i.folder !== avoidFolder);
  const choices = fresh.length ? fresh : pool;
  return choices[Math.floor(Math.random() * choices.length)] || null;
}
