// Interviewers: finds out which interviewer clip folders are installed.
// The list lives in assets/interviewers/interviewers.json (see the README next to it).

export const CLIPS_DIR = 'assets/interviewers';

// Returns [{ name, folder }]. Any problem (no file, bad JSON) just means "none installed".
export async function loadInterviewers() {
  try {
    const response = await fetch(`${CLIPS_DIR}/interviewers.json`, { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data?.interviewers)) return [];
    return data.interviewers
      .filter((i) => typeof i?.name === 'string' && i.name.trim() && /^[A-Za-z0-9_-]+$/.test(i?.folder || ''))
      .map((i) => ({ name: i.name.trim(), folder: i.folder }));
  } catch {
    return [];
  }
}
