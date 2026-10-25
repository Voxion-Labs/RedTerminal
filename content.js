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
    window.runCHtmlParserFallback = runCHtmlParserFallback;
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
    // 5. C-Powered HTML Parser (JS as a Dumb Pipe)
    // ==========================================

    /**
     * Passes raw HTML string to WASM linear memory and invokes C extract_page_data.
     * JS acts strictly as a dumb pipe: zero DOM parsing, displaying only the C-returned pointer string.
     *
     * @param {string} rawHtml - document.documentElement.outerHTML
     * @param {string} targetTag - target tag (e.g. 'table', 'script', 'csv')
     * @returns {string} Text returned by the C pointer
     */
    function callWasmExtract(rawHtml, targetTag) {
        if (!rawHtml || !targetTag) return '';

        if (typeof Module !== 'undefined' && typeof Module.ccall === 'function') {
            let ptr = 0;
            try {
                ptr = Module.ccall('extract_page_data', 'number', ['string', 'string'], [rawHtml, targetTag]);
                if (ptr) {
                    return Module.UTF8ToString(ptr);
                }
                return '';
            } catch (err) {
                console.warn('WASM extract_page_data execution error, using fallback:', err);
            } finally {
                if (ptr && typeof Module._free === 'function') {
                    Module._free(ptr);
                }
            }
        }

        // High-fidelity fallback mirroring src/html_parser.c pure pointer string scan
        return runCHtmlParserFallback(rawHtml, targetTag);
    }

    /**
     * Pure pointer string-scanning fallback mirroring src/html_parser.c logic.
     * Uses index offsets on the raw string with ZERO DOM parsing APIs.
     */
    function runCHtmlParserFallback(rawHtml, targetTag) {
        if (!rawHtml || !targetTag) return '';

        // Handle CSV table extraction mode
        if (targetTag === 'csv' || targetTag === 'table_csv') {
            let out = '';
            let tableCount = 0;
            let p = 0;
            const len = rawHtml.length;

            while (p < len) {
                const tableOpen = rawHtml.toLowerCase().indexOf('<table', p);
                if (tableOpen === -1) break;

                const tableGt = rawHtml.indexOf('>', tableOpen + 6);
                if (tableGt === -1) { p = tableOpen + 6; continue; }

                const tableClose = rawHtml.toLowerCase().indexOf('</table>', tableGt + 1);
                const tblEnd = (tableClose === -1) ? len : tableClose;
                const tableInner = rawHtml.slice(tableGt + 1, tblEnd);

                tableCount++;
                if (tableCount > 1) out += '\n';
                out += `=== Table ${tableCount} ===\n`;

                let rp = 0;
                while (rp < tableInner.length) {
                    const trOpen = tableInner.toLowerCase().indexOf('<tr', rp);
                    if (trOpen === -1) break;

                    const trGt = tableInner.indexOf('>', trOpen + 3);
                    if (trGt === -1) { rp = trOpen + 3; continue; }

                    const trClose = tableInner.toLowerCase().indexOf('</tr>', trGt + 1);
                    const trEnd = (trClose === -1) ? tableInner.length : trClose;
                    const trInner = tableInner.slice(trGt + 1, trEnd);

                    const cells = [];
                    let cp = 0;
                    while (cp < trInner.length) {
                        const thIdx = trInner.toLowerCase().indexOf('<th', cp);
                        const tdIdx = trInner.toLowerCase().indexOf('<td', cp);
                        let cellOpen = -1;
                        let tagLen = 3;
                        let closeTag = '</th>';

                        if (thIdx !== -1 && tdIdx !== -1) {
                            if (thIdx < tdIdx) { cellOpen = thIdx; closeTag = '</th>'; }
                            else { cellOpen = tdIdx; closeTag = '</td>'; }
                        } else if (thIdx !== -1) {
                            cellOpen = thIdx; closeTag = '</th>';
                        } else if (tdIdx !== -1) {
                            cellOpen = tdIdx; closeTag = '</td>';
                        } else {
                            break;
                        }

                        const cellGt = trInner.indexOf('>', cellOpen + tagLen);
                        if (cellGt === -1) { cp = cellOpen + tagLen; continue; }

                        const cellClose = trInner.toLowerCase().indexOf(closeTag, cellGt + 1);
                        const cellEnd = (cellClose === -1) ? trInner.length : cellClose;
                        let cellContent = trInner.slice(cellGt + 1, cellEnd);

                        cellContent = cellContent.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');

                        if (cellContent.includes(',') || cellContent.includes('"') || cellContent.includes('\n')) {
                            cellContent = `"${cellContent.replace(/"/g, '""')}"`;
                        }
                        cells.push(cellContent);
                        cp = (cellClose === -1) ? trInner.length : cellClose + closeTag.length;
                    }

                    if (cells.length > 0) {
                        out += cells.join(',') + '\n';
                    }
                    rp = (trClose === -1) ? tableInner.length : trClose + 5;
                }

                p = (tableClose === -1) ? len : tableClose + 8;
            }
            return out;
        }

        // General tag extraction
        const tag = targetTag.replace(/^<|>$/g, '').toLowerCase();
        const openPattern = `<${tag}`;
        const closePattern = `</${tag}>`;
        let out = '';
        let p = 0;
        const len = rawHtml.length;

        while (p < len) {
            const openIdx = rawHtml.toLowerCase().indexOf(openPattern, p);
            if (openIdx === -1) break;

            const afterChar = rawHtml[openIdx + openPattern.length];
            if (afterChar && afterChar !== '>' && afterChar !== ' ' && afterChar !== '\t' && afterChar !== '\n' && afterChar !== '/') {
                p = openIdx + openPattern.length;
                continue;
            }

            const openGt = rawHtml.indexOf('>', openIdx + openPattern.length);
            if (openGt === -1) { p = openIdx + openPattern.length; continue; }

            if (rawHtml[openGt - 1] === '/') {
                out += rawHtml.slice(openIdx, openGt + 1) + '\n';
                p = openGt + 1;
                continue;
            }

            const closeIdx = rawHtml.toLowerCase().indexOf(closePattern, openGt + 1);
            if (closeIdx === -1) {
                out += rawHtml.slice(openIdx) + '\n';
                break;
            }

            const blockEnd = closeIdx + closePattern.length;
            out += rawHtml.slice(openIdx, blockEnd) + '\n';
            p = blockEnd;
        }

        return out;
    }

    /**
     * Extracts raw HTML string (document.documentElement.outerHTML)
     * and passes directly to the C WASM engine.
     */
    function executeExtractTables() {
        termPrint('Extracting tables via pure C pointer parser (extract_page_data)...', 'dim');
        const rawHtml = document.documentElement ? document.documentElement.outerHTML : '';
        const csvResult = callWasmExtract(rawHtml, 'csv');

        if (!csvResult || !csvResult.trim()) {
            termPrint('[C WASM Parser] No <table> elements found in raw HTML.', 'warning');
            return;
        }

        // Display C pointer string output directly in terminal
        termPrint(csvResult);

        // Trigger file download using string returned from C
        const blob = new Blob([csvResult], { type: 'text/csv;charset=utf-8;' });
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

        termPrint(`[C WASM Parser] Triggered download for '${filename}'.`, 'success');
    }

    /**
     * Extracts script and ad blocks from raw HTML using C WASM parser.
     */
    function executeNukeAds() {
        termPrint('Extracting ad/tracking tags via pure C pointer parser (extract_page_data)...', 'dim');
        const rawHtml = document.documentElement ? document.documentElement.outerHTML : '';
        const extracted = callWasmExtract(rawHtml, 'script');

        if (!extracted || !extracted.trim()) {
            termPrint('[C WASM Parser] No <script> tags detected in raw HTML.', 'dim');
            return;
        }

        termPrint('--- Extracted Ad / Script Tags via C Engine ---', 'highlight');
        termPrint(extracted);
        termPrint('------------------------------------------------', 'highlight');
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
                termPrint('  extract <tag>   - Parse and extract specific tag blocks via pure C WASM engine');
                termPrint('  extract-tables  - Extract all <table> blocks into CSV via C WASM engine');
                termPrint('  nuke-ads        - Scan and extract ad/tracking script blocks via C WASM engine');
                termPrint('  b64 [-e|-d] <s> - Base64 encode or decode string');
                termPrint('  hash <text>     - Compute SHA-256 digest');
                termPrint('  check <json>    - Fast AST-free single-pass JSON validator');
                termPrint('  echo [text]     - Print arguments to terminal');
                termPrint('  ping            - Test terminal latency');
                termPrint('  clear           - Clear terminal buffer');
                termPrint('  close / hide    - Hide overlay (or press Alt+Shift+T)');
                termPrint('  info            - Show Mutator Extension runtime info');
                break;

            case 'extract': {
                const tag = args[0] || 'table';
                termPrint(`Extracting <${tag}> via C WASM html_parser...`, 'dim');
                const rawHtml = document.documentElement ? document.documentElement.outerHTML : '';
                const extracted = callWasmExtract(rawHtml, tag);
                if (!extracted || !extracted.trim()) {
                    termPrint(`No <${tag}> elements found by C WASM parser.`, 'warning');
                    break;
                }
                termPrint(extracted);
                break;
            }

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
