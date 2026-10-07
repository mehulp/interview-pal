// UI: the app shell. Creates the avatar and switches between the Interview, Questions, History and Settings screens.
import { createAvatar } from './avatar.js';
import { initPractice } from './practice.js';
import './review.js'; // sets up the Questions screen
import './settings.js'; // sets up the Settings screen
import { refreshHistory } from './historyscreen.js'; // sets up the History screen

const avatar = createAvatar(document.getElementById('avatar'));
const practice = initPractice(avatar);

const screens = {
  practice: document.getElementById('screen-practice'),
  questions: document.getElementById('screen-questions'),
  history: document.getElementById('screen-history'),
  settings: document.getElementById('screen-settings'),
};
const tabs = document.querySelectorAll('.tabs button');

let current = 'practice';

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.screen === current) return; // clicking the tab you are on does nothing
    current = tab.dataset.screen;
    practice.leave(); // leaving mid-session ends it (what was answered is kept in History)
    Object.entries(screens).forEach(([name, node]) => { node.hidden = name !== tab.dataset.screen; });
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t === tab)));
    if (current === 'practice') practice.refreshSetup(); // question list may have changed
    if (current === 'history') refreshHistory(); // show the latest sessions
  });
});

// The "Settings" link in the Coach mode note jumps to the Settings tab
document.getElementById('to-settings').addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelector('.tabs [data-screen="settings"]').click();
});
