const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

async function runTests() {
    console.log("Running Web URL Paste & Fetch Integration Tests...");

    const appJsCode = fs.readFileSync('public/app.js', 'utf8');

    // Create an emulation environment for app.js
    let clipboardText = '';
    const listeners = {};
    const elements = {};

    function createElement(id, tagName = 'div') {
        const el = {
            id,
            tagName: tagName.toUpperCase(),
            value: '',
            textContent: '',
            innerHTML: '',
            style: {},
            children: [],
            scrollTop: 0,
            scrollHeight: 100,
            focus: function() { this._focused = true; },
            appendChild: function(child) { this.children.push(child); return child; },
            insertBefore: function(newNode, refNode) {
                const idx = this.children.indexOf(refNode);
                if (idx !== -1) {
                    this.children.splice(idx, 0, newNode);
                } else {
                    this.children.push(newNode);
                }
                return newNode;
            },
            addEventListener: function(event, cb) {
                if (!listeners[id + ':' + event]) listeners[id + ':' + event] = [];
                listeners[id + ':' + event].push(cb);
            }
        };
        elements[id] = el;
        return el;
    }

    const termBody = createElement('terminal-body');
    const activeInput = createElement('active-input', 'span');
    const activeCursor = createElement('active-cursor', 'span');
    const activeLine = createElement('active-line');
    activeLine.children.push(activeInput);
    activeLine.children.push(activeCursor);
    termBody.children.push(activeLine);

    const termWindow = createElement('terminal-window');
    const termContainer = createElement('terminal-container');
    const hiddenInput = createElement('hidden-input', 'input');

    const documentListeners = {};
    let selectedText = '';

    const sandbox = {
        console,
        window: {
            addEventListener: () => {},
            getSelection: () => ({
                toString: () => selectedText
            })
        },
        document: {
            getElementById: (id) => elements[id] || null,
            createElement: (tag) => createElement('dynamic-' + Math.random(), tag),
            addEventListener: (event, cb) => {
                if (!documentListeners[event]) documentListeners[event] = [];
                documentListeners[event].push(cb);
            }
        },
        navigator: {
            clipboard: {
                readText: async () => clipboardText,
                writeText: async (t) => { clipboardText = t; }
            }
        },
        performance: { now: () => Date.now() },
        setTimeout: (fn) => setTimeout(fn, 0)
    };

    vm.createContext(sandbox);
    vm.runInContext(appJsCode, sandbox);

    // Helpers to dispatch events
    function triggerDocKeydown(keyObj) {
        const ev = {
            key: keyObj.key || '',
            code: keyObj.code || '',
            ctrlKey: !!keyObj.ctrlKey,
            metaKey: !!keyObj.metaKey,
            shiftKey: !!keyObj.shiftKey,
            altKey: !!keyObj.altKey,
            preventDefault: () => { ev._prevented = true; }
        };
        if (documentListeners['keydown']) {
            for (const cb of documentListeners['keydown']) cb(ev);
        }
        return ev;
    }

    function triggerDocPaste(text) {
        const ev = {
            clipboardData: {
                getData: () => text
            },
            preventDefault: () => { ev._prevented = true; }
        };
        if (documentListeners['paste']) {
            for (const cb of documentListeners['paste']) cb(ev);
        }
        return ev;
    }

    async function triggerContainerContextMenu() {
        const ev = {
            button: 2,
            preventDefault: () => { ev._prevented = true; }
        };
        const cbs = listeners['terminal-container:contextmenu'] || [];
        for (const cb of cbs) await cb(ev);
        return ev;
    }

    async function triggerContainerAuxClick(button) {
        const ev = {
            button,
            preventDefault: () => { ev._prevented = true; }
        };
        const cbs = listeners['terminal-container:auxclick'] || [];
        for (const cb of cbs) await cb(ev);
        return ev;
    }

    const getCurrentBuffer = () => vm.runInContext('currentBuffer', sandbox);
    const setCurrentBuffer = (val) => vm.runInContext(`currentBuffer = ${JSON.stringify(val)}; updateInputDisplay();`, sandbox);

    // Test 1: Native paste event with Web URL when buffer is empty -> auto-prefixes 'fetch '
    setCurrentBuffer('');
    triggerDocPaste('https://example.com/api/data');
    assert.strictEqual(getCurrentBuffer(), 'fetch https://example.com/api/data', "Empty buffer should auto-prefix 'fetch ' for URL paste");
    console.log("PASS: Native paste event automatically prefixes 'fetch ' for web URLs on empty prompt.");

    // Test 2: Native paste event when user already typed 'fetch ' -> should NOT duplicate 'fetch'
    setCurrentBuffer('fetch ');
    triggerDocPaste('https://example.com/docs');
    assert.strictEqual(getCurrentBuffer(), 'fetch https://example.com/docs', "Buffer with 'fetch ' should append URL cleanly");
    console.log("PASS: Native paste appends URL to existing 'fetch ' without duplication.");

    // Test 3: Native paste event when user typed 'scan ' -> should append URL cleanly
    setCurrentBuffer('scan ');
    triggerDocPaste('https://example.com/config');
    assert.strictEqual(getCurrentBuffer(), 'scan https://example.com/config', "Buffer with 'scan ' should append URL");
    console.log("PASS: Native paste appends URL to other commands (like 'scan') without interference.");

    // Test 4: Ctrl+V (Windows/Linux) triggers pasteFromClipboard
    clipboardText = 'https://news.ycombinator.com';
    setCurrentBuffer('');
    triggerDocKeydown({ key: 'v', ctrlKey: true });
    // Allow async pasteFromClipboard promise to settle
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(getCurrentBuffer(), 'fetch https://news.ycombinator.com', "Ctrl+V should paste URL from clipboard with 'fetch ' prefix");
    console.log("PASS: Ctrl+V (Windows/Linux) triggers clipboard read and pastes URL cleanly.");

    // Test 5: Cmd+V (macOS) triggers pasteFromClipboard
    clipboardText = 'https://github.com/torvalds/linux';
    setCurrentBuffer('');
    triggerDocKeydown({ key: 'v', metaKey: true });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(getCurrentBuffer(), 'fetch https://github.com/torvalds/linux', "Cmd+V should paste URL from clipboard with 'fetch ' prefix");
    console.log("PASS: Cmd+V (macOS) triggers clipboard read and pastes URL cleanly.");

    // Test 6: Shift+Insert (Standard Linux/Windows terminal shortcut) triggers paste
    clipboardText = 'https://kernel.org';
    setCurrentBuffer('');
    triggerDocKeydown({ key: 'Insert', shiftKey: true });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(getCurrentBuffer(), 'fetch https://kernel.org', "Shift+Insert should paste URL from clipboard");
    console.log("PASS: Shift+Insert triggers clipboard read and pastes URL cleanly.");

    // Test 7: Mouse right-click / Touchpad 2-finger click (contextmenu)
    clipboardText = 'https://api.github.com/repos';
    setCurrentBuffer('');
    selectedText = '';
    const ctxEv = await triggerContainerContextMenu();
    assert.strictEqual(ctxEv._prevented, true, "contextmenu default should be prevented");
    assert.strictEqual(getCurrentBuffer(), 'fetch https://api.github.com/repos', "Right-click / 2-finger tap should paste clipboard content");
    console.log("PASS: Mouse right-click and Touchpad 2-finger click paste clipboard content directly.");

    // Test 8: Contextmenu when text IS selected -> copies selection and does NOT overwrite prompt
    selectedText = 'Error 404 Not Found';
    clipboardText = 'previous clipboard';
    setCurrentBuffer('fetch https://example.com');
    await triggerContainerContextMenu();
    assert.strictEqual(clipboardText, 'Error 404 Not Found', "Should copy selected text to clipboard");
    assert.strictEqual(getCurrentBuffer(), 'fetch https://example.com', "Buffer should not be modified when copying selection");
    console.log("PASS: Right-click when text is selected copies text to clipboard without overwriting buffer.");

    // Test 9: Mouse middle click (auxclick button === 1)
    selectedText = '';
    clipboardText = 'https://example.com/middle-click';
    setCurrentBuffer('');
    await triggerContainerAuxClick(1);
    assert.strictEqual(getCurrentBuffer(), 'fetch https://example.com/middle-click', "Middle-click should paste clipboard content");
    console.log("PASS: Mouse middle-click pastes clipboard content.");

    // Test 10: Standard terminal typing, backspace, enter, Ctrl+L, Ctrl+C remain unaffected
    setCurrentBuffer('help');
    // Backspace
    triggerDocKeydown({ key: 'Backspace' });
    assert.strictEqual(getCurrentBuffer(), 'hel', "Backspace must still work");
    // Typing single char
    triggerDocKeydown({ key: 'p' });
    assert.strictEqual(getCurrentBuffer(), 'help', "Typing must still work");
    // Ctrl+C
    triggerDocKeydown({ key: 'c', ctrlKey: true });
    assert.strictEqual(getCurrentBuffer(), '', "Ctrl+C must clear buffer and interrupt");
    // Ctrl+L
    setCurrentBuffer('echo 123');
    triggerDocKeydown({ key: 'l', ctrlKey: true });
    assert.strictEqual(getCurrentBuffer(), '', "Ctrl+L must clear terminal");
    console.log("PASS: Core terminal interactions (typing, Backspace, Ctrl+C, Ctrl+L) remain unaffected.");

    // Test 11: Direct URL execution recognition
    const executeCommandStr = sandbox.executeCommand.toString();
    assert(executeCommandStr.includes('https?://') || executeCommandStr.includes('handleFetchFilterCommand'),
        "executeCommand must recognize direct URLs");
    console.log("PASS: Direct URL execution recognized by command dispatcher.");

    console.log("All Web URL Paste & Fetch Integration Tests Passed Successfully!");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
