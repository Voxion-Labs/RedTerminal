const output = document.getElementById('output');
const input = document.getElementById('command-input');
const typedInput = document.getElementById('typed-input');
const terminal = document.getElementById('terminal');

// Telemetry DOM elements
const activeProcCount = document.getElementById('active-proc-count');
const cpuLoadBar = document.getElementById('cpu-load');
const cpuVal = document.getElementById('cpu-val');
const memLoadBar = document.getElementById('mem-load');
const memVal = document.getElementById('mem-val');

// Process Management State
let processTable = [];
let logs = [];
let nextPid = 1;
let isRunning = true;
let simulatedCpuLoad = 5;

// Utility functions
function padEnd(str, length) {
    return String(str).padEnd(length, ' ');
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
            setTimeout(typeChar, 15);
        } else {
            terminal.scrollTop = terminal.scrollHeight;
        }
    }
    typeChar();
}

function printHTML(htmlString) {
    const line = document.createElement('div');
    line.className = `new-line`;
    line.innerHTML = htmlString;
    output.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// Telemetry Updates
function updateTelemetry() {
    if (!isRunning) return;

    // Calculate running processes
    const runningProcs = processTable.filter(p => p.state === 'RUNNING').length;
    activeProcCount.textContent = runningProcs.toString().padStart(2, '0');

    // Simulate CPU load based on running processes (deterministic)
    let targetCpu = 5 + (runningProcs * 15);
    targetCpu = Math.min(100, Math.max(0, targetCpu));

    // Smooth transition
    simulatedCpuLoad += (targetCpu - simulatedCpuLoad) * 0.2;

    cpuLoadBar.style.width = `${simulatedCpuLoad}%`;
    cpuVal.textContent = `${Math.round(simulatedCpuLoad)}%`;

    // Simulate memory load (exclude TERMINATED processes to prevent leaks)
    const activeProcs = processTable.filter(p => p.state !== 'TERMINATED').length;
    let targetMem = 2.1 + (activeProcs * 0.4);
    targetMem = Math.min(16.0, targetMem);
    memLoadBar.style.width = `${(targetMem / 16.0) * 100}%`;
    memVal.textContent = `${targetMem.toFixed(1)} GB`;
}

// Shell Commands
const commands = {
    help: () => {
        printLine('RedTerminal Subsystem Commands:', 'text-highlight');
        printLine('  start <name>   - Spawn a new process thread');
        printLine('  kill <pid>     - Send SIGTERM to a process');
        printLine('  pause <pid>    - Suspend execution (SIGSTOP)');
        printLine('  resume <pid>   - Resume execution (SIGCONT)');
        printLine('  ps             - Display active process table');
        printLine('  logs           - Dump system event logs');
        printLine('  clear          - Flush terminal buffer');
        printLine('  help           - Display this manual');
        printLine('  exit           - Safely halt subsystem');
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
        printLine('SYSTEM OFFLINE. Refresh to reboot.', 'text-error');
        input.disabled = true;

        cpuLoadBar.style.width = '0%';
        cpuVal.textContent = '0%';
        memLoadBar.style.width = '0%';
        memVal.textContent = '0.0 GB';
        document.querySelector('.blinking-dot').style.background = '#333';
        document.querySelector('.blinking-dot').style.boxShadow = 'none';
        document.querySelector('.status-indicator').style.color = '#333';
    },
    logs: () => {
        printLine('--- SYSTEM LOG DUMP ---', 'text-highlight');
        logs.forEach(l => printLine(l, 'text-muted'));
        printLine('-----------------------', 'text-highlight');
    },
    start: (args) => {
        if (!args.length) return printLine('ERR: Missing process name. Usage: start <name>', 'text-error');
        const name = args[0].substring(0, 20); // truncate for UI
        const pid = nextPid++;
        processTable.push({
            pid,
            name,
            state: 'RUNNING',
            cpuTime: 0,
            uptime: 0,
            cpuUsage: Math.random() * 10 + 1,
            memoryUsage: Math.random() * 50 + 10,
            createdAt: getCurrentTime()
        });
        logEvent('INFO', `Process created: PID=${pid}, Name=${name}`);
        printLine(`[+] Process '${name}' allocated to PID ${pid}`, 'text-success');
    },
    kill: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: kill <pid>', 'text-error');
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) {
            logEvent('ERROR', `Cannot kill process ${pid}: not found`);
            return printLine(`ERR: Process ${pid} not found in process table`, 'text-error');
        }
        if (proc.state === 'TERMINATED') {
            logEvent('WARN', `Cannot kill process ${pid}: already terminated`);
            return printLine(`WARN: Process ${pid} is already terminated`, 'text-warn');
        }
        proc.state = 'TERMINATED';
        logEvent('INFO', `Process killed: PID=${pid}`);
        printLine(`[-] Process ${pid} terminated via SIGTERM.`, 'text-error');
    },
    pause: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: pause <pid>', 'text-error');
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state !== 'RUNNING') return printLine(`WARN: Process ${pid} is not running`, 'text-warn');
        proc.state = 'STOPPED';
        logEvent('INFO', `Process paused: PID=${pid}`);
        printLine(`[~] Process ${pid} suspended.`, 'text-warn');
    },
    resume: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: resume <pid>', 'text-error');
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state !== 'STOPPED') return printLine(`WARN: Process ${pid} is not stopped`, 'text-warn');
        proc.state = 'RUNNING';
        logEvent('INFO', `Process resumed: PID=${pid}`);
        printLine(`[>] Process ${pid} resumed.`, 'text-success');
    },
    ps: () => {
        let out = `<span class="text-table-header">${padEnd('PID', 5)} ${padEnd('NAME', 15)} ${padEnd('STATE', 10)} ${padEnd('CPU%', 6)} ${padEnd('MEM', 8)} ${padEnd('TIME', 6)} ${padEnd('UP', 6)} ${padEnd('CREATED_AT', 20)}</span>\n`;
        processTable.forEach(p => {
            let stateColor = p.state === 'RUNNING' ? 'text-success' : (p.state === 'STOPPED' ? 'text-warn' : 'text-error');
            out += `<span class="text-highlight">${padEnd(p.pid, 5)}</span> ${padEnd(p.name, 15)} <span class="${stateColor}">${padEnd(p.state, 10)}</span> ${padEnd(p.cpuUsage.toFixed(1), 6)} ${padEnd(Math.round(p.memoryUsage) + 'M', 8)} ${padEnd(p.cpuTime, 6)} ${padEnd(p.uptime + 's', 6)} <span class="text-muted">${padEnd(p.createdAt, 20)}</span>\n`;
        });
        printHTML(out);
    }
};

