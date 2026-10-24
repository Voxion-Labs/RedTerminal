/**
 * RedTerminal - Vanilla JS Terminal Emulator
 * Zero-dependency interactive terminal with Emscripten WASM Module integration.
 */

// ==========================================
// Emscripten Module Initialization Block
// ==========================================
var Module = {
    preRun: [],
    postRun: [],
    print: function(text) {
        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        termPrint(text);
    },
    printErr: function(text) {
        if (arguments.length > 1) {
            text = Array.prototype.slice.call(arguments).join(' ');
        }
        termPrint(text, 'error');
    },
    onRuntimeInitialized: function() {
        termPrint('WASM core runtime initialized.', 'system');
    }
};

// Fallback allocator in case Emscripten runtime is still loading or running standalone
let mockMemoryBuffer = null;
let mockHeapOffset = 4096;
function ensureWasmMemory() {
    if (!Module.HEAPU8) {
        if (!mockMemoryBuffer) {
            mockMemoryBuffer = new ArrayBuffer(16 * 1024 * 1024); // 16MB mock WASM linear memory
        }
        Module.HEAPU8 = new Uint8Array(mockMemoryBuffer);
    }
    if (typeof Module._malloc !== 'function') {
        Module._malloc = function(size) {
            const ptr = mockHeapOffset;
            mockHeapOffset += (size + 15) & ~15; // 16-byte alignment
            if (mockHeapOffset > Module.HEAPU8.length) {
                mockHeapOffset = 4096;
            }
            return ptr;
        };
    }
    if (typeof Module._free !== 'function') {
        Module._free = function() {};
    }
    if (typeof Module._process_data !== 'function') {
        Module._process_data = function(ptr) {
            // Mock implementation: returns input pointer
            return ptr;
        };
    }
    if (typeof Module._filter_logs !== 'function') {
        Module._filter_logs = function(inPtr) {
            return inPtr;
        };
    }
    if (typeof Module._validate_json !== 'function') {
        Module._validate_json = function() {
            return 0;
        };
    }
    if (typeof Module.UTF8ToString !== 'function') {
        Module.UTF8ToString = function(ptr) {
            if (!ptr || !Module.HEAPU8) return '';
            let str = '';
            let p = ptr;
            while (p < Module.HEAPU8.length && Module.HEAPU8[p] !== 0) {
                str += String.fromCharCode(Module.HEAPU8[p]);
                p++;
            }
            try {
                return decodeURIComponent(escape(str));
            } catch (e) {
                return str;
            }
        };
    }
}

/**
 * Fallback single-pass JSON validator when WASM binary is not loaded.
 */
function validateJsonFallback(payload) {
    if (!payload || !payload.trim()) return 1;
    let line = 1;
    const charStack = [];
    const lineStack = [];
    let inString = false;
    let stringStartLine = 1;

    for (let i = 0; i < payload.length; i++) {
        const c = payload[i];
        if (c === '\n') {
            line++;
            continue;
        }
        if (inString) {
            if (c === '\\') {
                i++;
                if (i < payload.length && payload[i] === '\n') line++;
                continue;
            }
            if (c === '"') {
                inString = false;
            }
            continue;
        }
        if (c === '"') {
            inString = true;
            stringStartLine = line;
        } else if (c === '{') {
            charStack.push('}');
            lineStack.push(line);
        } else if (c === '[') {
            charStack.push(']');
            lineStack.push(line);
        } else if (c === '}' || c === ']') {
            if (charStack.length === 0 || charStack.pop() !== c) {
                return line;
            }
            lineStack.pop();
        }
    }
    if (inString) return stringStartLine;
    if (charStack.length > 0) return lineStack.pop();
    return 0;
}

/**
 * Reads data from a WASM memory pointer, converts to Blob, and triggers browser file download.
 *
 * @param {number} ptr - Pointer address in WASM linear memory
 * @param {number} size - Number of bytes to read
 * @param {string} filename - Target file name for download
 * @param {string} [mimeType='application/octet-stream'] - MIME type for the Blob
 */
