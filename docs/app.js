const output = document.getElementById('output');
const input = document.getElementById('command-input');
const typedInput = document.getElementById('typed-input');
const terminal = document.getElementById('terminal');

// Status Bar Elements
const statusUptime = document.getElementById('status-uptime');
const statusWasmMem = document.getElementById('status-wasm-mem');

// Process Management State
let processTable = [];
let logs = [];
let nextPid = 1;
let isRunning = true;
let isBlocked = false;
let blockedOnPid = null;
let globalUptimeSeconds = 0;

// Virtual File System State
let currentPath = '/root';
const vfs = {
    '/root': ['config.sys', 'kernel.bin', 'docs', 'scripts'],
    '/root/docs': ['readme.txt', 'manual.pdf'],
    '/root/scripts': ['start.sh', 'net_monitor.sh']
};

// Utilities
function padEnd(str, length) { return String(str).padEnd(length, ' '); }
function padStart(str, length, char = ' ') { return String(str).padStart(length, char); }
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getCurrentTime() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

function logEvent(level, message) {
    logs.push(`[${getCurrentTime()}] [${level}] ${message}`);
}

function printLine(text, className = '') {
    const line = document.createElement('div');
    line.className = `new-line ${className}`;
    output.appendChild(line);

    let i = 0;
    function typeChar() {
        if (i < text.length) {
            line.textContent += text.charAt(i);
            i++;
            terminal.scrollTop = terminal.scrollHeight;
            setTimeout(typeChar, 6);
        } else {
            terminal.scrollTop = terminal.scrollHeight;
        }
    }
    typeChar();
}

