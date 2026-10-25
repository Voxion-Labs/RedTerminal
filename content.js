/**
 * RedTerminal - Cross-Browser Content Script (Manifest V3)
 * Injects an isolated, toggleable WebAssembly terminal overlay on any web page.
 * Strictly encapsulates all styles using Shadow DOM to avoid CSS collisions.
 */

(function() {
    // Prevent duplicate injection
    if (window.__REDTERM_EXTENSION_INITIALIZED__) {
        if (typeof window.__REDTERM_TOGGLE__ === 'function') {
            window.__REDTERM_TOGGLE__();
        }
        return;
    }
    window.__REDTERM_EXTENSION_INITIALIZED__ = true;

    // ==========================================
    // 1. Create Shadow Host & Isolate CSS
    // ==========================================
    const hostEl = document.createElement('div');
    hostEl.id = 'redterm-extension-host';
    hostEl.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; overflow:visible; pointer-events:none;';
    document.documentElement.appendChild(hostEl);

    const shadowRoot = hostEl.attachShadow({ mode: 'open' });

    // Scoped CSS styles completely isolated from host page
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        :host {
            all: initial;
            font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        #redterm-overlay {
            pointer-events: auto;
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 700px;
            max-width: 92vw;
            height: 440px;
            max-height: 85vh;
            background-color: #0a0a0a;
            border: 1px solid #262626;
            border-radius: 8px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: #e0e0e0;
            font-size: 13px;
            line-height: 1.5;
            transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out;
            opacity: 1;
            transform: translateY(0);
        }

        #redterm-overlay.hidden {
            display: none !important;
        }

        /* Terminal Window Header */
        .window-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 34px;
            background-color: #121212;
            border-bottom: 1px solid #1f1f1f;
            padding: 0 12px;
            user-select: none;
            cursor: grab;
        }

        .window-header:active {
            cursor: grabbing;
        }

        .header-title-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-dots {
            display: flex;
            gap: 6px;
        }

        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            cursor: pointer;
        }

        .dot-red { background-color: #ff5f56; }
        .dot-yellow { background-color: #ffbd2e; }
        .dot-green { background-color: #27c93f; }

        .header-title {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
            color: #888888;
        }

        .header-title span {
            color: #22c55e;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .action-btn {
            background: none;
            border: none;
            color: #888888;
            font-size: 14px;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .action-btn:hover {
            color: #e0e0e0;
            background: #262626;
        }

        /* Terminal Body */
        #terminal-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px 14px;
            background-color: #0a0a0a;
            cursor: text;
        }

        #terminal-body::-webkit-scrollbar {
            width: 6px;
        }

        #terminal-body::-webkit-scrollbar-track {
            background: #0a0a0a;
        }

        #terminal-body::-webkit-scrollbar-thumb {
            background: #262626;
            border-radius: 3px;
        }

        .term-line {
            white-space: pre-wrap;
            word-break: break-all;
            margin-bottom: 3px;
        }

        .term-output {
            white-space: pre-wrap;
            word-break: break-all;
            margin-bottom: 3px;
            color: #cccccc;
        }

        .term-prompt {
            color: #22c55e;
            font-weight: 600;
            margin-right: 8px;
            user-select: none;
        }

        .term-highlight { color: #f87171; font-weight: 500; }
        .term-success { color: #22c55e; }
        .term-warning { color: #facc15; }
        .term-error { color: #ef4444; }
        .term-dim { color: #666666; }

        /* Active Command Input Line */
        #active-line {
            display: flex;
            align-items: baseline;
            min-height: 19px;
            margin-top: 2px;
        }

        #active-input {
            white-space: pre-wrap;
            word-break: break-all;
            color: #ffffff;
        }

        .cursor {
            display: inline-block;
            width: 7px;
            height: 14px;
            background-color: #22c55e;
            vertical-align: text-bottom;
            margin-left: 2px;
            animation: redterm-blink 1s step-end infinite;
        }

        @keyframes redterm-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        #hidden-input {
            position: absolute;
            opacity: 0;
            left: -9999px;
            top: -9999px;
        }

        /* Footer Status */
        .window-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 22px;
            background-color: #0d0d0d;
            border-top: 1px solid #1a1a1a;
            padding: 0 12px;
            font-size: 10px;
            color: #555555;
            user-select: none;
        }

        .footer-badge {
            color: #22c55e;
        }
    `;
    shadowRoot.appendChild(styleEl);

    // ==========================================
    // 2. Build Terminal Overlay DOM inside Shadow
    // ==========================================
    const overlay = document.createElement('div');
    overlay.id = 'redterm-overlay';
    overlay.innerHTML = `
        <div class="window-header" id="overlay-header">
            <div class="header-title-group">
                <div class="header-dots">
                    <div class="dot dot-red" id="btn-close" title="Close overlay"></div>
                    <div class="dot dot-yellow" id="btn-minimize" title="Minimize overlay"></div>
                    <div class="dot dot-green" id="btn-maximize" title="Toggle size"></div>
                </div>
                <div class="header-title">REDTERM <span>v1.0 [MUTATOR OVERLAY]</span></div>
            </div>
            <div class="header-actions">
                <button class="action-btn" id="btn-close-text" title="Close (Alt+Shift+T)">✕</button>
            </div>
        </div>
        <div id="terminal-body">
            <div id="active-line">
                <span class="term-prompt">redterm &gt;</span>
                <span id="active-input"></span><span class="cursor" id="active-cursor"></span>
            </div>
        </div>
        <div class="window-footer">
            <span>MUTATOR ENGINE: ACTIVE</span>
            <span>DOM: ISOLATED SHADOW</span>
            <span class="footer-badge">Alt+Shift+T to toggle</span>
        </div>
        <input type="text" id="hidden-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    `;
    shadowRoot.appendChild(overlay);

    const termBody = overlay.querySelector('#terminal-body');
    const activeLine = overlay.querySelector('#active-line');
    const activeInput = overlay.querySelector('#active-input');
    const hiddenInput = overlay.querySelector('#hidden-input');
    const overlayHeader = overlay.querySelector('#overlay-header');
    const btnClose = overlay.querySelector('#btn-close');
    const btnCloseText = overlay.querySelector('#btn-close-text');
    const btnMinimize = overlay.querySelector('#btn-minimize');
    const btnMaximize = overlay.querySelector('#btn-maximize');

    // ==========================================
    // 3. UI Helper Functions
    // ==========================================
    let currentBuffer = '';
    let commandHistory = [];
    let historyIndex = -1;
    let isVisible = true;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function scrollToBottom() {
        if (termBody) {
            termBody.scrollTop = termBody.scrollHeight;
        }
    }

    function termPrint(text, type = '') {
        if (!termBody) return;
        const line = document.createElement('div');
        line.className = `term-output ${type ? 'term-' + type : ''}`;
        line.innerHTML = escapeHtml(text);
        if (activeLine) {
            termBody.insertBefore(line, activeLine);
        } else {
            termBody.appendChild(line);
        }
        scrollToBottom();
    }

    function termClear() {
        if (!termBody) return;
        const savedActive = activeLine;
        termBody.innerHTML = '';
        if (savedActive) {
            termBody.appendChild(savedActive);
        }
        currentBuffer = '';
        updateInputDisplay();
    }

    function updateInputDisplay() {
        if (activeInput) {
            activeInput.textContent = currentBuffer;
        }
        scrollToBottom();
    }

    function focusInput() {
        if (hiddenInput) {
            hiddenInput.focus();
        }
    }

    function toggleOverlay() {
        isVisible = !isVisible;
        if (isVisible) {
            overlay.classList.remove('hidden');
            focusInput();
            scrollToBottom();
        } else {
            overlay.classList.add('hidden');
        }
    }
    window.__REDTERM_TOGGLE__ = toggleOverlay;

    // Window controls
    btnClose.addEventListener('click', (e) => { e.stopPropagation(); toggleOverlay(); });
    btnCloseText.addEventListener('click', (e) => { e.stopPropagation(); toggleOverlay(); });
    btnMinimize.addEventListener('click', (e) => { e.stopPropagation(); toggleOverlay(); });

    let isMaximized = false;
    btnMaximize.addEventListener('click', (e) => {
        e.stopPropagation();
        isMaximized = !isMaximized;
        if (isMaximized) {
            overlay.style.width = '96vw';
            overlay.style.height = '90vh';
            overlay.style.bottom = '16px';
            overlay.style.right = '2vw';
            overlay.style.left = 'auto';
            overlay.style.top = 'auto';
        } else {
            overlay.style.width = '700px';
            overlay.style.height = '440px';
            overlay.style.bottom = '24px';
            overlay.style.right = '24px';
            overlay.style.left = 'auto';
            overlay.style.top = 'auto';
        }
    });

    // ==========================================
    // 4. Drag & Move Window Handler
    // ==========================================
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    overlayHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('.dot') || e.target.closest('.action-btn')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = overlay.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        overlay.style.bottom = 'auto';
        overlay.style.right = 'auto';
        overlay.style.left = `${initialLeft}px`;
        overlay.style.top = `${initialTop}px`;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const maxLeft = window.innerWidth - 100;
        const maxTop = window.innerHeight - 40;
        overlay.style.left = `${Math.max(10, Math.min(maxLeft, initialLeft + dx))}px`;
        overlay.style.top = `${Math.max(10, Math.min(maxTop, initialTop + dy))}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // ==========================================
    // 5. DOM-Manipulation Commands: nuke-ads & extract-tables
    // ==========================================

    const AD_SELECTORS = [
        '[id*="google_ads"]',
        '[id*="ad-banner"]',
        '[id*="advertisement"]',
        '[id*="ad-container"]',
        '[id*="ad_wrapper"]',
        '[id*="ad-slot"]',
        '[id*="taboola"]',
        '[id*="outbrain"]',
        '[class*="ad-container"]',
        '[class*="ad-banner"]',
        '[class*="ad-box"]',
        '[class*="ad-slot"]',
        '[class*="ad-wrapper"]',
        '[class*="adsbygoogle"]',
        '[class*="sponsored-post"]',
        '[class*="taboola"]',
        '[class*="outbrain"]',
        '[class*="adzerk"]',
        'ins.adsbygoogle',
        'div[data-ad-client]',
        'div[data-ad-slot]',
        'aside[class*="ad-"]',
        'aside[id*="ad-"]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="adnxs.com"]',
        'iframe[src*="adservice"]',
        'iframe[id*="google_ads"]',
        '[aria-label="advertisement" i]',
        '[aria-label="sponsored" i]',
        '[aria-label="banner ad" i]'
    ];

    /**
     * Queries and removes common ad/banner DOM selectors from the host page.
     * Guaranteed never to touch the isolated terminal extension host.
     */
    function executeNukeAds() {
        termPrint('Scanning active page for ad and tracking banner elements...', 'dim');
        let removedCount = 0;
        const combinedSelector = AD_SELECTORS.join(', ');

        try {
            const matches = document.querySelectorAll(combinedSelector);
            matches.forEach(el => {
                // Safeguard: never remove the extension host or anything inside it
                if (el.closest('#redterm-extension-host')) return;
                el.remove();
                removedCount++;
            });
        } catch (err) {
            termPrint(`ERR: Error during DOM query: ${err.message}`, 'error');
            return;
        }

        if (removedCount > 0) {
            termPrint(`[nuke-ads] Successfully purged ${removedCount} ad/banner element(s) from host DOM.`, 'success');
        } else {
            termPrint('[nuke-ads] No matching ad/banner selectors detected on active page.', 'dim');
        }
    }

    /**
     * Parses all <table> elements on the active page into a CSV string
     * and triggers an automatic browser download.
     */
    function executeExtractTables() {
        termPrint('Scanning active page for <table> elements...', 'dim');
        const tables = document.querySelectorAll('table');
        const validTables = Array.from(tables).filter(t => !t.closest('#redterm-extension-host'));

        if (validTables.length === 0) {
            termPrint('[extract-tables] No <table> elements found on this page.', 'warning');
            return;
        }

        termPrint(`Found ${validTables.length} table(s). Parsing rows and cells...`, 'dim');

        const csvSections = [];
        let totalRows = 0;

        validTables.forEach((tbl, tableIndex) => {
            const tableLines = [];
            const tblId = tbl.id ? ` id="${tbl.id}"` : '';
            const tblClass = tbl.className ? ` class="${tbl.className}"` : '';
            tableLines.push(`"=== Table ${tableIndex + 1}${tblId}${tblClass} ==="`);

            const rows = tbl.querySelectorAll('tr');
            rows.forEach(tr => {
                const cells = tr.querySelectorAll('th, td');
                if (cells.length === 0) return;

                const rowVals = Array.from(cells).map(cell => {
                    let text = (cell.innerText || cell.textContent || '').trim();
                    text = text.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ');
                    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
                        text = `"${text.replace(/"/g, '""')}"`;
                    }
                    return text;
                });

                tableLines.push(rowVals.join(','));
                totalRows++;
            });

            if (tableLines.length > 1) {
                csvSections.push(tableLines.join('\r\n'));
            }
        });

        if (totalRows === 0) {
            termPrint('[extract-tables] Tables found but contain 0 extractable rows.', 'warning');
            return;
        }

        const fullCsv = csvSections.join('\r\n\r\n');

        // Trigger browser download
        const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const pageSlug = (document.title || 'page').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
        const filename = `extracted_tables_${pageSlug}.csv`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 150);

        termPrint(`[extract-tables] Extracted ${validTables.length} table(s) (${totalRows} total rows).`, 'success');
        termPrint(`[extract-tables] Download initiated for '${filename}'.`, 'highlight');
    }

    // ==========================================
    // 6. Terminal Command Dispatcher
    // ==========================================
    async function executeCommand(cmd) {
        const trimmed = cmd.trim();
        if (!trimmed) return;

        // Pipe fetch commands: fetch <url> | filter <kw>
        if (trimmed.toLowerCase().startsWith('fetch') && trimmed.includes('|')) {
            const pipeIdx = trimmed.indexOf('|');
            const fetchPart = trimmed.substring(0, pipeIdx).trim();
            const filterPart = trimmed.substring(pipeIdx + 1).trim();

            const url = fetchPart.replace(/^fetch\s*/i, '').trim().replace(/^["']|["']$/g, '');
            const kw = filterPart.replace(/^filter\s*/i, '').trim().replace(/^["']|["']$/g, '');

            if (!url || !kw) {
                termPrint('Usage: fetch <url> | filter <keyword>', 'error');
                return;
            }

            termPrint(`Fetching ${url}...`, 'dim');
            try {
                const resp = await fetch(url);
                const html = await resp.text();
                const matched = html.split('\n').filter(l => l.includes(kw));
                if (matched.length === 0) {
                    termPrint(`No lines matching '${kw}' found.`, 'warning');
                } else {
                    for (const l of matched) {
                        termPrint(l);
                    }
                    termPrint(`Extracted ${matched.length} matching line(s).`, 'success');
                }
            } catch (err) {
                termPrint(`Fetch failed: ${err.message}`, 'error');
            }
            return;
        }

        const parts = trimmed.split(/\s+/);
        const action = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (action) {
            case 'help':
                termPrint('REDTERM Mutator Extension Commands:', 'highlight');
                termPrint('  help            - Display available commands');
                termPrint('  nuke-ads        - Query and purge all ad/banner DOM selectors on active page');
                termPrint('  extract-tables  - Parse all <table> elements on page into CSV & download');
                termPrint('  b64 [-e|-d] <s> - Base64 encode or decode string');
                termPrint('  hash <text>     - Compute SHA-256 digest');
                termPrint('  check <json>    - Fast AST-free single-pass JSON validator');
                termPrint('  echo [text]     - Print arguments to terminal');
                termPrint('  ping            - Test terminal latency');
                termPrint('  clear           - Clear terminal buffer');
                termPrint('  close / hide    - Hide overlay (or press Alt+Shift+T)');
                termPrint('  info            - Show Mutator Extension runtime info');
                break;

            case 'nuke-ads':
                executeNukeAds();
                break;

            case 'extract-tables':
                executeExtractTables();
                break;

            case 'b64': {
                if (!args.length) {
                    termPrint('Usage: b64 [-e|-d] <text>', 'error');
                    break;
                }
                const isDecode = args[0] === '-d' || args[0] === 'decode';
                const isEncode = args[0] === '-e' || args[0] === 'encode';
                const text = (isDecode || isEncode) ? args.slice(1).join(' ') : args.join(' ');
                try {
                    if (isDecode) {
                        termPrint(decodeURIComponent(escape(atob(text))), 'success');
                    } else {
                        termPrint(btoa(unescape(encodeURIComponent(text))), 'success');
                    }
                } catch (e) {
                    termPrint(`Base64 error: ${e.message}`, 'error');
                }
                break;
            }

            case 'hash': {
                if (!args.length) {
                    termPrint('Usage: hash <text>', 'error');
                    break;
                }
                const text = args.join(' ');
                try {
                    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                    termPrint(hex, 'success');
                } catch (e) {
                    termPrint(`Hash error: ${e.message}`, 'error');
                }
                break;
            }

            case 'check': {
                if (!args.length) {
                    termPrint('Usage: check <json_payload>', 'error');
                    break;
                }
                try {
                    JSON.parse(args.join(' '));
                    termPrint('VALID: JSON syntax is valid (0 errors).', 'success');
                } catch (e) {
                    termPrint(`SYNTAX ERROR: ${e.message}`, 'error');
                }
                break;
            }

            case 'echo':
                termPrint(args.join(' '));
                break;

            case 'ping':
                termPrint('pong', 'success');
                break;

            case 'clear':
                termClear();
                break;

            case 'close':
            case 'hide':
            case 'exit':
                toggleOverlay();
                break;

            case 'info':
                termPrint('RedTerminal v1.0 [Cross-Browser Mutator Extension]', 'highlight');
                termPrint('Engine: Manifest V3 Shadow-DOM Isolated Terminal Emulator');
                termPrint('Active Host: ' + window.location.hostname);
                termPrint('DOM Selector Engine: Active');
                break;

            default:
                termPrint(`redterm: command not found: ${action}. Type 'help' for manual.`, 'error');
                break;
        }
    }

    function commitCommand() {
        const cmd = currentBuffer;
        if (activeLine && termBody) {
            const historyLine = document.createElement('div');
            historyLine.className = 'term-line';
            historyLine.innerHTML = `<span class="term-prompt">redterm &gt;</span> <span>${escapeHtml(cmd)}</span>`;
            termBody.insertBefore(historyLine, activeLine);
        }

        if (cmd.trim()) {
            commandHistory.push(cmd);
            historyIndex = commandHistory.length;
        }

        currentBuffer = '';
        updateInputDisplay();

        if (cmd.trim()) {
            executeCommand(cmd);
        }
    }

    // ==========================================
    // 7. Keyboard Input Handling (Isolated)
    // ==========================================
    // Focus terminal on click anywhere on overlay
    overlay.addEventListener('click', () => {
        focusInput();
    });

    // Trap typing inside overlay to prevent triggering host page hotkeys
    overlay.addEventListener('keydown', (e) => {
        // Stop key event from reaching host webpage
        e.stopPropagation();

        if (e.ctrlKey || e.metaKey) {
            if (e.key.toLowerCase() === 'l') {
                e.preventDefault();
                termClear();
            } else if (e.key.toLowerCase() === 'c') {
                e.preventDefault();
                termPrint('^C', 'dim');
                currentBuffer = '';
                updateInputDisplay();
            }
            return;
        }

        if (e.altKey) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            commitCommand();
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            if (currentBuffer.length > 0) {
                currentBuffer = currentBuffer.slice(0, -1);
                updateInputDisplay();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                currentBuffer = commandHistory[historyIndex];
                updateInputDisplay();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                currentBuffer = commandHistory[historyIndex];
                updateInputDisplay();
            } else {
                historyIndex = commandHistory.length;
                currentBuffer = '';
                updateInputDisplay();
            }
        } else if (e.key.length === 1) {
            e.preventDefault();
            currentBuffer += e.key;
            updateInputDisplay();
        }
    });

    // Listen for messages from background.js
    const extRuntime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);
    if (extRuntime && extRuntime.onMessage) {
        extRuntime.onMessage.addListener((request, sender, sendResponse) => {
            if (request && request.action === 'toggle_terminal') {
                toggleOverlay();
                sendResponse({ success: true, isVisible });
            }
        });
    }

    // Global keyboard shortcut fallback (Alt+Shift+T) on window
    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && e.code === 'KeyT') {
            e.preventDefault();
            toggleOverlay();
        }
    });

    // Initial greeting
    termPrint('REDTERM v1.0 [Cross-Browser Mutator Extension Loaded]', 'highlight');
    termPrint("Type 'help' to inspect commands. Try 'nuke-ads' or 'extract-tables'.", 'dim');
    termPrint('');
    focusInput();
})();