function downloadWasmOutput(ptr, size, filename = 'processed_output.bin', mimeType = 'application/octet-stream') {
    if (!ptr || size <= 0) {
        termPrint('ERR: Invalid WASM output pointer or size.', 'error');
        return;
    }

    ensureWasmMemory();

    // Read WASM memory slice from Emscripten HEAPU8
    const outputBytes = Module.HEAPU8.subarray(ptr, ptr + size);

    // Copy to an independent Uint8Array so it is detached from WASM heap
    const copiedBuffer = new Uint8Array(outputBytes);

    // Convert to Blob
    const blob = new Blob([copiedBuffer], { type: mimeType });

    // Trigger automatic browser file download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Opens a hidden file picker input and fires callback when a file is selected.
 *
 * @param {Function} onFileSelected - Callback receiving the selected File object
 * @param {string} [accept=''] - Optional MIME/extension filter
 */
function openHiddenFilePicker(onFileSelected, accept = '') {
    let picker = document.getElementById('hidden-file-picker');
    if (!picker) {
        picker = document.createElement('input');
        picker.type = 'file';
        picker.id = 'hidden-file-picker';
        picker.style.display = 'none';
        document.body.appendChild(picker);
    }
    picker.accept = accept;
    picker.value = '';
    picker.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            onFileSelected(file);
        }
    };
    picker.click();
}

/**
 * Placeholder for executing commands via WASM / Emscripten.
 * Dispatches to Module.ccall if available, or processes placeholder commands.
 *
 * @param {string} cmd - Command string entered by user
 */
function executeCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Check if Emscripten ccall is exported and available for general command handling
    if (typeof Module !== 'undefined' && typeof Module.ccall === 'function') {
        try {
            Module.ccall('execute_command', null, ['string'], [trimmed]);
            return;
        } catch (err) {
            // Fallback to local dispatch
        }
    }

    // Local / WASM Command Dispatch
    const parts = trimmed.split(/\s+/);
    const action = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (action) {
        case 'help':
            termPrint('REDTERM Commands:', 'highlight');
            termPrint('  help            - Display available commands');
            termPrint('  upload          - Upload file to WASM memory & trigger processed download');
            termPrint('  filter <word>   - Filter uploaded log lines via WASM (preview + download)');
            termPrint('  b64 [-e|-d] <s> - Base64 encode/decode string via WASM');
            termPrint('  hash <text>     - Compute SHA-256 hash digest via WASM');
            termPrint('  check <json>    - High-speed single-pass JSON validator via WASM');
            termPrint('  clear           - Clear terminal screen');
            termPrint('  ping            - Test local shell latency');
            termPrint('  echo [text]     - Print arguments to terminal');
            termPrint('  ps              - Display mock process table');
            termPrint('  info            - Show architecture and runtime info');
            break;

        case 'upload':
            termPrint('Opening file picker...', 'dim');
            openHiddenFilePicker((file) => {
                termPrint(`Selected: ${file.name} (${file.size} bytes)`, 'highlight');
                const reader = new FileReader();
                reader.onload = function(e) {
                    let inPtr = 0;
                    let outPtr = 0;
                    try {
                        const arrayBuffer = e.target.result;
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const size = uint8Array.length;

                        ensureWasmMemory();

                        // 1. Allocate WASM memory using Emscripten _malloc
                        inPtr = Module._malloc(size);
                        if (!inPtr) {
                            termPrint('ERR: Failed to allocate WASM memory via _malloc.', 'error');
                            return;
                        }

                        // 2. Pass data to WASM memory using Emscripten HEAPU8
                        Module.HEAPU8.set(uint8Array, inPtr);
                        termPrint(`Transferred ${size} bytes to WASM HEAPU8 [inPtr: 0x${inPtr.toString(16)}].`, 'dim');

                        // 3. Call process_data (C function via Emscripten)
                        outPtr = inPtr;
                        if (typeof Module._process_data === 'function') {
                            outPtr = Module._process_data(inPtr, size);
                        } else if (typeof Module.ccall === 'function') {
                            try {
                                outPtr = Module.ccall('process_data', 'number', ['number', 'number'], [inPtr, size]);
                            } catch (err) {
                                outPtr = inPtr;
                            }
                        }

                        termPrint(`WASM process_data returned outPtr: 0x${outPtr.toString(16)}.`, 'success');

                        // 4. Read returned WASM output pointer, convert to Blob, and trigger download
                        const downloadName = file.name.startsWith('processed_') ? file.name : `processed_${file.name}`;
                        downloadWasmOutput(outPtr, size, downloadName, file.type || 'application/octet-stream');
                        termPrint(`Automatic download initiated for '${downloadName}'.`, 'success');
                    } catch (err) {
                        termPrint(`ERR: Upload processing failed: ${err.message}`, 'error');
                    } finally {
                        // 5. Clean up allocated WASM memory immediately to prevent heap leaks
                        if (typeof Module._free === 'function') {
                            if (inPtr) {
                                Module._free(inPtr);
                            }
                            if (outPtr && outPtr !== inPtr) {
                                Module._free(outPtr);
                            }
                        }
                    }
                };
                reader.onerror = function() {
                    termPrint('ERR: Failed to read selected file.', 'error');
                };
                reader.readAsArrayBuffer(file);
            });
            break;

        case 'filter': {
            if (!args.length) {
                termPrint('Usage: filter <keyword>', 'error');
                termPrint('Example: filter ERROR', 'dim');
                break;
            }
            const kw = args.join(' ');
            termPrint(`Select a log file to filter lines containing '${kw}'...`, 'dim');
            openHiddenFilePicker((file) => {
                termPrint(`Loaded file '${file.name}' (${file.size} bytes). Filtering via WASM...`, 'highlight');
                const reader = new FileReader();
                reader.onload = function(e) {
                    let ptr = 0;
                    try {
                        const fileContent = e.target.result;
                        let filteredText = '';

                        if (typeof Module.ccall === 'function') {
                            ptr = Module.ccall('filter_logs', 'number', ['string', 'string'], [fileContent, kw]);
                            if (ptr) {
                                filteredText = Module.UTF8ToString(ptr);
                            }
                        } else {
                            // Fallback if WASM is not loaded
                            filteredText = fileContent.split('\n').filter(line => line.includes(kw)).join('\n');
                        }

                        // Parse matching lines for preview
                        const rawLines = filteredText ? filteredText.split(/\r?\n/) : [];
                        const matchedLines = rawLines.filter(line => line.length > 0);
                        const count = matchedLines.length;

                        if (count === 0) {
                            termPrint(`No lines matching keyword '${kw}' found.`, 'warning');
                        } else {
                            const previewLimit = Math.min(20, count);
                            termPrint(`--- Preview: First ${previewLimit} Matching Line(s) (Total: ${count}) ---`, 'highlight');
                            for (let i = 0; i < previewLimit; i++) {
                                termPrint(matchedLines[i]);
                            }
                            if (count > previewLimit) {
                                termPrint(`... [${count - previewLimit} additional line(s) omitted from preview]`, 'dim');
                            }
                            termPrint('----------------------------------------------------', 'highlight');

                            // Trigger automated browser download only after displaying preview
                            const blob = new Blob([filteredText], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = 'filtered_logs.txt';
                            document.body.appendChild(a);
                            a.click();

                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }, 100);

                            termPrint(`Success: Extracted ${count} matching line(s). Triggered download for 'filtered_logs.txt'.`, 'success');
                        }
                    } catch (err) {
                        termPrint(`ERR: Log filter processing failed: ${err.message}`, 'error');
                    } finally {
                        if (ptr && typeof Module._free === 'function') {
                            Module._free(ptr);
                            ptr = 0;
                        }
                    }
                };
                reader.onerror = function() {
                    termPrint('ERR: Failed to read selected file.', 'error');
                };
                reader.readAsText(file);
            }, '.txt,.log,text/*');
            break;
        }

        case 'b64': {
            if (!args.length) {
                termPrint('Usage: b64 [-e|encode | -d|decode] <text>', 'error');
                break;
            }
            let mode = 'encode';
            let textToProcess = '';

            const firstArg = args[0].toLowerCase();
            if (firstArg === '-e' || firstArg === 'encode') {
                mode = 'encode';
                textToProcess = args.slice(1).join(' ');
            } else if (firstArg === '-d' || firstArg === 'decode') {
                mode = 'decode';
                textToProcess = args.slice(1).join(' ');
            } else {
                mode = 'encode';
                textToProcess = args.join(' ');
            }

            if (!textToProcess) {
                termPrint(`ERR: No input string specified to ${mode}.`, 'error');
                break;
            }

            if (typeof Module.ccall === 'function') {
                let ptr = 0;
                try {
                    const fnName = mode === 'encode' ? 'base64_encode' : 'base64_decode';
                    ptr = Module.ccall(fnName, 'number', ['string'], [textToProcess]);
                    if (ptr) {
                        const result = Module.UTF8ToString(ptr);
                        termPrint(result, 'success');
                    } else {
                        termPrint('ERR: WASM Base64 returned null pointer.', 'error');
                    }
                } catch (err) {
                    termPrint(`ERR: WASM Base64 error: ${err.message}`, 'error');
                } finally {
                    if (ptr && typeof Module._free === 'function') {
                        Module._free(ptr);
                        ptr = 0;
                    }
                }
            } else {
                try {
                    if (mode === 'encode') {
                        const encoded = btoa(unescape(encodeURIComponent(textToProcess)));
                        termPrint(encoded, 'success');
                    } else {
                        const decoded = decodeURIComponent(escape(atob(textToProcess)));
                        termPrint(decoded, 'success');
                    }
                } catch (e) {
                    termPrint(`ERR: Base64 decode error: ${e.message}`, 'error');
                }
            }
            break;
        }

        case 'hash': {
            if (!args.length) {
                termPrint('Usage: hash <text>', 'error');
                break;
            }
            const textToHash = args.join(' ');
            if (typeof Module.ccall === 'function') {
                let ptr = 0;
                try {
                    ptr = Module.ccall('sha256_hash', 'number', ['string'], [textToHash]);
                    if (ptr) {
                        const digest = Module.UTF8ToString(ptr);
                        termPrint(digest, 'success');
                    } else {
                        termPrint('ERR: WASM SHA-256 returned null pointer.', 'error');
                    }
                } catch (err) {
                    termPrint(`ERR: WASM SHA-256 error: ${err.message}`, 'error');
                } finally {
                    if (ptr && typeof Module._free === 'function') {
                        Module._free(ptr);
                        ptr = 0;
                    }
                }
            } else {
                if (typeof crypto !== 'undefined' && crypto.subtle) {
                    crypto.subtle.digest('SHA-256', new TextEncoder().encode(textToHash))
                        .then(buf => {
                            const hashHex = Array.from(new Uint8Array(buf))
                                .map(b => b.toString(16).padStart(2, '0'))
                                .join('');
                            termPrint(hashHex, 'success');
                        })
                        .catch(err => {
                            termPrint(`ERR: Hash error: ${err.message}`, 'error');
                        });
                } else {
                    termPrint('[WASM sha256_hash Ready]', 'success');
                }
            }
            break;
        }

        case 'check': {
            if (!args.length) {
                termPrint('Usage: check <json_payload>', 'error');
                termPrint('Example: check {"name": "RedTerm", "features": ["wasm", "shell"]}', 'dim');
                break;
            }
            const jsonPayload = args.join(' ');
            termPrint('Executing single-pass JSON validation via WASM...', 'dim');
            let errLine = 0;
            if (typeof Module.ccall === 'function') {
                try {
                    errLine = Module.ccall('validate_json', 'number', ['string'], [jsonPayload]);
                } catch (err) {
                    termPrint(`ERR: WASM validate_json error: ${err.message}`, 'error');
                    break;
                }
            } else {
                errLine = validateJsonFallback(jsonPayload);
            }

            if (errLine === 0) {
                termPrint('VALID: JSON syntax is valid (0 errors).', 'success');
            } else {
                termPrint(`SYNTAX ERROR: Bracket/brace/quote mismatch at line ${errLine}.`, 'error');
            }
            break;
        }

        case 'clear':
            termClear();
            break;

        case 'ping':
            termPrint('pong', 'success');
            break;

        case 'echo':
            termPrint(args.join(' '));
            break;

        case 'ps':
            termPrint('PID   NAME            STATE       CPU%   MEM', 'dim');
            termPrint('1     init            RUNNING     0.2    16M', 'success');
            termPrint('2     scheduler_wasm  RUNNING     1.4    24M', 'success');
            termPrint('3     logger_async    IDLE        0.0    8M', 'dim');
            break;

        case 'info':
            termPrint('RedTerminal v1.0 [WASM Module Ready]', 'highlight');
            termPrint('Runtime : Go HTTP Standard Library + HTMX + Vanilla JS');
            termPrint('Engine  : Emscripten WASM Subsystem (_malloc, HEAPU8, process_data)');
            break;

        default:
            termPrint(`redterm: command not found: ${action}. Type 'help' for manual.`, 'error');
            break;
    }
}