function printHTML(htmlString) {
    const line = document.createElement('div');
    line.className = 'new-line';
    line.innerHTML = htmlString;
    output.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// Format seconds to HH:MM:SS
function formatUptime(sec) {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${padStart(hrs, 2, '0')}:${padStart(mins, 2, '0')}:${padStart(s, 2, '0')}`;
}

// Simulated WASM Linear Memory
function getWasmMemory() {
    const baseMem = 16.0;
    const activeProcs = processTable.filter(p => p.state !== 'TERMINATED').length;
    const historyBonus = commandHistory.length * 0.04;
    return (baseMem + (activeProcs * 0.4) + historyBonus).toFixed(1) + ' MB';
}

function updateStatus() {
    if (statusUptime) {
        statusUptime.textContent = formatUptime(globalUptimeSeconds);
    }
    if (statusWasmMem) {
        statusWasmMem.textContent = getWasmMemory();
    }
}

// Shell Commands
const commands = {
    help: () => {
        printLine('REDTERM Commands:', 'text-highlight');
        printLine('  start <name>        - Spawn a new process thread');
        printLine('  kill <pid>          - Send SIGTERM to a process');
        printLine('  pause <pid>         - Suspend execution (SIGSTOP)');
        printLine('  resume <pid>        - Resume execution (SIGCONT)');
        printLine('  fork <pid>          - Clone a running process');
        printLine('  execvp <pid> <name> - Replace process memory image');
        printLine('  waitpid <pid>       - Block terminal until PID terminates');
        printLine('  ps                  - Display active process table');
        printLine('  analyze <pid>       - Deep process introspection');
        printLine('  logs                - Dump system event logs');
        printLine('  export <target>     - Export dataset (targets: ps, logs)');
        printLine('  ping <host>         - ICMP network simulation');
        printLine('  sysinfo             - Display kernel and hardware specs');
        printLine('  calc <expr>         - Evaluate mathematical expression');
        printLine('  ls                  - List directory contents');
        printLine('  cd <dir>            - Change directory');
        printLine('  clear               - Flush terminal buffer');
        printLine('  exit                - Safely halt subsystem');
    },

    clear: () => {
        output.innerHTML = '';
    },

    exit: () => {
        isRunning = false;
        logEvent('INFO', 'System shutdown initiated');
        printLine('Initiating subsystem shutdown...', 'text-warn');
        printLine('Halting scheduler thread [OK]', 'text-info');
        printLine('Flushing logs [OK]', 'text-info');
        printLine('SYSTEM OFFLINE. Refresh page to reboot.', 'text-error');
        input.disabled = true;
    },

    logs: () => {
        printLine('--- SYSTEM LOG DUMP ---', 'text-highlight');
        logs.forEach(l => printLine(l, 'text-muted'));
        printLine('-----------------------', 'text-highlight');
    },

    start: (args) => {
        if (!args.length) return printLine('ERR: Missing process name. Usage: start <name>', 'text-error');
        const name = args[0].substring(0, 20);
        const pid = nextPid++;
        processTable.push({
            pid,
            name,
            state: 'RUNNING',
            cpuTime: 0,
            uptime: 0,
            cpuUsage: Math.random() * 8 + 1,
            memoryUsage: Math.random() * 40 + 10,
            createdAt: getCurrentTime()
        });
        logEvent('INFO', `Process created: PID=${pid}, Name=${name}`);
        printLine(`[+] Process '${name}' allocated to PID ${pid}`, 'text-success');
        updateStatus();
    },

    kill: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: kill <pid>', 'text-error');
        const pid = parseInt(args[0], 10);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found in process table`, 'text-error');
        if (proc.state === 'TERMINATED') return printLine(`WARN: Process ${pid} is already terminated`, 'text-warn');
        proc.state = 'TERMINATED';
        logEvent('INFO', `Process killed: PID=${pid}`);
        printLine(`[-] Process ${pid} terminated via SIGTERM.`, 'text-error');
        updateStatus();
    },

    pause: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: pause <pid>', 'text-error');
        const pid = parseInt(args[0], 10);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state !== 'RUNNING') return printLine(`WARN: Process ${pid} is not running`, 'text-warn');
        proc.state = 'STOPPED';
        logEvent('INFO', `Process paused: PID=${pid}`);
        printLine(`[~] Process ${pid} suspended.`, 'text-warn');
    },

    resume: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: resume <pid>', 'text-error');
        const pid = parseInt(args[0], 10);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state !== 'STOPPED') return printLine(`WARN: Process ${pid} is not stopped`, 'text-warn');
        proc.state = 'RUNNING';
        logEvent('INFO', `Process resumed: PID=${pid}`);
        printLine(`[>] Process ${pid} resumed.`, 'text-success');
    },

    fork: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: fork <pid>', 'text-error');
        const pid = parseInt(args[0], 10);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        const newPid = nextPid++;
        processTable.push({
            pid: newPid,
            name: `${proc.name} (clone)`,
            state: proc.state === 'TERMINATED' ? 'STOPPED' : proc.state,
            cpuTime: proc.cpuTime,
            uptime: 0,
            cpuUsage: proc.cpuUsage,
            memoryUsage: proc.memoryUsage,
            createdAt: getCurrentTime()
        });
        logEvent('INFO', `Process ${pid} forked to new PID=${newPid}`);
        printLine(`[+] Forked PID ${pid} -> New PID ${newPid}`, 'text-success');
        updateStatus();
    },

    execvp: (args) => {
        if (args.length < 2) return printLine('Usage: execvp <pid> <new_name>', 'text-error');
        const pid = parseInt(args[0], 10);
        const newName = args[1].substring(0, 20);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state === 'TERMINATED') return printLine('ERR: Cannot exec on terminated process', 'text-error');
        proc.name = newName;
        proc.cpuTime = 0;
        proc.uptime = 0;
        proc.memoryUsage = Math.random() * 40 + 10;
        proc.cpuUsage = Math.random() * 8 + 1;
        logEvent('INFO', `PID ${pid} execvp to ${newName}`);
        printLine(`[+] PID ${pid} memory space replaced with '${newName}'`, 'text-success');
    },

    waitpid: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: waitpid <pid>', 'text-error');
        const pid = parseInt(args[0], 10);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state === 'TERMINATED') return printLine(`[+] PID ${pid} is already terminated`, 'text-success');
        printLine(`[~] Blocking terminal until PID ${pid} terminates...`, 'text-warn');
        isBlocked = true;
        blockedOnPid = pid;
        input.disabled = true;
    },

    ps: () => {
        if (processTable.length === 0) {
            return printLine('No active processes in table. Use "start <name>" to spawn one.', 'text-muted');
        }
        let out = `<span class="text-table-header">${padEnd('PID', 5)} ${padEnd('NAME', 18)} ${padEnd('STATE', 11)} ${padEnd('CPU%', 6)} ${padEnd('MEM', 8)} ${padEnd('TIME', 6)} ${padEnd('UP', 6)} ${padEnd('CREATED_AT', 20)}</span>\n`;
        processTable.forEach(p => {
            const stateColor = p.state === 'RUNNING' ? 'text-success' : (p.state === 'STOPPED' ? 'text-warn' : 'text-error');
            out += `<span class="text-highlight">${padEnd(p.pid, 5)}</span> ${padEnd(p.name, 18)} <span class="${stateColor}">${padEnd(p.state, 11)}</span> ${padEnd(p.cpuUsage.toFixed(1), 6)} ${padEnd(Math.round(p.memoryUsage) + 'M', 8)} ${padEnd(p.cpuTime, 6)} ${padEnd(p.uptime + 's', 6)} <span class="text-muted">${padEnd(p.createdAt, 20)}</span>\n`;
        });
        printHTML(out);
    },

    export: (args) => {
        if (!args.length || (args[0] !== 'ps' && args[0] !== 'logs')) {
            return printLine('Usage: export <target>. Targets: ps, logs', 'text-error');
        }
        let content = '';
        let filename = '';
        if (args[0] === 'ps') {
            content = "PID,NAME,STATE,CPU,MEM,UPTIME,CREATED_AT\n" +
                processTable.map(p => `${p.pid},${p.name},${p.state},${p.cpuUsage.toFixed(1)},${p.memoryUsage.toFixed(1)},${p.uptime},${p.createdAt}`).join("\n");
            filename = "process_table.csv";
        } else {
            content = logs.join("\n");
            filename = "system_logs.txt";
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        logEvent('INFO', `Exported ${args[0]} to local filesystem`);
        printLine(`[+] Successfully exported ${filename}`, 'text-success');
    },

    analyze: (args) => {
        if (!args.length) return printLine('Usage: analyze <pid>', 'text-error');
        const pid = parseInt(args[0], 10);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: PID ${pid} not found`, 'text-error');

        let out = `<span class="text-highlight">--- PROCESS INTROSPECTION : PID ${pid} ---</span>\n`;
        out += `Name:           <span class="text-info">${escapeHtml(proc.name)}</span>\n`;
        out += `State:          <span class="${proc.state === 'RUNNING' ? 'text-success' : 'text-error'}">${proc.state}</span>\n`;
        out += `Base Address:   <span class="text-muted">0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(8, '0')}</span>\n`;
        out += `Thread Count:   ${Math.floor(Math.random() * 16 + 1)}\n`;
        out += `Open FDs:       ${Math.floor(Math.random() * 10)}\n`;
        out += `<span class="text-highlight">-----------------------------------------</span>`;
        printHTML(out);
    },

    ping: (args) => {
        if (!args.length) return printLine('Usage: ping <host>', 'text-error');
        const host = escapeHtml(args[0]);
        printLine(`PING ${host} (127.0.0.1): 56 data bytes`, 'text-info');

        let count = 0;
        function sendPing() {
            if (count < 4) {
                const time = (Math.random() * 15 + 5).toFixed(1);
                printLine(`64 bytes from ${host}: icmp_seq=${count} ttl=64 time=${time} ms`, 'text-success');
                count++;
                setTimeout(sendPing, 600);
            } else {
                printLine(`--- ${host} ping statistics ---`, 'text-highlight');
                printLine('4 packets transmitted, 4 packets received, 0.0% packet loss', 'text-info');
            }
        }
        setTimeout(sendPing, 300);
    },

    sysinfo: () => {
        const logo = `
<span class="text-muted">  ██████╗ ███████╗██████╗ </span>
<span class="text-muted">  ██╔══██╗██╔════╝██╔══██╗</span>
<span class="text-muted">  ██████╔╝█████╗  ██║  ██║</span>
<span class="text-muted">  ██╔══██╗██╔══╝  ██║  ██║</span>
<span class="text-muted">  ██║  ██║███████╗██████╔╝</span>
<span class="text-muted">  ╚═╝  ╚═╝╚══════╝╚═════╝ </span>`;
        const specs = `
<span class="text-highlight">OS:</span>          REDTERM v1.0
<span class="text-highlight">Kernel:</span>      v1.0.4-rt (WASM/V8)
<span class="text-highlight">Uptime:</span>      ${formatUptime(globalUptimeSeconds)}
<span class="text-highlight">WASM Memory:</span> ${getWasmMemory()}
<span class="text-highlight">Theme:</span>       Dark Monochrome
<span class="text-highlight">Procs:</span>       ${processTable.filter(p => p.state === 'RUNNING').length} running`;
        printHTML(`<div style="display:flex; gap: 24px; align-items: center; margin: 6px 0;"><div>${logo}</div><div>${specs}</div></div>`);
    },

    calc: (args) => {
        if (!args.length) return printLine('Usage: calc <expression>', 'text-error');
        try {
            const expr = args.join(' ');
            if (/[^0-9+\-*/().\s%]/.test(expr)) {
                return printLine('ERR: Mathematical expression contains invalid characters', 'text-error');
            }
            const result = new Function(`return (${expr})`)();
            printLine(`${expr} = ${result}`, 'text-success');
        } catch (e) {
            printLine('ERR: Invalid mathematical expression', 'text-error');
        }
    },

    ls: () => {
        const files = vfs[currentPath];
        if (!files) return printLine('Directory empty or access denied.', 'text-error');
        let out = '';
        files.forEach(f => {
            if (f.includes('.')) {
                out += `<span class="text-highlight" style="margin-right: 18px;">${escapeHtml(f)}</span>`;
            } else {
                out += `<span class="text-info" style="margin-right: 18px;">${escapeHtml(f)}/</span>`;
            }
        });
        printHTML(out);
    },

    cd: (args) => {
        if (!args.length) {
            currentPath = '/root';
            document.querySelector('.window-title').textContent = `root@redterm:${currentPath} (bash)`;
            return;
        }
        const dir = args[0];
        if (dir === '..') {
            if (currentPath !== '/root') {
                const parts = currentPath.split('/');
                parts.pop();
                currentPath = parts.join('/') || '/root';
            }
            document.querySelector('.window-title').textContent = `root@redterm:${currentPath} (bash)`;
            return;
        }
        const target = currentPath === '/root' ? `/root/${dir}` : `${currentPath}/${dir}`;
        if (vfs[target] || (vfs[currentPath] && vfs[currentPath].includes(dir) && !dir.includes('.'))) {
            currentPath = target;
            document.querySelector('.window-title').textContent = `root@redterm:${currentPath} (bash)`;
        } else {
            printLine(`cd: no such file or directory: ${dir}`, 'text-error');
        }
    }
};

// Simulation Loop (1s Interval)
setInterval(() => {
    if (!isRunning) return;
    globalUptimeSeconds++;
    updateStatus();

    if (isBlocked && blockedOnPid) {
        const proc = processTable.find(p => p.pid === blockedOnPid);
        if (!proc || proc.state === 'TERMINATED') {
            isBlocked = false;
            blockedOnPid = null;
            input.disabled = false;
            input.focus();
            printLine('[+] Process terminated. Terminal unblocked.', 'text-success');
        }
    }

    processTable.forEach(p => {
        if (p.state === 'RUNNING') {
            p.cpuTime += 1;
            p.uptime += 1;
            const walk = (Math.random() - 0.5) * 4;
            p.cpuUsage = Math.max(0.5, Math.min(100, p.cpuUsage + walk));
            const memWalk = (Math.random() - 0.5) * 2;
            p.memoryUsage = Math.max(5, p.memoryUsage + memWalk);
        } else if (p.state === 'STOPPED') {
            p.uptime += 1;
            p.cpuUsage = 0;
        } else if (p.state === 'TERMINATED') {
            p.cpuUsage = 0;
            p.memoryUsage = 0;
        }
    });
}, 1000);

// Input Handling
let commandHistory = [];
let historyIndex = -1;

input.addEventListener('input', () => {
    typedInput.textContent = input.value;
});

terminal.addEventListener('click', () => {
    input.focus();
});

input.addEventListener('keydown', (e) => {
    if (isBlocked) {
        e.preventDefault();
        return;
    }
    if (e.key === 'Enter') {
        const val = input.value.trim();
        input.value = '';
        typedInput.textContent = '';
        if (!val) return;

        commandHistory.push(val);
        historyIndex = commandHistory.length;

        // Print entered command with prompt
        printHTML(`<span class="prompt-host">redterm</span> <span class="prompt-arrow">&gt;</span> <span style="color:#ffffff;">${escapeHtml(val)}</span>`);

        const parts = val.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (commands[cmd]) {
            commands[cmd](args);
        } else {
            printLine(`ERR: Unknown command '${cmd}'. Type 'help' for manual.`, 'text-error');
        }
        updateStatus();

    } else if (e.key === 'ArrowUp') {
        if (historyIndex > 0) {
            historyIndex--;
            input.value = commandHistory[historyIndex];
            typedInput.textContent = input.value;
            setTimeout(() => { input.selectionStart = input.selectionEnd = input.value.length; }, 0);
        }
        e.preventDefault();
    } else if (e.key === 'ArrowDown') {
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            input.value = commandHistory[historyIndex];
            typedInput.textContent = input.value;
        } else {
            historyIndex = commandHistory.length;
            input.value = '';
            typedInput.textContent = '';
        }
        e.preventDefault();
    }
});

// Boot Sequence
window.onload = () => {
    const bootScreen = document.getElementById('boot-screen');
    const bootText = document.getElementById('boot-text');
    const terminalContainer = document.getElementById('terminal-container');

    const bootSequence = [
        "REDTERM v1.0 [Kernel 1.0.4-rt]",
        "Mounting WASM runtime environment... [OK]",
        "Initializing process table & scheduler... [OK]",
        "Interactive shell mounted."
    ];

    let step = 0;
    function runBoot() {
        if (step < bootSequence.length) {
            const line = document.createElement('div');
            line.className = 'boot-line';
            line.textContent = bootSequence[step];
            bootText.appendChild(line);
            step++;
            setTimeout(runBoot, 120);
        } else {
            setTimeout(() => {
                bootScreen.classList.add('fade-out');
                terminalContainer.classList.add('app-visible');

                setTimeout(() => {
                    bootScreen.style.display = 'none';
                    input.focus();
                    printLine('REDTERM v1.0 (x86_64-pc-none-elf)', 'text-muted');
                    printLine("Type 'help' for commands or 'ps' to inspect process table.", 'text-muted');
                    printLine('');
                }, 350);
            }, 250);
        }
    }
    setTimeout(runBoot, 80);
};
