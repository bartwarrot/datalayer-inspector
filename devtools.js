// Create the DevTools panel
chrome.devtools.panels.create(
  "DataLayer Inspector",      // Title of the panel
  "icons/icon48.png",       // Icon for the panel (optional)
  "panel.html",             // HTML page for the panel's content
  function(panel) {
    // Code to run when the panel is created (optional)
    console.log("DataLayer Inspector panel created");
  }
); 