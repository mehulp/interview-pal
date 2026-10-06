// UI: the app shell. Creates the avatar and switches between the Practice and Questions screens.
import { createAvatar } from './avatar.js';
import { initPractice } from './practice.js';
import './review.js'; // sets up the Questions screen

const avatar = createAvatar(document.getElementById('avatar'));
const practice = initPractice(avatar);

const screens = {
  practice: document.getElementById('screen-practice'),
  questions: document.getElementById('screen-questions'),
};
const tabs = document.querySelectorAll('.tabs button');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    practice.leave(); // leaving mid-session ends it quietly
    Object.entries(screens).forEach(([name, node]) => { node.hidden = name !== tab.dataset.screen; });
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t === tab)));
    if (tab.dataset.screen === 'practice') practice.refreshSetup(); // question list may have changed
  });
});
