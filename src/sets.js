// Sets: the rules for question sets. No page code here, so it is easy to test.
//
// A set looks like:  { id, name, questions: [ { id, question, answer, topic, level } ] }
// The main rule: a question (ignoring case and extra spaces) can exist only once INSIDE a set.
// The same question may be in several sets, each copy with its own answer, topic and level.
// When several sets are practised together, session.js drops the repeats (see removeRepeats).

export const DEFAULT_SET_NAME = 'My questions';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Compare questions ignoring capital letters and extra spaces.
export const normalize = (text) => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const createSet = (name) => ({ id: newId(), name, questions: [] });

// Is this set name already used? (exceptId lets a set keep its own name when renamed)
export function nameTaken(sets, name, exceptId) {
  return sets.some((s) => s.id !== exceptId && normalize(s.name) === normalize(name));
}

// Does this one set already hold the question? Returns the question, or undefined.
export function findInSet(set, text) {
  const key = normalize(text);
  return set.questions.find((q) => normalize(q.question) === key);
}

const cleanLevel = (level) => (level === 'easy' || level === 'hard' ? level : '');

// Add questions to one set. A question that is already in THAT set is skipped (other sets do not matter).
// Returns { added: number, skipped: [{ question, setName }] }, where setName is the set it was already in.
export function addQuestions(sets, setId, pairs) {
  const target = sets.find((s) => s.id === setId);
  let added = 0;
  const skipped = [];
  for (const p of pairs) {
    if (!normalize(p.question)) continue; // nothing to add
    if (findInSet(target, p.question)) {
      skipped.push({ question: p.question, setName: target.name });
      continue;
    }
    target.questions.push({
      id: newId(),
      question: String(p.question).trim(),
      answer: String(p.answer || '').trim(),
      topic: String(p.topic || '').trim(),
      level: cleanLevel(p.level),
    });
    added++;
  }
  return { added, skipped };
}

// Move a question from one set to another (it leaves the old set).
// Returns 'moved', or 'merged' if the other set already had that question (then it only leaves
// the old set and the other set's copy is kept as it is), or false if nothing could be moved.
export function moveQuestion(sets, fromId, questionId, toId) {
  const from = sets.find((s) => s.id === fromId);
  const to = sets.find((s) => s.id === toId);
  const index = from ? from.questions.findIndex((q) => q.id === questionId) : -1;
  if (!to || index === -1 || fromId === toId) return false;
  const [question] = from.questions.splice(index, 1);
  if (findInSet(to, question.question)) return 'merged';
  to.questions.push(question);
  return 'moved';
}

// A short sentence about skipped duplicates, e.g. 'Skipped 3 that were already in "Technical".'
export function describeSkipped(skipped) {
  if (!skipped.length) return '';
  const names = [...new Set(skipped.map((s) => `"${s.setName}"`))].join(', ');
  return `Skipped ${skipped.length} that ${skipped.length === 1 ? 'was' : 'were'} already in ${names}.`;
}

/* ---------- Export and import (JSON file) ---------- */

export function buildExport(sets) {
  return {
    app: 'interviewpal',
    version: 1,
    exportedAt: new Date().toISOString(),
    sets: sets.map((s) => ({
      name: s.name,
      questions: s.questions.map(({ question, answer, topic, level }) => ({ question, answer, topic, level })),
    })),
  };
}

// Check an imported file. Returns the sets inside it, or throws an Error with a plain message.
// Nothing is changed here, so a bad file can never damage your saved sets.
export function parseImport(text) {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('That file is too big to be a sets export.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON, so it cannot be an InterviewPal export.');
  }
  if (!data || data.app !== 'interviewpal') throw new Error('That file was not made by InterviewPal.');
  if (data.version !== 1) throw new Error('That file is from a different version of InterviewPal and cannot be read.');
  if (!Array.isArray(data.sets) || !data.sets.length) throw new Error('That file contains no sets.');

  return data.sets.map((s, i) => {
    const name = typeof s?.name === 'string' ? s.name.trim() : '';
    if (!name || !Array.isArray(s.questions)) throw new Error(`Set number ${i + 1} in the file is not in the expected format.`);
    const questions = s.questions
      .filter((q) => q && typeof q.question === 'string' && q.question.trim())
      .map((q) => ({ question: q.question, answer: q.answer, topic: q.topic, level: q.level }));
    return { name, questions };
  });
}

// Merge imported sets into the current ones. A set with the same name is merged into;
// a new name creates a new set. Duplicate questions are skipped.
// Returns { added, skipped, created }.
export function mergeImport(sets, imported) {
  let added = 0;
  let created = 0;
  const skipped = [];
  for (const imp of imported) {
    let target = sets.find((s) => normalize(s.name) === normalize(imp.name));
    if (!target) {
      target = createSet(imp.name);
      sets.push(target);
      created++;
    }
    const result = addQuestions(sets, target.id, imp.questions);
    added += result.added;
    skipped.push(...result.skipped);
  }
  return { added, skipped, created };
}
