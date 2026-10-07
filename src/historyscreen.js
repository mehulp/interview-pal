// History tab: list of past sessions. Open one to see its summary, delete it, or clear all.
import { loadHistory, saveHistory } from './storage.js';
import { removeSession, describeSession } from './history.js';
import { renderSummary } from './summary.js';

const $ = (id) => document.getElementById(id);
let openId = null; // the session being shown in detail

function showList() {
  openId = null;
  $('history-detail').hidden = true;
  $('history-list-card').hidden = false;
  const history = loadHistory();
  $('history-count').textContent = `(${history.length})`;
  $('history-clear').hidden = history.length === 0;

  const rows = history.map((record) => {
    const { title, detail } = describeSession(record);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'history-row';
    const t = document.createElement('div');
    t.className = 'row-title';
    t.textContent = title;
    const d = document.createElement('div');
    d.className = 'row-detail';
    d.textContent = detail;
    row.append(t, d);
    row.addEventListener('click', () => showDetail(record));
    return row;
  });
  const empty = document.createElement('p');
  empty.className = 'hint';
  empty.textContent = 'No sessions yet. Finish a practice or coaching session and it will appear here.';
  $('history-list').replaceChildren(...(rows.length ? rows : [empty]));
}

function showDetail(record) {
  openId = record.id;
  $('history-list-card').hidden = true;
  $('history-detail').hidden = false;
  renderSummary($('history-summary'), record);
  window.scrollTo(0, 0);
}

$('history-back').addEventListener('click', showList);

$('history-delete').addEventListener('click', () => {
  if (!openId || !window.confirm('Delete this session from your history?')) return;
  saveHistory(removeSession(loadHistory(), openId));
  $('history-status').textContent = 'Session deleted.';
  showList();
});

$('history-clear').addEventListener('click', () => {
  const count = loadHistory().length;
  if (!count || !window.confirm(`Delete all ${count} saved session(s)? This cannot be undone.`)) return;
  saveHistory([]);
  $('history-status').textContent = 'History cleared.';
  showList();
});

showList();

// Called whenever the History tab is opened, so it shows the latest sessions.
export function refreshHistory() {
  $('history-status').textContent = '';
  showList();
}
