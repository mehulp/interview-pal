// Progress view (History tab): trend chart, sessions per day, weak-topics heat map and streak.
// Drawn with plain SVG and CSS, no chart library. All text is set with textContent.
// Colours come from the theme through CSS classes (see "Progress view" in styles.css), not from here.
import { trendPoints, sessionsPerDay, topicHeat, streak } from './progress.js';

const SVG = 'http://www.w3.org/2000/svg';

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  children.forEach((c) => node.append(c));
  return node;
}

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  children.forEach((c) => node.append(c));
  return node;
}

const shortDate = (ms) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });

/* ---------- Trend: one dot per session, joined by a line ---------- */
function trendChart(points) {
  const W = 320; const H = 150;
  const left = 38; const right = 8; const top = 8; const bottom = 22;
  const x = (i) => (points.length === 1 ? (left + W - right) / 2 : left + (i * (W - left - right)) / (points.length - 1));
  const y = (v) => top + ((100 - v) / 100) * (H - top - bottom);

  const kids = [];
  [0, 50, 100].forEach((v) => {
    kids.push(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: 'prog-grid' }));
    kids.push(svg('text', { x: left - 4, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10, class: 'prog-label' }, [`${v}%`]));
  });
  // Coach scores are round points, self-marks are square ones, so the two lines differ by shape as well as colour
  ['coach', 'mark'].forEach((key) => {
    const dots = points.map((p, i) => ({ v: p[key], i })).filter((d) => d.v !== null);
    if (!dots.length) return;
    if (dots.length > 1) {
      kids.push(svg('polyline', { points: dots.map((d) => `${x(d.i)},${y(d.v)}`).join(' '), class: `prog-line ${key}` }));
    }
    dots.forEach((d) => {
      const tip = svg('title', {}, [`${shortDate(points[d.i].t)}: ${d.v}%`]);
      kids.push(key === 'coach'
        ? svg('circle', { cx: x(d.i), cy: y(d.v), r: 3.5, class: 'prog-point coach' }, [tip])
        : svg('rect', { x: x(d.i) - 3.5, y: y(d.v) - 3.5, width: 7, height: 7, class: 'prog-point mark' }, [tip]));
    });
  });
  kids.push(svg('text', { x: left, y: H - 6, 'font-size': 10, class: 'prog-label' }, [shortDate(points[0].t)]));
  kids.push(svg('text', { x: W - right, y: H - 6, 'text-anchor': 'end', 'font-size': 10, class: 'prog-label' }, [shortDate(points[points.length - 1].t)]));

  return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'prog-chart', role: 'img', 'aria-label': 'Score and self-mark trend over your sessions' }, kids);
}

/* ---------- Sessions per day: a bar for each of the last 14 days ---------- */
function dayBars(days) {
  const W = 320; const H = 90; const bottom = 16;
  const max = Math.max(1, ...days.map((d) => d.count));
  const slot = W / days.length;
  const kids = days.map((d, i) => {
    const h = (d.count / max) * (H - bottom - 14);
    return svg('rect', { x: i * slot + 3, y: H - bottom - h, width: slot - 6, height: Math.max(h, d.count ? 2 : 0), rx: 2, class: 'prog-bar' }, [svg('title', {}, [`${d.day}: ${d.count} session(s)`])]);
  });
  days.forEach((d, i) => {
    if (d.count) kids.push(svg('text', { x: i * slot + slot / 2, y: H - bottom - (d.count / max) * (H - bottom - 14) - 3, 'text-anchor': 'middle', 'font-size': 10, class: 'prog-count' }, [String(d.count)]));
  });
  kids.push(svg('text', { x: 2, y: H - 3, 'font-size': 10, class: 'prog-label' }, [shortDate(new Date(days[0].day.replace(/-/g, '/')).getTime())]));
  kids.push(svg('text', { x: W - 2, y: H - 3, 'text-anchor': 'end', 'font-size': 10, class: 'prog-label' }, ['today']));
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'prog-chart', role: 'img', 'aria-label': 'Sessions per day over the last 14 days' }, kids);
}

/* ---------- Heat map: a row per topic, shaded by how often it was weak ---------- */
function heatMap(topics) {
  return el('div', { className: 'heat' }, topics.map((t) => {
    // Green when rarely weak, through yellow to red when often weak
    const hue = Math.round(120 * (1 - t.weakRate));
    const cell = el('div', { className: 'heat-cell', textContent: `${Math.round(t.weakRate * 100)}% weak` });
    cell.style.background = `hsl(${hue}, 70%, 82%)`;
    return el('div', { className: 'heat-row' }, [
      el('span', { className: 'heat-topic', textContent: t.topic }),
      cell,
      el('span', { className: 'heat-count', textContent: `${t.weak} of ${t.answered} answers` }),
    ]);
  }));
}

function legend() {
  const item = (series, text) => el('span', { className: 'prog-key' }, [el('span', { className: `prog-dot ${series}` }), text]);
  return el('p', { className: 'hint' }, [item('coach', 'Coach score (as a percentage, round points)'), ' ', item('mark', 'Self-mark result (Got it = full, Partly = half; square points)')]);
}

// Draw everything into `container` from the saved history.
export function renderProgress(container, history) {
  const parts = [el('h2', { textContent: 'Progress' })];
  if (!history.length) {
    parts.push(el('p', { className: 'hint', textContent: 'Nothing to show yet. Finish a few sessions and your trends, a daily streak and your weak topics will appear here.' }));
    container.replaceChildren(...parts);
    return;
  }

  const s = streak(history);
  parts.push(el('p', { className: 'sum-result', textContent: s.current ? `🔥 ${s.current}-day streak` : 'No streak right now' }));
  parts.push(el('p', {
    className: 'hint',
    textContent: s.current && !s.practisedToday
      ? `Practise today to keep it going. Your longest streak is ${s.longest} day(s).`
      : `Your longest streak is ${s.longest} day(s). A day counts when you finish at least one session.`,
  }));

  const points = trendPoints(history);
  parts.push(el('h3', { textContent: 'Score and self-mark trend' }));
  if (points.length) parts.push(trendChart(points), legend());
  else parts.push(el('p', { className: 'hint', textContent: 'Sessions with a Coach score or self-marks show up here. Plain Practice without marking is not scored.' }));

  parts.push(el('h3', { textContent: 'Sessions per day (last 14 days)' }), dayBars(sessionsPerDay(history, 14)));

  const topics = topicHeat(history);
  parts.push(el('h3', { textContent: 'Weak topics' }));
  if (topics.length) {
    parts.push(el('p', { className: 'hint', textContent: 'How often answers in each topic were weak (a Coach score of 5 or less, or self-marked Partly or Missed). Weakest first.' }), heatMap(topics));
  } else {
    parts.push(el('p', { className: 'hint', textContent: 'Turn on self-marking or use Coach mode, and the topics you find hardest will show here.' }));
  }
  container.replaceChildren(...parts);
}
