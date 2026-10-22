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
 */
function openHiddenFilePicker(onFileSelected) {
    let picker = document.getElementById('hidden-file-picker');
    if (!picker) {
        picker = document.createElement('input');
        picker.type = 'file';
        picker.id = 'hidden-file-picker';
        picker.style.display = 'none';
        document.body.appendChild(picker);
    }
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
                    try {
                        const arrayBuffer = e.target.result;
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const size = uint8Array.length;

                        ensureWasmMemory();

                        // 1. Allocate WASM memory using Emscripten _malloc
                        const inPtr = Module._malloc(size);
                        if (!inPtr) {
                            termPrint('ERR: Failed to allocate WASM memory via _malloc.', 'error');
                            return;
                        }

                        // 2. Pass data to WASM memory using Emscripten HEAPU8
                        Module.HEAPU8.set(uint8Array, inPtr);
                        termPrint(`Transferred ${size} bytes to WASM HEAPU8 [inPtr: 0x${inPtr.toString(16)}].`, 'dim');

                        // 3. Call process_data (C function via Emscripten)
                        let outPtr = inPtr;
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

                        // 5. Clean up allocated WASM memory
                        if (typeof Module._free === 'function') {
                            Module._free(inPtr);
                            if (outPtr !== inPtr) {
                                Module._free(outPtr);
                            }
                        }
                    } catch (err) {
                        termPrint(`ERR: Upload processing failed: ${err.message}`, 'error');
                    }
                };
                reader.onerror = function() {
                    termPrint('ERR: Failed to read selected file.', 'error');
                };
                reader.readAsArrayBuffer(file);
            });
            break;

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
