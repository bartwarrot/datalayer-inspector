// Flag to prevent adding listeners multiple times
if (!window.hasDataLayerInspectorListeners) {
    window.hasDataLayerInspectorListeners = true;
    console.log('Content Script: Adding event listeners for MAIN world communication.');

    // Function to send parsed dataLayer event to the background script
    function sendDataToBackground(type, data) {
        // Check if context is still valid before sending
        if (chrome.runtime.lastError) {
            console.log(`Content Script: Context invalidated before sending ${type}. Aborting send.`);
            return;
        }
        // console.log(`Content Script: Attempting to send ${type} to background:`, data); // Optional: verbose logging
        chrome.runtime.sendMessage({ type: type, payload: data }, (response) => {
            if (chrome.runtime.lastError) {
                // Ignore "Receiving end does not exist" errors if DevTools is not open or closing
                if (!chrome.runtime.lastError.message?.includes("Receiving end does not exist")) {
                    console.error(`Content Script: Error sending ${type}:`, chrome.runtime.lastError.message);
                }
            } else if (response && !response.success) {
                console.warn(`Content Script: Background script failed to process ${type}.`, response.error);
            } else {
                // Optional: console.log(`Content Script: Successfully sent ${type} to background.`);
            }
        });
    }

    // --- Event Listeners in CONTENT SCRIPT context --- //
    // Listen for events dispatched by the MAIN world script

    window.addEventListener('__dataLayerInspector_push', function (event) {
        // Check if context is still valid upon receiving event
        if (chrome.runtime.lastError) {
             console.log("Content Script: Context invalidated on receiving push event. Ignoring.");
             return;
        }
        console.log('Content Script: Received __dataLayerInspector_push event from page:', event.detail);
        if (typeof event.detail === 'string') {
            try {
                const parsedData = JSON.parse(event.detail);
                sendDataToBackground('DATALAYER_PUSH', parsedData);
            } catch (e) {
                 // Check context again before logging/sending error
                 // Make sure chrome and chrome.runtime exist before checking lastError
                 if (!chrome || !chrome.runtime || chrome.runtime.lastError) {
                      console.log("Content Script: Context invalidated during push event parsing. Ignoring parse error.");
                      return;
                 }
                console.error('Content Script: Error parsing pushed data string:', e, event.detail);
                sendDataToBackground('DATALAYER_PUSH', { error: 'Could not parse pushed data from page script', rawDetail: event.detail });
            }
        } else {
            // Check context again before logging/sending
             if (chrome.runtime.lastError) {
                  console.log("Content Script: Context invalidated on receiving non-string push event. Ignoring.");
                  return;
             }
            console.warn('Content Script: Received non-string detail in __dataLayerInspector_push event:', event.detail);
             sendDataToBackground('DATALAYER_PUSH', event.detail || { error: 'Received non-string, non-null detail in push event' });
        }
    });

    window.addEventListener('__dataLayerInspector_initialState', function (event) {
        // Check if context is still valid upon receiving event
        if (chrome.runtime.lastError) {
             console.log("Content Script: Context invalidated on receiving initial state event. Ignoring.");
             return;
        }
        console.log('Content Script: Received __dataLayerInspector_initialState event from page:', event.detail);
         if (typeof event.detail === 'string') {
            try {
                const parsedInitialState = JSON.parse(event.detail);
                 sendDataToBackground('INITIAL_DATALAYER', parsedInitialState);
            } catch (e) {
                 // Check context again before logging/sending error
                 // Make sure chrome and chrome.runtime exist before checking lastError
                 if (!chrome || !chrome.runtime || chrome.runtime.lastError) {
                      console.log("Content Script: Context invalidated during initial state parsing. Ignoring parse error.");
                      return;
                 }
                console.error('Content Script: Error parsing initial state string:', e, event.detail);
                sendDataToBackground('INITIAL_DATALAYER', { error: 'Could not parse initial state from page script', rawDetail: event.detail });
            }
        } else {
             // Check context again before logging/sending
             if (chrome.runtime.lastError) {
                  console.log("Content Script: Context invalidated on receiving non-string initial state event. Ignoring.");
                  return;
             }
            console.warn('Content Script: Received non-string detail in __dataLayerInspector_initialState event:', event.detail);
            sendDataToBackground('INITIAL_DATALAYER', event.detail || { error: 'Received non-string, non-null detail in initial state event' });
        }
    });

} else {
    console.log('Content Script: Event listeners already added.');
} 