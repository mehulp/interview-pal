// Parser: reads notes files and finds question/answer pairs with plain rules (no AI).
//
// Two parts:
//   1. readFile()  turns .md/.txt/.docx/.pdf into plain text (inside the browser).
//   2. parseText() finds the pairs in that text.
//
// A pair looks like: { question, answer, topic, level }   (level is '', 'easy' or 'hard')
// Text that matches no pattern comes back as `unplaced`, so nothing is silently lost.

/* ---------- Part 1: reading files ---------- */

// Libraries are loaded from a CDN only when a .docx or .pdf is actually used.
const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = url;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('Could not load a library. Check your internet connection.'));
    document.head.appendChild(tag);
  });
}

// Word -> HTML (mammoth) -> plain text that keeps headings as "#" and numbered lists as "1."
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  const out = [];
  for (const el of doc.body.children) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      out.push('#'.repeat(Number(tag[1])) + ' ' + el.textContent.trim());
    } else if (tag === 'ol' || tag === 'ul') {
      [...el.children].forEach((li, i) => {
        out.push((tag === 'ol' ? `${i + 1}. ` : '- ') + li.textContent.trim());
      });
    } else {
      out.push(el.textContent.trim());
    }
    out.push('');
  }
  return out.join('\n');
}

async function readDocx(file) {
  if (!window.mammoth) await loadScript(MAMMOTH_URL);
  const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return htmlToText(result.value);
}

async function readPdf(file) {
  const pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    // Rebuild lines: a change in vertical position means a new line.
    let text = '';
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      text += item.str;
      lastY = y;
    }
    pages.push(text);
  }
  return pages.join('\n\n');
}

// Read one file and return its plain text.
export async function readFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'md' || ext === 'txt') return file.text();
  if (ext === 'docx') return readDocx(file);
  if (ext === 'pdf') return readPdf(file);
  throw new Error(`Unsupported file type ".${ext}". Use .md, .txt, .docx or .pdf.`);
}

// Read and parse several files. A bad file is reported in `errors` and the rest still work.
export async function parseFiles(files) {
  const result = { pairs: [], unplaced: [], errors: [] };
  for (const file of files) {
    try {
      const found = parseText(await readFile(file));
      result.pairs.push(...found.pairs);
      result.unplaced.push(...found.unplaced);
    } catch (err) {
      result.errors.push(`${file.name}: ${err.message}`);
    }
  }
  return result;
}

/* ---------- Part 2: finding the pairs ---------- */

const HEADING = /^(#{1,6})\s+(.*\S)\s*$/; // Markdown heading
const Q_LABEL = /^(?:q|question)\s*(?:\d+\s*[.):]|:)\s*(.*)$/i; // "Q:", "Question 3:", "Q1."
const A_LABEL = /^(?:a|ans|answer)\s*(?:\d+\s*[.):]|:)\s*(.*)$/i; // "A:", "Answer:"
const NUMBERED = /^(\d+)\s*[.)]\s+(.+)$/; // "1. text", "2) text"

// True if the text ends with "?", optionally followed by an [easy] / [hard] tag.
const asksQuestion = (text) => /\?\s*(\[(easy|hard)\])?\s*$/i.test(text);

// A "Level: hard" or "Topic: x" line.
const isMetaLine = (line) => /^(level|topic)\s*:/i.test(plainLine(line));

// Remove bold/underline markers and a leading bullet, so "**Q:** text" is seen as "Q: text".
function plainLine(line) {
  return line.replace(/\*\*|__/g, '').trim().replace(/^[-*•]\s+/, '');
}

