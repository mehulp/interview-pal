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

// Returns [{ name, folder, frames }]. `frames` is null for video-clip interviewers.
// Any problem (no file, bad JSON) just means "none installed".
export async function loadInterviewers() {
  try {
    const response = await fetch(`${CLIPS_DIR}/interviewers.json`, { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data?.interviewers)) return [];
    return data.interviewers
      .filter((i) => typeof i?.name === 'string' && i.name.trim() && /^[A-Za-z0-9_-]+$/.test(i?.folder || ''))
      .map((i) => ({ name: i.name.trim(), folder: i.folder, frames: readFrames(i.frames) }));
  } catch {
    return [];
  }
}
