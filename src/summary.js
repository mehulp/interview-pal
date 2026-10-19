// Summary: draws one session's summary. Used at the end of a session and on the History tab.
// All text is set with textContent, so answers and feedback can't inject HTML.
import { summarize, weakSpots, formatDuration, formatDate, MARK_TEXT } from './history.js';
import { summarizeDelivery, describeDelivery, paceLabel, listFillers } from './delivery.js';

// Small helper to build an element.
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

const list = (items) => el('ul', {}, items.map((text) => el('li', { textContent: text })));

// How a question went, in a few words.
function outcome(r) {
  const parts = [];
  if (r.skipped) parts.push('skipped');
  else if (r.score !== null) parts.push(`${r.score}/10`);
  else if (r.mark) parts.push(MARK_TEXT[r.mark]);
  else parts.push('answered');
  if (r.timedOut) parts.push('time up');
  return parts.join(', ');
}

// The details shown when a question is opened.
function questionDetails(r, index) {
  const body = el('div', { className: 'sum-body' });
  if (r.skipped) {
    body.append(el('p', { textContent: 'You skipped this question.' }));
  } else {
    body.append(el('p', {}, [el('strong', { textContent: 'Your answer' })]));
    body.append(el('p', { className: 'sum-answer', textContent: r.answer || '(no answer)' }));
  }
  if (r.timedOut) body.append(el('p', { textContent: 'The time ran out.' }));
  if (r.answerShown) body.append(el('p', { className: 'sum-note', textContent: 'The model answer was visible for this question.' }));
  if (r.mark) body.append(el('p', { textContent: `Your self-mark: ${MARK_TEXT[r.mark]}.` }));
  if (r.feedbackSkipped) body.append(el('p', { textContent: 'The AI feedback was skipped for this question.' }));
  if (r.score !== null && !r.skipped) {
    if (r.noAnswer) body.append(el('p', { textContent: 'No answer was given, so it scored 0.' }));
    if (r.noReference) body.append(el('p', { textContent: 'No reference answer was saved, so this was judged on general merit.' }));
    if (r.covered.length) body.append(el('p', {}, [el('strong', { textContent: 'You covered' })]), list(r.covered));
    if (r.missed.length) body.append(el('p', {}, [el('strong', { textContent: 'You missed' })]), list(r.missed));
    if (r.tip) body.append(el('p', {}, [el('strong', { textContent: 'Tip: ' }), r.tip]));
  }
  if (r.delivery && !r.skipped) {
    body.append(el('p', {}, [el('strong', { textContent: 'Delivery' })]), list(describeDelivery(r.delivery)));
  }
  const detail = [r.set && `Set: ${r.set}`, r.topic && `Topic: ${r.topic}`, r.level && `Level: ${r.level}`].filter(Boolean).join(' · ');
  if (detail) body.append(el('p', { className: 'sum-note', textContent: detail }));

  return el('details', {}, [
    el('summary', {}, [`${index + 1}. ${r.question} `, el('span', { className: 'sum-note', textContent: `(${outcome(r)})` })]),
    body,
  ]);
}

// Draw the summary into `container`. `note` is an optional line, for example about saving.
export function renderSummary(container, record, note = '') {
  const s = summarize(record);
  const parts = [
    el('h2', { textContent: record.completed ? 'Session summary' : 'Session summary (ended early)' }),
    el('p', { className: 'sum-when', textContent: formatDate(record.startedAt) }),
    el('p', {
      textContent: `${s.asked} of ${s.total} question(s) asked · ${s.skipped} skipped · ${s.timedOut} ran out of time · ${formatDuration(s.durationSec)}`,
    }),
  ];

  if (record.answersVisible) {
    parts.push(el('p', { className: 'hint', textContent: 'The model answer was visible during this session, so the results may look better than a closed-book attempt.' }));
  }

  // The result: an average score (Coach), or the self-marks (Practice). Plain Practice has no score.
  if (s.average !== null) {
    parts.push(el('p', { className: 'sum-result', textContent: `Average score: ${s.average.toFixed(1)} / 10` }));
  } else if (s.markedCount) {
    parts.push(el('p', { className: 'sum-result', textContent: `${s.marks.got} got it · ${s.marks.partly} partly · ${s.marks.missed} missed` }));
  } else {
    parts.push(el('p', { className: 'hint', textContent: 'Nothing was scored in this session.' }));
  }

  // Topics to revisit (only when something was scored or self-marked)
  if (s.average !== null || s.markedCount) {
    const weak = weakSpots(record.results);
    parts.push(el('h3', { textContent: 'Topics to revisit' }));
    if (!weak.length) {
      parts.push(el('p', { textContent: 'Nothing to revisit. Well done.' }));
    } else {
      parts.push(el('ul', { className: 'sum-weak' }, weak.map((w) => el('li', {}, [
        el('strong', { textContent: `${w.topic || 'No topic set'} (${w.questions.length})` }),
        list(w.questions),
      ]))));
    }
  }

  // Delivery totals (Records from before v1.1 have none, so nothing is shown for them)
  const delivery = summarizeDelivery(record.results);
  if (delivery) {
    const lines = [];
    lines.push(delivery.wpm !== null
      ? `Pace: ${delivery.wpm} words per minute, ${paceLabel(delivery.wpm)} (spoken answers only)`
      : 'Pace: not enough spoken words to measure');
    lines.push(`Filler words: ${delivery.fillers} in ${delivery.words} words (${delivery.fillersPer100} per 100 words)`
      + (delivery.fillers ? `: ${listFillers(delivery.fillerWords)}` : ''));
    if (delivery.timerUsed !== null) lines.push(`On average you used ${delivery.timerUsed}% of the timer`);
    parts.push(el('h3', { textContent: 'Delivery' }), list(lines));
    parts.push(el('p', { className: 'hint', textContent: 'Worked out on this device from your words and timings. Nothing is recorded or sent. Some browsers leave "um" and "uh" out of voice transcripts, so the filler count can be low.' }));
  }

  parts.push(el('h3', { textContent: 'Question by question' }));
  parts.push(el('ol', { className: 'sum-questions' }, record.results.map((r, i) => el('li', {}, [questionDetails(r, i)]))));
  if (note) parts.push(el('p', { className: 'hint', textContent: note }));

  container.className = 'sum';
  container.replaceChildren(...parts);
}
