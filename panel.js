const contentDiv = document.getElementById('data-layer-content');
const initialMessage = document.getElementById('initial-message');
const urlElement = document.getElementById('current-url').querySelector('span');
const clearButton = document.getElementById('clear-button');
const urlFiltersDiv = document.getElementById('url-filters'); // Container for checkboxes
const eventFilterInput = document.getElementById('event-filter-input'); // Get the event filter input
const blacklistFilterInput = document.getElementById('blacklist-filter-input'); // Get the blacklist filter input

let port;
let historyByUrl = {}; // Stores event elements keyed by URL
let currentInspectedUrl = null; // Track the current URL
let visitedUrlsOrder = []; // Track the order of URLs visited (chronological)

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
                    currentInspectedUrl = result;
                    
                    // Handle URL order tracking (for chronological display)
                    const existingIndex = visitedUrlsOrder.indexOf(result);
                    if (existingIndex !== -1) {
                        // URL already exists in our order list, move it to the end (most recent)
                        visitedUrlsOrder.splice(existingIndex, 1); // Remove from current position
                    }
                    visitedUrlsOrder.push(result); // Add/move to end (most recent visit)
                    
                    // Add or update URL filter
                    refreshUrlFilters(); // Rebuild all filters in the correct order
                }
            }
        }
    );
}

// Refresh all URL filters with current order
function refreshUrlFilters() {
    // Remember currently checked states
    const checkedUrls = new Set();
    const currentCheckboxes = new Set();
    
    // Track existing URLs and their checked state
    Array.from(urlFiltersDiv.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        currentCheckboxes.add(cb.value); // Track all URLs we currently have checkboxes for
        if (cb.checked) checkedUrls.add(cb.value);
    });
    
    // Clear all filters
    urlFiltersDiv.innerHTML = '';
    
    // Add Select All / Unselect All controls if we have URLs
    if (visitedUrlsOrder.length > 0) {
        const controlsRow = document.createElement('div');
        controlsRow.style.marginBottom = '10px';
        controlsRow.style.display = 'flex';
        controlsRow.style.gap = '5px';
        
        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.style.fontSize = '0.8em';
        selectAllBtn.style.padding = '2px 5px';
        selectAllBtn.addEventListener('click', () => {
            // Check all checkboxes
            Array.from(urlFiltersDiv.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
                cb.checked = true;
            });
            renderFilteredHistory();
        });
        
        const unselectAllBtn = document.createElement('button');
        unselectAllBtn.textContent = 'Unselect All';
        unselectAllBtn.style.fontSize = '0.8em';
        unselectAllBtn.style.padding = '2px 5px';
        unselectAllBtn.addEventListener('click', () => {
            // Uncheck all checkboxes
            Array.from(urlFiltersDiv.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
                cb.checked = false;
            });
            renderFilteredHistory();
        });
        
        controlsRow.appendChild(selectAllBtn);
        controlsRow.appendChild(unselectAllBtn);
        urlFiltersDiv.appendChild(controlsRow);
    }
    
    // Re-add in chronological order
    visitedUrlsOrder.forEach((url, index) => {
        // A URL should be checked if:
        // 1. It was previously checked, OR
        // 2. It's a new URL (not in currentCheckboxes)
        const isNewUrl = !currentCheckboxes.has(url);
        const shouldBeChecked = isNewUrl || checkedUrls.has(url);
        
        addUrlFilterCheckbox(url, index + 1, shouldBeChecked);
    });
    
    // If URL list changed, re-render displayed events
    renderFilteredHistory();
}

