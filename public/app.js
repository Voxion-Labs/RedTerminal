/**
 * RedTerminal - Vanilla JS Terminal Emulator
 * Zero-dependency interactive terminal with Emscripten WASM Module placeholder.
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

/**
 * Placeholder for executing commands via WASM / Emscripten.
 * Dispatches to Module.ccall if available, or processes placeholder commands.
 *
 * @param {string} cmd - Command string entered by user
 */
function executeCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Check if Emscripten ccall is exported and available
    if (typeof Module !== 'undefined' && typeof Module.ccall === 'function') {
        try {
            Module.ccall('execute_command', null, ['string'], [trimmed]);
            return;
        } catch (err) {
            // Fallback to placeholder if native binding is pending
        }
    }

    // Dummy Emscripten Execution Placeholder
    const parts = trimmed.split(/\s+/);
    const action = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (action) {
        case 'help':
            termPrint('REDTERM Commands (WASM Placeholder):', 'highlight');
            termPrint('  help            - Display available commands');
            termPrint('  clear           - Clear terminal screen');
            termPrint('  ping            - Test local shell latency');
            termPrint('  echo [text]     - Print arguments to terminal');
            termPrint('  ps              - Display mock process table');
            termPrint('  info            - Show architecture and runtime info');
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
            termPrint('Engine  : Emscripten WASM Subsystem (placeholder)');
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
    termPrint("Type 'help' to inspect commands or 'info' for system architecture.", 'dim');
    termPrint('');
});