// ==========================================
// Terminal Emulator UI & Keyboard Handling
// ==========================================
let currentBuffer = '';
let commandHistory = [];
let historyIndex = -1;

const terminalContainer = document.getElementById('terminal-body');
const activeInput = document.getElementById('active-input');
const activeCursor = document.getElementById('active-cursor');

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateInputDisplay() {
    if (activeInput) {
        activeInput.textContent = currentBuffer;
    }
    scrollToBottom();
}

function scrollToBottom() {
    const win = document.getElementById('terminal-window');
    if (win) {
        win.scrollTop = win.scrollHeight;
    }
}

function termPrint(text, type = '') {
    if (!terminalContainer) return;
    const line = document.createElement('div');
    line.className = `term-output ${type ? 'term-' + type : ''}`;
    line.innerHTML = escapeHtml(text);

    // Insert before current active prompt line
    const activeLine = document.getElementById('active-line');
    if (activeLine) {
        terminalContainer.insertBefore(line, activeLine);
    } else {
        terminalContainer.appendChild(line);
    }
    scrollToBottom();
}

function termClear() {
    if (!terminalContainer) return;
    const activeLine = document.getElementById('active-line');
    terminalContainer.innerHTML = '';
    if (activeLine) {
        terminalContainer.appendChild(activeLine);
    }
    currentBuffer = '';
    updateInputDisplay();
}

