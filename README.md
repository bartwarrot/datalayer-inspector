# DataLayer Inspector Chrome Extension

This is a basic Chrome extension (Manifest V3) inspired by DataSlayer. It adds a new panel to the Chrome Developer Tools that allows you to inspect the `dataLayer` object and monitor `dataLayer.push()` events on any webpage.

## Features

*   Displays the initial state of the `dataLayer` when the DevTools panel is opened.
*   Monitors `dataLayer.push()` calls in real-time.
*   Shows pushed data in a structured, readable JSON format.
*   Handles page navigations by clearing the panel and reloading the `dataLayer`.
*   Built with Manifest V3.

## Installation

1.  **Download or Clone:** Make sure you have all the files (`manifest.json`, `devtools.html`, `devtools.js`, `panel.html`, `panel.js`, `background.js`, `content.js`, and the `icons` folder) in a single directory.
2.  **Open Chrome Extensions:** Open Google Chrome, type `chrome://extensions` in the address bar, and press Enter.
3.  **Enable Developer Mode:** Make sure the "Developer mode" toggle in the top-right corner is enabled.
4.  **Load Unpacked:** Click the "Load unpacked" button.
5.  **Select Directory:** Navigate to the directory where you saved the extension files and select it.

The "DataLayer Inspector" extension should now appear in your list of extensions.

## Usage

1.  Navigate to any webpage where you want to inspect the `dataLayer` (e.g., a site using Google Tag Manager).
2.  Open Chrome Developer Tools (Right-click on the page -> Inspect, or use the keyboard shortcut: `Ctrl+Shift+I` on Windows/Linux, `Command+Option+I` on Mac).
3.  Look for the "DataLayer Inspector" tab in the DevTools panel (you might need to click the `>>` icon if you have many tabs).
4.  Click on the "DataLayer Inspector" tab.
5.  You should see the contents of the `dataLayer` displayed. Any new events pushed to the `dataLayer` will appear at the top of the panel in real-time.

## Notes

*   This is a basic implementation. Features like filtering, searching, or handling complex scenarios (like multiple dataLayers or nested iFrames beyond basic support) are not included.
*   The `content.js` script attempts to handle potential errors during data serialization (e.g., circular references).
*   Console logs are included in the scripts (`background.js`, `content.js`, `panel.js`) to help with debugging the extension itself. You can view these logs in the extension's service worker console (`chrome://extensions` -> DataLayer Inspector -> Inspect views: service worker) and the DevTools console for the panel (open DevTools *for the DevTools panel itself* by undocking the DevTools into a separate window and then pressing `Ctrl+Shift+I` / `Command+Option+I` again). 