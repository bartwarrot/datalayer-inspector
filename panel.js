const contentDiv = document.getElementById('data-layer-content');
const initialMessage = document.getElementById('initial-message');
const urlElement = document.getElementById('current-url').querySelector('span');
const clearButton = document.getElementById('clear-button');
const urlFiltersDiv = document.getElementById('url-filters'); // Container for checkboxes

let port;
let historyByUrl = {}; // Stores event elements keyed by URL
let currentInspectedUrl = null; // Track the current URL

// Function to request and display the current URL
function updateInspectedUrl() {
    chrome.devtools.inspectedWindow.eval(
        "window.location.href",
        function(result, isException) {
            if (isException) {
                let errorMsg = "Error getting URL";
                if (isException.message) {
                     errorMsg = isException.message;
                     console.error("Could not get window.location.href:", errorMsg);
                } else {
                    try {
                         console.error("Could not get window.location.href (raw exception object):", JSON.stringify(isException));
                    } catch (e) {
                         console.error("Could not get window.location.href (unserializable exception object):", isException);
                    }
                }
                urlElement.textContent = 'Error loading URL';
                currentInspectedUrl = null; // Reset current URL on error
            } else {
                urlElement.textContent = result;
                if (currentInspectedUrl !== result) {
                    console.log("Navigated to new URL:", result);
                    currentInspectedUrl = result;
                    addUrlFilterCheckbox(currentInspectedUrl); // Add checkbox if new
                }
            }
        }
    );
}

// Add a checkbox for a URL if it doesn't exist
function addUrlFilterCheckbox(url) {
    if (!url || document.getElementById(`filter-${url}`)) {
        return; // Don't add if null or already exists
    }
    console.log("Adding filter for URL:", url);

    const checkboxId = `filter-${url}`;
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '3px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkboxId;
    checkbox.value = url;
    checkbox.checked = true; // Default to checked
    checkbox.addEventListener('change', renderFilteredHistory); // Re-render on change

    const label = document.createElement('label');
    label.htmlFor = checkboxId;
    label.textContent = url;
    label.style.marginLeft = '5px';
    label.style.wordBreak = 'break-all'; // Prevent long URLs overflowing

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    urlFiltersDiv.appendChild(wrapper);
}

// Render the history based on checked URL filters
function renderFilteredHistory() {
    console.log("Rendering filtered history...");
    contentDiv.innerHTML = ''; // Clear current display
    let displayedEvents = false;

    const checkedUrls = Array.from(urlFiltersDiv.querySelectorAll('input[type="checkbox"]:checked'))
                           .map(cb => cb.value);

    console.log("Checked URLs:", checkedUrls);

    // Collect all event elements from checked URLs
    let elementsToShow = [];
    checkedUrls.forEach(url => {
        if (historyByUrl[url]) {
            elementsToShow = elementsToShow.concat(historyByUrl[url]);
        }
    });

    // Sort elements by timestamp (newest first)
    elementsToShow.sort((a, b) => (b.dataset.timestamp || 0) - (a.dataset.timestamp || 0));

    // Append sorted elements to the display
    elementsToShow.forEach(element => {
        // Important: Append clones if elements might be reused or re-rendered elsewhere
        // For this approach, we are rebuilding the list, so direct append is fine.
        contentDiv.appendChild(element);
        displayedEvents = true;
    });

     if (!displayedEvents && initialMessage) {
        initialMessage.textContent = 'No events match the selected URL filters (or history is empty).';
        initialMessage.style.display = 'block';
    } else if (initialMessage) {
         initialMessage.style.display = 'none';
    }
}

// Basic JSON Syntax Highlighter (outputs HTML string)
function syntaxHighlight(json) {
    if (typeof json != 'string') {
         json = JSON.stringify(json, undefined, 2); // Indent with 2 spaces
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\b(null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                 // Check if it looks like an error structure from our scripts
                if (match.includes('"error":') || match.includes('"details":') || match.includes('"rawDetail":')){
                    if (match.includes('"[Circular Reference]"')) {
                         cls = 'json-error'; // Highlight circular refs
                    } else {
                         cls = 'json-string';
                    }
                } else if (match.includes('[Circular Reference]')) {
                    cls = 'json-error'; // Highlight circular refs if not quoted
                } else {
                    cls = 'json-string';
                }
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
         // Highlight top-level error keys specifically
        if (cls === 'json-key' && (match === '"error":' || match === '"details":' || match === '"rawDetail":')) {
            cls = 'json-error';
        }

        return '<span class="' + cls + '">' + match + '</span>';
    });
}

