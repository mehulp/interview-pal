// Sets the saved colour theme BEFORE the page is first drawn, so there is no flash of the wrong colours.
// This is an ordinary (not module) script, loaded in the <head>, because modules run too late for that.
//
// It is a narrow exception to "everything saved goes through storage.js": it reads the one `theme`
// setting directly from the settings key, and only applies it if it is one of the IDs below. Anything
// else (nothing saved, an unknown value, unreadable storage) leaves the default, Sage & Forest, which is
// what styles.css shows when no theme is set. The ID list must match src/themes.js (a test checks).
(function () {
  var IDS = ['sage', 'teal', 'plum', 'blue'];
  try {
    var settings = JSON.parse(localStorage.getItem('interviewpal.settings'));
    var theme = settings && settings.theme;
    if (IDS.indexOf(theme) !== -1) document.documentElement.setAttribute('data-theme', theme);
  } catch (err) {
    // storage blocked or unreadable: keep the default
  }
})();
