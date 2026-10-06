// UI: wires the page together. For now it only drives the avatar test control.
import { createAvatar } from './avatar.js';

const avatar = createAvatar(document.getElementById('avatar'));

// Test buttons: click one to put the avatar in that state.
const testButtons = document.querySelectorAll('.state-test button');
testButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    avatar.setState(btn.dataset.state);
    testButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
});