function connectToBackground() {
    // Establish connection with the background script
    port = chrome.runtime.connect({ name: 'devtools-panel' });
    console.log('DevTools panel connected to background script.');

    // Send a message to the background script to get the initial dataLayer state
    port.postMessage({
        type: 'GET_DATALAYER',
        tabId: chrome.devtools.inspectedWindow.tabId
    });

    // Listen for messages from the background script
    port.onMessage.addListener((message) => {
        console.log('DevTools panel received message:', message);
        if (message.type === 'DATALAYER_UPDATE') {
            if (initialMessage) {
                initialMessage.style.display = 'none'; // Hide initial message
            }
            processDataLayerEvent(message.payload);
        }
        // Handle potential ERROR messages from background
        else if (message.type === 'ERROR') {
             console.error("Error from background script:", message.payload);
             processDataLayerEvent({ error: "Background Script Error", details: message.payload });
        }
    });

    // Handle disconnection
    port.onDisconnect.addListener(() => {
        // Check if the context is still valid before proceeding
        if (chrome.runtime.lastError) {
            console.warn("DevTools panel disconnected with runtime error (likely context invalidated):", chrome.runtime.lastError.message);
            port = null; // Ensure port is nullified
            // Do not attempt to reconnect if context is invalidated
            return;
        }

        console.log('DevTools panel disconnected from background script. Attempting to reconnect...');
        port = null;
        if (initialMessage) initialMessage.textContent = "Disconnected. Attempting to reconnect...";
        
        // Attempt to reconnect only if the context seems valid
        try {
             setTimeout(connectToBackground, 1500); // Try reconnecting after 1.5 seconds
        } catch (e) {
             console.error("Error scheduling reconnect (context likely invalidated):", e);
        }
    });
}

// Process and store incoming dataLayer events
function processDataLayerEvent(eventData) {
     if (!currentInspectedUrl) {
         console.warn("Received event but current URL is unknown. Ignoring.");
         return;
     }

    const eventDiv = document.createElement('div');
    eventDiv.className = 'event';
    eventDiv.dataset.timestamp = Date.now(); // Store timestamp for sorting
    eventDiv.dataset.url = currentInspectedUrl; // Store URL for reference

    const title = document.createElement('h3');
    if (eventData && typeof eventData === 'object' && eventData.error) {
         title.textContent = `Error: ${eventData.error}`;
         title.style.color = 'red';
    } else {
        title.textContent = eventData.event ? `Event: ${eventData.event}` : 'DataLayer Push';
    }
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = ` (${new Date(parseInt(eventDiv.dataset.timestamp)).toLocaleTimeString()})`;
    title.appendChild(timestamp);

    const pre = document.createElement('pre');
    pre.innerHTML = syntaxHighlight(eventData);

    eventDiv.appendChild(title);
    eventDiv.appendChild(pre);

    // Store in history (add to beginning for default chronological order within URL)
    if (!historyByUrl[currentInspectedUrl]) {
        historyByUrl[currentInspectedUrl] = [];
    }
    historyByUrl[currentInspectedUrl].unshift(eventDiv);

    // If the current URL's filter is checked, display it immediately
    const currentUrlCheckbox = document.getElementById(`filter-${currentInspectedUrl}`);
    if (currentUrlCheckbox && currentUrlCheckbox.checked) {
         console.log(`Current URL ${currentInspectedUrl} is checked, inserting event to view.`);
         contentDiv.insertBefore(eventDiv, contentDiv.firstChild);
         if (initialMessage) initialMessage.style.display = 'none';
         // Optional: If sorting is complex, might call renderFilteredHistory() instead.
         // But direct insertion is faster for new events.
    } else {
        console.log(`Current URL ${currentInspectedUrl} is NOT checked, event stored but not displayed.`);
         // Ensure initial message reflects reality if nothing is shown
         if (contentDiv.childElementCount === 0 && initialMessage) {
            initialMessage.textContent = 'No events match the selected URL filters (or history is empty).';
            initialMessage.style.display = 'block';
         }
    }
}

// --- Event Listeners --- //

// Clear button listener
clearButton.addEventListener('click', () => {
    console.log('Clearing ALL dataLayer history and filters...');
    historyByUrl = {}; // Clear stored data
    urlFiltersDiv.innerHTML = ''; // Clear filter UI
    contentDiv.innerHTML = ''; // Clear the displayed events
    currentInspectedUrl = null; // Reset current URL tracking
    updateInspectedUrl(); // Re-fetch current URL and add its filter
    if (initialMessage) {
        initialMessage.textContent = 'History cleared. Waiting for new dataLayer events...';
        initialMessage.style.display = 'block';
    }
});

// Initial setup
updateInspectedUrl();
connectToBackground();

// Reload data and URL when the inspected window navigates
chrome.devtools.network.onNavigated.addListener(() => {
    console.log('Inspected window navigated. Requesting new URL and data...');
    // Clear the display area, history is preserved in historyByUrl
    contentDiv.innerHTML = '';
    if (initialMessage) {
        initialMessage.textContent = 'Navigated. Waiting for dataLayer events...';
        initialMessage.style.display = 'block';
    }
    // Get new URL (will add filter if needed)
    setTimeout(updateInspectedUrl, 100);

    // Request new dataLayer state from background script
    if (port) {
        setTimeout(() => {
            if (port) { // Check port again, might disconnect during timeout
                 port.postMessage({
                    type: 'GET_DATALAYER',
                    tabId: chrome.devtools.inspectedWindow.tabId
                });
            }
        }, 150);
    } else {
        connectToBackground(); // Will request data upon connection
    }
    // No need to call renderFilteredHistory here, new events will be handled by processDataLayerEvent
}); 