// Add a checkbox for a URL with visit order number
function addUrlFilterCheckbox(url, visitOrder, isChecked = true) {
    if (!url) return;

    const checkboxId = `filter-${url}`;
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '3px';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';
    wrapper.style.overflow = 'hidden'; // Prevent overflow outside container

    // Checkbox input
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkboxId;
    checkbox.value = url;
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', renderFilteredHistory);
    checkbox.style.flexShrink = '0'; // Don't shrink the checkbox

    // URL Label
    const label = document.createElement('label');
    label.htmlFor = checkboxId;
    label.style.marginLeft = '5px';
    label.style.wordBreak = 'break-all';
    label.style.flexGrow = '1'; // Take available space
    label.style.overflow = 'hidden'; // Hide overflow
    label.style.textOverflow = 'ellipsis'; // Add ellipsis for truncated text
    label.style.whiteSpace = 'nowrap'; // Keep on one line
    label.title = url; // Add tooltip with full URL on hover
    
    // Add visit order number to make the journey clearer
    const visitBadge = document.createElement('span');
    visitBadge.textContent = `${visitOrder}: `;
    visitBadge.style.fontWeight = 'bold';
    visitBadge.style.marginRight = '3px';
    visitBadge.style.flexShrink = '0'; // Don't shrink the number
    label.appendChild(visitBadge);
    
    // Add the actual URL
    const urlText = document.createTextNode(url);
    label.appendChild(urlText);

    // Add elements to wrapper
    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    urlFiltersDiv.appendChild(wrapper);
}