// Split text into blocks separated by blank lines (used for the unplaced text).
function toBlocks(lines) {
  return lines.join('\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

// Build one pair. Handles "[easy]" / "[hard]" tags and "Level:" / "Topic:" lines.
function makePair(questionText, answerLines, topic) {
  let question = plainLine(questionText).replace(/^\d+\s*[.)]\s+/, '').trim();
  let level = '';
  const tag = question.match(/\s*\[(easy|hard)\]\s*$/i);
  if (tag) {
    level = tag[1].toLowerCase();
    question = question.slice(0, tag.index).trim();
  }

  const kept = [];
  for (const line of answerLines) {
    const lv = plainLine(line).match(/^level\s*:\s*(easy|hard)\s*$/i);
    const tp = plainLine(line).match(/^topic\s*:\s*(.+)$/i);
    if (lv) level = lv[1].toLowerCase();
    else if (tp) topic = tp[1].trim();
    else kept.push(line);
  }
  const answer = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { question, answer, topic: topic || '', level };
}

// Pattern 1: Q: / A: lines (also Question: / Answer:).
function parseLabelled(lines) {
  const pairs = [];
  const loose = [];
  let current = null; // the pair being built
  let topic = '';

  const close = () => {
    if (current) pairs.push(makePair(current.q.join(' '), current.a, current.topic));
    current = null;
  };

  for (const line of lines) {
    const plain = plainLine(line);
    const heading = line.match(HEADING);
    const q = Q_LABEL.exec(plain);
    const a = A_LABEL.exec(plain);

    if (heading) { close(); topic = heading[2]; }
    else if (q) { close(); current = { q: [q[1]], a: [], inAnswer: false, topic }; }
    else if (a && current && !current.inAnswer) { current.inAnswer = true; if (a[1]) current.a.push(a[1]); }
    else if (current) {
      // Level/Topic lines go with the answer lines, where makePair picks them out
      const toAnswer = current.inAnswer || isMetaLine(line);
      (toAnswer ? current.a : current.q).push(line.trim());
    }
    else if (line.trim()) loose.push(line);
  }
  close();
  return pairs.length ? { pairs, unplaced: toBlocks(loose) } : null;
}

// Patterns 2-4 share one walker: `starts` maps a line number to the question text on that line.
// Lines below a question are its answer, up to the next question or heading.
function parseSections(lines, starts) {
  const pairs = [];
  const loose = [];
  let current = null;
  let topic = '';

  const close = () => {
    if (current) pairs.push(makePair(current.q, current.a, current.topic));
    current = null;
  };

  lines.forEach((line, i) => {
    if (starts.has(i)) { close(); current = { q: starts.get(i), a: [], topic }; return; }
    const heading = line.match(HEADING);
    if (heading) { close(); topic = heading[2]; } // a heading that is not a question is a topic
    else if (current) current.a.push(line);
    else if (line.trim()) loose.push(line);
  });
  close();
  return pairs.length ? { pairs, unplaced: toBlocks(loose) } : null;
}

// Pattern 2: headings are the questions, the text below is the answer.
function parseHeadings(lines) {
  const heads = [];
  lines.forEach((line, i) => {
    const m = line.match(HEADING);
    if (m) heads.push({ i, depth: m[1].length, text: m[2] });
  });

  // Prefer headings that end in "?". Otherwise use the deepest heading level.
  let chosen = heads.filter((h) => asksQuestion(h.text));
  if (!chosen.length) {
    const deepest = Math.max(0, ...heads.map((h) => h.depth));
    chosen = heads.filter((h) => h.depth === deepest);
    if (chosen.length < 2) return null; // one lone title is not a list of questions
  }
  return parseSections(lines, new Map(chosen.map((h) => [h.i, h.text])));
}

// Pattern 3: numbered questions ("1. ...").
function parseNumbered(lines) {
  const all = [];
  lines.forEach((line, i) => {
    const m = line.match(NUMBERED); // must start at the left edge, so indented sub-lists stay in answers
    if (m) all.push({ i, text: m[2].trim() });
  });

  // If some numbered lines end in "?", only those are questions.
  let chosen = all.filter((n) => asksQuestion(n.text));
  if (!chosen.length) {
    chosen = all;
    if (chosen.length < 2) return null;
  }
  return parseSections(lines, new Map(chosen.map((n) => [n.i, n.text])));
}

// Pattern 4 (last resort): a short line ending in "?" that starts a paragraph.
function parseQuestionLines(lines) {
  const starts = new Map();
  lines.forEach((line, i) => {
    const text = line.trim();
    const startsBlock = i === 0 || !lines[i - 1].trim();
    if (startsBlock && asksQuestion(text) && text.length <= 250) starts.set(i, text);
  });
  return starts.size ? parseSections(lines, starts) : null;
}

// Find pairs in plain text. Tries the patterns in order and uses the first that works.
export function parseText(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const found = parseLabelled(lines) || parseHeadings(lines) || parseNumbered(lines) || parseQuestionLines(lines);
  if (!found) return { pairs: [], unplaced: toBlocks(lines) };
  found.pairs = found.pairs.filter((p) => p.question);
  return found;
}