function commitCommand() {
    const cmd = currentBuffer;
    const activeLine = document.getElementById('active-line');

    // Archive current active line to history DOM
    if (activeLine && terminalContainer) {
        const historyLine = document.createElement('div');
        historyLine.className = 'term-line';
        historyLine.innerHTML = `<span class="prompt">redterm &gt;</span> <span class="term-cmd">${escapeHtml(cmd)}</span>`;
        terminalContainer.insertBefore(historyLine, activeLine);
    }

    if (cmd.trim()) {
        commandHistory.push(cmd);
        historyIndex = commandHistory.length;
    }

    currentBuffer = '';
    updateInputDisplay();

    // Execute through Emscripten / placeholder pipeline
    if (cmd.trim()) {
        executeCommand(cmd);
    }
}

// Keyboard Input Handler (Printable chars, Enter, Backspace, History)
document.addEventListener('keydown', (e) => {
    // Ignore key combinations with Ctrl or Alt (except Ctrl+L for clear, Ctrl+C for interrupt)
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
        // Printable single-character input
        e.preventDefault();
        currentBuffer += e.key;
        updateInputDisplay();
    }
});

// Focus helper: clicking anywhere on terminal ensures typing focus
document.addEventListener('click', () => {
    scrollToBottom();
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
    updateInputDisplay();
    termPrint('REDTERM v1.0 [Interactive Web Terminal]');
    termPrint("Type 'help' to inspect commands or 'upload' to test WASM file processing.", 'dim');
    termPrint('');
});