// Render the history based on checked URL filters AND event filter input
function renderFilteredHistory() {
    contentDiv.innerHTML = '';
    let displayedEvents = false;

    const checkedUrls = Array.from(urlFiltersDiv.querySelectorAll('input[type="checkbox"]:checked'))
                           .map(cb => cb.value);
    const eventFilterText = eventFilterInput.value.trim().toLowerCase(); // Get event filter text
    
    // Get blacklist terms (comma separated, trimmed, lowercase)
    const blacklistTerms = blacklistFilterInput.value
        .split(',')
        .map(term => term.trim().toLowerCase())
        .filter(term => term.length > 0);

    // 1. Collect elements from checked URLs
    let elementsToShow = [];
    checkedUrls.forEach(url => {
        if (historyByUrl[url]) {
            elementsToShow = elementsToShow.concat(historyByUrl[url]);
        }
    });

    // 2. Filter by event name (if filter is applied)
    if (eventFilterText) {
        elementsToShow = elementsToShow.filter(element => {
            const eventName = element.dataset.eventName || ''; // Get stored event name (lowercase)
            const match = eventName.includes(eventFilterText);
            return match;
        });
    }
    
    // 3. Apply blacklist filter (if any terms exist)
    if (blacklistTerms.length > 0) {
        elementsToShow = elementsToShow.filter(element => {
            const eventName = element.dataset.eventName || '';
            // Return true if NO blacklist terms are found in the event name
            return !blacklistTerms.some(term => eventName.includes(term));
        });
    }

    // 4. Sort elements by timestamp (newest first)
    elementsToShow.sort((a, b) => (b.dataset.timestamp || 0) - (a.dataset.timestamp || 0));

    // 5. Append sorted and filtered elements to the display
    elementsToShow.forEach(element => {
        contentDiv.appendChild(element);
        displayedEvents = true;
    });

     if (!displayedEvents && initialMessage) {
        initialMessage.textContent = 'No events match the selected filters (or history is empty).';
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

    // Send a message to the background script to get the initial dataLayer state
    port.postMessage({
        type: 'GET_DATALAYER',
        tabId: chrome.devtools.inspectedWindow.tabId
    });

    // Listen for messages from the background script
    port.onMessage.addListener((message) => {
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
    eventDiv.dataset.timestamp = Date.now();
    const eventUrl = currentInspectedUrl; // Capture URL at time of event creation
    eventDiv.dataset.url = eventUrl;
    if (eventData && eventData.event && typeof eventData.event === 'string') {
        eventDiv.dataset.eventName = eventData.event.toLowerCase();
    } else {
        eventDiv.dataset.eventName = '';
    }

    // --- Header Section (always visible) --- //
    const headerSection = document.createElement('div');
    
    // --- Toggle Row (Title + Toggle) --- //
    const toggleRow = document.createElement('div');
    toggleRow.style.display = 'flex';
    toggleRow.style.alignItems = 'center';
    toggleRow.style.cursor = 'pointer'; // Cursor changes to pointer on hover
    
    // Toggle button
    const toggleButton = document.createElement('span');
    toggleButton.textContent = '▼'; // Down arrow indicates expanded
    toggleButton.style.marginRight = '10px';
    toggleButton.style.fontSize = '0.9em';
    toggleButton.style.userSelect = 'none'; // Prevent text selection
    toggleButton.style.color = '#666';
    toggleRow.appendChild(toggleButton);

    // Title element
    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.flexGrow = '1'; // Takes up available space
    if (eventData && typeof eventData === 'object' && eventData.error) {
        title.textContent = `Error: ${eventData.error}`;
        title.style.color = 'red';
    } else {
        title.textContent = eventData.event ? `Event: ${eventData.event}` : 'DataLayer Push';
    }

    // Timestamp
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = ` (${new Date(parseInt(eventDiv.dataset.timestamp)).toLocaleTimeString()})`;
    timestamp.style.marginLeft = '8px';
    title.appendChild(timestamp);
    toggleRow.appendChild(title);
    
    // Add the toggle row to header section
    headerSection.appendChild(toggleRow);
    
    // --- URL Info (always visible) --- //
    const urlInfo = document.createElement('div');
    urlInfo.textContent = `URL: ${eventUrl}`;
    urlInfo.style.fontSize = '0.8em';
    urlInfo.style.color = '#666';
    urlInfo.style.marginTop = '2px';
    urlInfo.style.marginBottom = '5px';
    urlInfo.style.marginLeft = '24px'; // Align with title text (after toggle icon)
    urlInfo.style.wordBreak = 'break-all';
    headerSection.appendChild(urlInfo); // Add URL info to the header section
    
    // Add the complete header section to the event div
    eventDiv.appendChild(headerSection);

    // --- Content Container (for collapsing) --- //
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'block'; // Start expanded

    // --- JSON Content --- //
    const pre = document.createElement('pre');
    pre.innerHTML = syntaxHighlight(eventData);
    contentContainer.appendChild(pre);
    
    // Add the content container to the event div
    eventDiv.appendChild(contentContainer);

    // Toggle logic
    toggleRow.addEventListener('click', () => {
        const isCollapsed = contentContainer.style.display === 'none';
        contentContainer.style.display = isCollapsed ? 'block' : 'none';
        toggleButton.textContent = isCollapsed ? '▼' : '►'; // Down arrow for expanded, right arrow for collapsed
    });

    // Store in history
    if (!historyByUrl[eventUrl]) {
        historyByUrl[eventUrl] = [];
    }
    historyByUrl[eventUrl].unshift(eventDiv);

    // Check if event should be displayed based on current filters
    const currentUrlCheckbox = document.getElementById(`filter-${eventUrl}`);
    const eventFilterText = eventFilterInput.value.trim().toLowerCase();
    const eventName = eventDiv.dataset.eventName || '';

    const urlIsChecked = currentUrlCheckbox && currentUrlCheckbox.checked;
    const eventNameMatchesFilter = !eventFilterText || eventName.includes(eventFilterText);

    if (urlIsChecked && eventNameMatchesFilter) {
         contentDiv.insertBefore(eventDiv, contentDiv.firstChild);
         if (initialMessage) initialMessage.style.display = 'none';
    } else {
         if (contentDiv.childElementCount === 0 && initialMessage) {
            initialMessage.textContent = 'No events match the selected filters (or history is empty).';
            initialMessage.style.display = 'block';
         }
    }
}

// --- Event Listeners --- //

// Event filter input listener
eventFilterInput.addEventListener('input', renderFilteredHistory);

// Blacklist filter input listener
blacklistFilterInput.addEventListener('input', renderFilteredHistory);

// Clear button listener
clearButton.addEventListener('click', () => {
    historyByUrl = {};
    urlFiltersDiv.innerHTML = '';
    visitedUrlsOrder = []; // Reset URL order tracking
    eventFilterInput.value = '';
    blacklistFilterInput.value = ''; // Clear blacklist filter too
    contentDiv.innerHTML = '';
    currentInspectedUrl = null;
    updateInspectedUrl();
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