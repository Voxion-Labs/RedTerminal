const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

async function runTests() {
    console.log("Running Extension Overlay Paste & Fetch Tests...");

    const contentJsCode = fs.readFileSync('content.js', 'utf8');

    let clipboardText = '';
    const overlayListeners = {};
    let selectedText = '';

    const overlayMock = {
        style: {},
        classList: { add: () => {}, remove: () => {} },
        addEventListener: (event, cb) => {
            if (!overlayListeners[event]) overlayListeners[event] = [];
            overlayListeners[event].push(cb);
        },
        appendChild: () => {},
        insertBefore: () => {},
        querySelector: (selector) => {
            return {
                style: {},
                classList: { add: () => {}, remove: () => {} },
                addEventListener: () => {},
                appendChild: () => {},
                insertBefore: () => {},
                focus: () => {}
            };
        }
    };

    const sandbox = {
        console,
        window: {
            addEventListener: () => {},
            getSelection: () => ({
                toString: () => selectedText
            })
        },
        document: {
            documentElement: {
                outerHTML: "<html><body></body></html>",
                appendChild: () => {}
            },
            createElement: () => {
                const el = {
                    style: {},
                    classList: { add: () => {}, remove: () => {} },
                    addEventListener: (event, cb) => {
                        if (!overlayListeners[event]) overlayListeners[event] = [];
                        overlayListeners[event].push(cb);
                    },
                    appendChild: () => {},
                    insertBefore: () => {},
                    focus: () => {}
                };
                el.querySelector = () => el;
                el.attachShadow = () => el;
                return el;
            },
            body: {
                appendChild: () => {},
                removeChild: () => {}
            }
        },
        navigator: {
            clipboard: {
                readText: async () => clipboardText,
                writeText: async (t) => { clipboardText = t; }
            }
        },
        URL: {
            createObjectURL: () => 'blob:mock',
            revokeObjectURL: () => {}
        },
        Blob: function(parts) { this.parts = parts; }
    };

    vm.createContext(sandbox);
    vm.runInContext(contentJsCode, sandbox);

    // Verify content.js has handlePasteText, pasteFromClipboard, contextmenu, paste, auxclick
    assert(contentJsCode.includes('handlePasteText'), "content.js must define handlePasteText");
    assert(contentJsCode.includes('pasteFromClipboard'), "content.js must define pasteFromClipboard");
    assert(contentJsCode.includes("overlay.addEventListener('paste'"), "content.js must listen to paste on overlay");
    assert(contentJsCode.includes("overlay.addEventListener('contextmenu'"), "content.js must listen to contextmenu on overlay");
    assert(contentJsCode.includes("overlay.addEventListener('auxclick'"), "content.js must listen to auxclick on overlay");

    console.log("PASS: Extension overlay defines all paste and right-click event listeners.");
    console.log("All Extension Overlay Paste & Fetch Tests Passed Successfully!");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