// Scheduler Simulation Loop
setInterval(() => {
    if (!isRunning) return;
    processTable.forEach(p => {
        if (p.state === 'RUNNING') {
            p.cpuTime += 1;
            p.uptime += 1;
            
            // Random walk for CPU usage
            let walk = (Math.random() - 0.5) * 5;
            p.cpuUsage = Math.max(0, Math.min(100, p.cpuUsage + walk));
            
            // Random walk for Memory usage
            let memWalk = (Math.random() - 0.5) * 4;
            p.memoryUsage = Math.max(5, p.memoryUsage + memWalk);
        } else if (p.state === 'STOPPED') {
            p.uptime += 1;
            p.cpuUsage = 0;
        } else if (p.state === 'TERMINATED') {
            p.cpuUsage = 0;
            p.memoryUsage = 0;
        }
    });
    updateTelemetry();
}, 1000);

// Fast UI loop for smooth telemetry animations
setInterval(() => {
    if (isRunning) updateTelemetry();
}, 100);

// Input Handling
let commandHistory = [];
let historyIndex = -1;

input.addEventListener('input', () => {
    typedInput.textContent = input.value;
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const val = input.value.trim();
        input.value = '';
        typedInput.textContent = '';
        if (!val) return;

        commandHistory.push(val);
        historyIndex = commandHistory.length;

        printLine(`RedTerm➜ ${val}`, 'text-info');

        const parts = val.split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        if (commands[cmd]) {
            commands[cmd](args);
        } else {
            printLine(`ERR: Unknown command '${cmd}'. Type 'help' for manual.`, 'text-error');
        }
    } else if (e.key === 'ArrowUp') {
        if (historyIndex > 0) {
            historyIndex--;
            input.value = commandHistory[historyIndex];
            typedInput.textContent = input.value;
            setTimeout(() => {
                input.selectionStart = input.selectionEnd = input.value.length;
            }, 0);
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
    logEvent('INFO', 'System boot sequence initiated');
    logEvent('INFO', 'Logger initialized');
    logEvent('INFO', 'Process Manager allocated 256 PCB slots');
    logEvent('INFO', 'Scheduler thread attached');

    const bootScreen = document.getElementById('boot-screen');
    const bootText = document.getElementById('boot-text');
    const dashboard = document.getElementById('dashboard');
    const copyright = document.getElementById('copyright');

    const bootSequence = [
        "Initializing RedTerminal...",
        "Loading process scheduler...",
        "Mounting virtual process table...",
        "System ready."
    ];

    let step = 0;
    function runBoot() {
        if (step < bootSequence.length) {
            const line = document.createElement('div');
            line.className = 'boot-line text-muted';
            if (step === bootSequence.length - 1) line.className = 'boot-line text-success';
            line.textContent = bootSequence[step];
            bootText.appendChild(line);
            step++;
            setTimeout(runBoot, 400 + Math.random() * 400); // Simulated delay
        } else {
            setTimeout(() => {
                bootScreen.classList.add('fade-out');
                dashboard.classList.add('app-visible');
                copyright.classList.add('app-visible');
                
                // Initialize terminal after fade transition
                setTimeout(() => {
                    bootScreen.style.display = 'none';
                    input.focus();
                    printLine('Welcome to RedTerminal. System is ONLINE.', 'text-highlight');
                    printLine("Enter 'help' to view subsystem commands.", 'text-muted');
                    printLine('');
                }, 1000);
            }, 800);
        }
    }
    
    // Start boot sequence slightly after load for effect
    setTimeout(runBoot, 300);
};

