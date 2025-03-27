// Store connections from DevTools panels
const connections = {};

// Function to safely serialize data, handling potential circular references
// Defined here to be passed to mainWorldScript
function safeJsonStringify(obj) {
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (cache.has(value)) {
                return '[Circular Reference]';
            }
            cache.add(value);
        }
        if (typeof value === 'bigint') {
            return value.toString() + 'n';
        }
        return value;
    });
}

// This function will be executed in the MAIN world (page context)
function mainWorldScript(stringifyFnSource) {
    // Re-create the stringify function in this scope
    const pageSafeJsonStringify = new Function(`return ${stringifyFnSource}`)();

    console.log('DataLayer Inspector (MAIN World): Running injected script.');
    window.dataLayer = window.dataLayer || [];

    // --- Send Initial State --- //
    try {
        const initialState = window.dataLayer.slice(); // Get a copy
        const initialStateString = pageSafeJsonStringify(initialState);
        console.log('DataLayer Inspector (MAIN World): Dispatching initial state.', initialStateString);
        window.dispatchEvent(new CustomEvent('__dataLayerInspector_initialState', { detail: initialStateString }));
    } catch (e) {
        console.error('DataLayer Inspector (MAIN World): Error preparing or dispatching initial state', e);
        const errorDetail = JSON.stringify({ error: 'Could not serialize initial dataLayer', details: e.message });
        window.dispatchEvent(new CustomEvent('__dataLayerInspector_initialState', { detail: errorDetail }));
    }

    // --- Override dataLayer.push --- //
    if (!window.dataLayer.push.toString().includes('__dataLayerInspector_push')) {
        const originalPush = window.dataLayer.push;
        window.dataLayer.push = function (...args) {
            console.log('DataLayer Inspector (MAIN World): dataLayer.push called with:', args);
            let result;
            try {
                result = originalPush.apply(window.dataLayer, args);
            } catch (e) {
                 console.error('DataLayer Inspector (MAIN World): Error calling original dataLayer.push', e);
                 const errorDetail = JSON.stringify({ error: 'Original dataLayer.push failed', details: e.message });
                 window.dispatchEvent(new CustomEvent('__dataLayerInspector_push', { detail: errorDetail }));
                 return;
            }

            args.forEach((arg, index) => {
                try {
                    const argString = pageSafeJsonStringify(arg);
                    console.log(`DataLayer Inspector (MAIN World): Dispatching push event (arg ${index + 1}/${args.length}).`, argString);
                    window.dispatchEvent(new CustomEvent('__dataLayerInspector_push', { detail: argString }));
                } catch (e) {
                    console.error(`DataLayer Inspector (MAIN World): Error preparing or dispatching push event (arg ${index + 1})`, e, arg);
                    const errorDetail = JSON.stringify({ error: 'Could not serialize pushed data', details: e.message, originalArgIndex: index });
                    window.dispatchEvent(new CustomEvent('__dataLayerInspector_push', { detail: errorDetail }));
                }
            });

            return result;
        };
         console.log('DataLayer Inspector (MAIN World): dataLayer.push overridden.');
    } else {
         console.log('DataLayer Inspector (MAIN World): dataLayer.push already overridden. Skipping.');
    }
    console.log('DataLayer Inspector (MAIN World): Listener setup complete.');
}

// Handle connection from DevTools panel
chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'devtools-panel') {
        console.log("Background: Ignoring connection from unknown source.");
        return;
    }

    // Function to handle messages from the DevTools panel
    const devToolsListener = (message, senderPort) => {
        console.log("Background received message from DevTools:", message.type);
        const tabId = message.tabId; // Needed for script injection

        if (message.type === 'GET_DATALAYER' && tabId) {
            // Register the connection for this tabId
            connections[tabId] = senderPort;
            console.log(`Background: Registered DevTools connection for tab ${tabId}`);

            // --- Inject Content Script (Isolated World) --- //
            console.log(`Background: Injecting content script into tab ${tabId}...`);
            chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true }, // Inject into all frames
                files: ['content.js']
            })
            .then(() => {
                console.log(`Background: Content script injected successfully into tab ${tabId}.`);

                // --- Inject Main World Script --- //
                console.log(`Background: Injecting main world script into tab ${tabId}...`);
                return chrome.scripting.executeScript({
                    target: { tabId: tabId, allFrames: true },
                    world: 'MAIN',
                    func: mainWorldScript,
                    args: [safeJsonStringify.toString()] // Pass stringify function source
                });
            })
            .then(() => {
                console.log(`Background: Main world script injected successfully into tab ${tabId}.`);
                // Now both scripts are injected, the main world script will dispatch events,
                // and the content script will catch them and send them here.
            })
            .catch(error => {
                console.error(`Background: Error injecting scripts into tab ${tabId}:`, error);
                senderPort.postMessage({ type: 'ERROR', payload: `Failed to inject scripts: ${error.message}` });
            });
        }
    };

    // Listen for messages from the connecting DevTools panel
    port.onMessage.addListener(devToolsListener);

    // Handle disconnection
    port.onDisconnect.addListener(() => {
        console.log("Background: DevTools panel disconnected.");
        port.onMessage.removeListener(devToolsListener);
        for (const tabId in connections) {
            if (connections[tabId] === port) {
                delete connections[tabId];
                console.log(`Background: Removed DevTools connection for tab ${tabId}`);
                break;
            }
        }
    });
});

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message from content script:", message);
    if (sender.tab && sender.tab.id) {
        const tabId = sender.tab.id;
        const port = connections[tabId];

        if (port && (message.type === 'DATALAYER_PUSH' || message.type === 'INITIAL_DATALAYER')) {
            const targetType = message.type === 'INITIAL_DATALAYER' ? 'INITIAL_DATALAYER' : 'DATALAYER_UPDATE';
            console.log(`Background: Forwarding ${message.type} as ${targetType} to DevTools for tab ${tabId}`);

            if (message.type === 'INITIAL_DATALAYER' && Array.isArray(message.payload)) {
                // Send initial array elements individually to panel
                 message.payload.forEach(eventData => {
                    port.postMessage({ type: 'DATALAYER_UPDATE', payload: eventData });
                 });
            } else {
                 // Send single push event or error object
                 port.postMessage({ type: 'DATALAYER_UPDATE', payload: message.payload });
            }
            sendResponse({ success: true });
        } else if (!port) {
            console.warn(`Background: Received message from content script for tab ${tabId}, but no DevTools connection found.`);
            sendResponse({ success: false, error: 'No DevTools connection' });
        } else {
             console.warn(`Background: Received unhandled message type ${message.type} from content script for tab ${tabId}.`);
             sendResponse({ success: false, error: 'Unhandled message type' });
        }
    } else {
        console.warn("Background: Received message without sender tab ID.");
        sendResponse({ success: false, error: 'Missing sender tab ID' });
    }
    return true; // Keep channel open for async response
});

console.log("Background service worker started."); 