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

// Advanced Panel Elements
const sysUptime = document.getElementById('sys-uptime');
const netTx = document.getElementById('net-tx');
const netRx = document.getElementById('net-rx');
const hexStream = document.getElementById('hex-stream');
const kernelLogStream = document.getElementById('kernel-log-stream');
const netSockets = document.getElementById('net-sockets');

// Process Management State
let processTable = [];
let logs = [];
let nextPid = 1;
let isRunning = true;
let isBlocked = false;
let blockedOnPid = null;
let simulatedCpuLoad = 5;
let globalUptimeSeconds = 0;

// Virtual File System State
let currentPath = '/root';
const vfs = {
    '/root': ['config.sys', 'kernel.bin', 'docs', 'scripts'],
    '/root/docs': ['readme.txt', 'manual.pdf'],
    '/root/scripts': ['start.sh', 'net_monitor.sh']
};

// Theme Definitions
const themes = {
    cyber: { main: '#00f0ff', dark: '#008a99', glow: 'rgba(0, 240, 255, 0.4)' },
    matrix: { main: '#00ff41', dark: '#008f11', glow: 'rgba(0, 255, 65, 0.4)' },
    red: { main: '#e63946', dark: '#9e1b25', glow: 'rgba(230, 57, 70, 0.4)' },
    purple: { main: '#b100e8', dark: '#5e007d', glow: 'rgba(177, 0, 232, 0.4)' }
};

// Utility functions
function padEnd(str, length) { return String(str).padEnd(length, ' '); }
function padStart(str, length, char=' ') { return String(str).padStart(length, char); }
function getCurrentTime() { const now = new Date(); return now.toISOString().replace('T', ' ').substring(0, 19); }
function logEvent(level, message) { logs.push(`[${getCurrentTime()}] [${level}] ${message}`); }

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
            setTimeout(typeChar, 10); // faster typing for complex view
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

// Format seconds to HH:MM:SS
function formatUptime(sec) {
    let hrs = Math.floor(sec / 3600);
    let mins = Math.floor((sec % 3600) / 60);
    let s = sec % 60;
    return `${padStart(hrs, 2, '0')}:${padStart(mins, 2, '0')}:${padStart(s, 2, '0')}`;
}

// Telemetry Updates
function updateTelemetry() {
    if (!isRunning) return;

    const runningProcs = processTable.filter(p => p.state === 'RUNNING').length;
    activeProcCount.textContent = runningProcs.toString().padStart(2, '0');

    // Simulate CPU load
    let targetCpu = 5 + (runningProcs * 15);
    targetCpu = Math.min(100, Math.max(0, targetCpu));
    simulatedCpuLoad += (targetCpu - simulatedCpuLoad) * 0.2;

    cpuLoadBar.style.width = `${simulatedCpuLoad}%`;
    cpuVal.textContent = `${Math.round(simulatedCpuLoad)}%`;

    // CPU Core Matrix
    const activeCores = Math.round((simulatedCpuLoad / 100) * 8);
    for (let i = 0; i < 8; i++) {
        const core = document.getElementById(`core-${i}`);
        if (!core) continue;
        if (i < activeCores) {
            core.style.background = 'var(--red-main)';
            core.style.boxShadow = '0 0 8px var(--red-main)';
        } else {
            core.style.background = '#111';
            core.style.boxShadow = 'none';
        }
    }

    // Simulate memory load
    const activeProcs = processTable.filter(p => p.state !== 'TERMINATED').length;
    let targetMem = 2.1 + (activeProcs * 0.4);
    targetMem = Math.min(16.0, targetMem);
    memLoadBar.style.width = `${(targetMem / 16.0) * 100}%`;
    memVal.textContent = `${targetMem.toFixed(1)} GB`;

    // Global Network I/O
    let txBase = runningProcs > 0 ? 50 : 2;
    let rxBase = runningProcs > 0 ? 80 : 5;
    netTx.textContent = `${(txBase + Math.random() * 20).toFixed(1)} KB/s`;
    netRx.textContent = `${(rxBase + Math.random() * 30).toFixed(1)} KB/s`;
}

// Shell Commands
const commands = {
    help: () => {
        printLine('RedTerminal Advanced Command Set:', 'text-highlight');
        printLine('  start <name>   - Spawn a new process thread');
        printLine('  kill <pid>     - Send SIGTERM to a process');
        printLine('  pause <pid>    - Suspend execution (SIGSTOP)');
        printLine('  resume <pid>   - Resume execution (SIGCONT)');
        printLine('  fork <pid>     - Clone a running process');
        printLine('  execvp <pid>   - Replace process image (Usage: execvp <pid> <new_name>)');
        printLine('  waitpid <pid>  - Block terminal until process terminates');
        printLine('  ps             - Display active process table');
        printLine('  analyze <pid>  - Deep process introspection');
        printLine('  logs           - Dump system event logs');
        printLine('  theme <color>  - Switch UI theme (red, cyber, matrix, purple)');
        printLine('  export <target>- Export data to file (targets: ps, logs)');
        printLine('  ping <host>    - ICMP network simulation');
        printLine('  sysinfo        - Display kernel and hardware specs');
        printLine('  calc <expr>    - Evaluate mathematical expression');
        printLine('  ls             - List directory contents');
        printLine('  cd <dir>       - Change directory');
        printLine('  clear          - Flush terminal buffer');
        printLine('  exit           - Safely halt subsystem');
    },
    clear: () => { output.innerHTML = ''; },
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
        netTx.textContent = '0.0 KB/s';
        netRx.textContent = '0.0 KB/s';
        
        for(let i=0; i<8; i++) {
            const core = document.getElementById(`core-${i}`);
            if(core) { core.style.background = '#111'; core.style.boxShadow = 'none'; }
        }
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
            pid, name, state: 'RUNNING', cpuTime: 0, uptime: 0,
            cpuUsage: Math.random() * 10 + 1, memoryUsage: Math.random() * 50 + 10,
            createdAt: getCurrentTime()
        });
        logEvent('INFO', `Process created: PID=${pid}, Name=${name}`);
        printLine(`[+] Process '${name}' allocated to PID ${pid}`, 'text-success');
    },
    kill: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: kill <pid>', 'text-error');
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found in process table`, 'text-error');
        if (proc.state === 'TERMINATED') return printLine(`WARN: Process ${pid} is already terminated`, 'text-warn');
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
    fork: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: fork <pid>', 'text-error');
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        const newPid = nextPid++;
        processTable.push({
            pid: newPid, name: proc.name + ' (clone)', state: proc.state === 'TERMINATED' ? 'STOPPED' : proc.state,
            cpuTime: proc.cpuTime, uptime: 0,
            cpuUsage: proc.cpuUsage, memoryUsage: proc.memoryUsage,
            createdAt: getCurrentTime()
        });
        logEvent('INFO', `Process ${pid} forked to new PID=${newPid}`);
        printLine(`[+] Forked PID ${pid} -> New PID ${newPid}`, 'text-success');
    },
    execvp: (args) => {
        if (args.length < 2) return printLine('Usage: execvp <pid> <new_name>', 'text-error');
        const pid = parseInt(args[0]);
        const newName = args[1].substring(0, 20);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state === 'TERMINATED') return printLine(`ERR: Cannot exec on terminated process`, 'text-error');
        proc.name = newName;
        proc.cpuTime = 0;
        proc.uptime = 0;
        proc.memoryUsage = Math.random() * 50 + 10;
        proc.cpuUsage = Math.random() * 10 + 1;
        logEvent('INFO', `PID ${pid} execvp to ${newName}`);
        printLine(`[+] PID ${pid} memory space replaced with '${newName}'`, 'text-success');
    },
    waitpid: (args) => {
        if (!args.length) return printLine('ERR: Missing PID. Usage: waitpid <pid>', 'text-error');
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: Process ${pid} not found`, 'text-error');
        if (proc.state === 'TERMINATED') return printLine(`[+] PID ${pid} is already terminated`, 'text-success');
        printLine(`[~] Blocking terminal until PID ${pid} terminates...`, 'text-warn');
        isBlocked = true;
        blockedOnPid = pid;
        input.disabled = true;
    },
    ps: () => {
        let out = `<span class="text-table-header">${padEnd('PID', 5)} ${padEnd('NAME', 15)} ${padEnd('STATE', 10)} ${padEnd('CPU%', 6)} ${padEnd('MEM', 8)} ${padEnd('TIME', 6)} ${padEnd('UP', 6)} ${padEnd('CREATED_AT', 20)}</span>\n`;
        processTable.forEach(p => {
            let stateColor = p.state === 'RUNNING' ? 'text-success' : (p.state === 'STOPPED' ? 'text-warn' : 'text-error');
            out += `<span class="text-highlight">${padEnd(p.pid, 5)}</span> ${padEnd(p.name, 15)} <span class="${stateColor}">${padEnd(p.state, 10)}</span> ${padEnd(p.cpuUsage.toFixed(1), 6)} ${padEnd(Math.round(p.memoryUsage) + 'M', 8)} ${padEnd(p.cpuTime, 6)} ${padEnd(p.uptime + 's', 6)} <span class="text-muted">${padEnd(p.createdAt, 20)}</span>\n`;
        });
        printHTML(out);
    },
    theme: (args) => {
        if (!args.length || !themes[args[0]]) return printLine(`Usage: theme <color>. Available: ${Object.keys(themes).join(', ')}`, 'text-error');
        const t = themes[args[0]];
        document.documentElement.style.setProperty('--accent-main', t.main);
        document.documentElement.style.setProperty('--accent-dark', t.dark);
        document.documentElement.style.setProperty('--accent-glow', t.glow);
        logEvent('INFO', `Theme switched to ${args[0]}`);
        printLine(`[+] Global UI theme successfully updated to '${args[0]}'`, 'text-success');
    },
    export: (args) => {
        if (!args.length || (args[0] !== 'ps' && args[0] !== 'logs')) return printLine('Usage: export <target>. Targets: ps, logs', 'text-error');
        let content = '', filename = '';
        if (args[0] === 'ps') {
            content = "PID,NAME,STATE,CPU,MEM,UPTIME,CREATED_AT\n" + processTable.map(p => `${p.pid},${p.name},${p.state},${p.cpuUsage.toFixed(1)},${p.memoryUsage.toFixed(1)},${p.uptime},${p.createdAt}`).join("\n");
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
        const pid = parseInt(args[0]);
        const proc = processTable.find(p => p.pid === pid);
        if (!proc) return printLine(`ERR: PID ${pid} not found`, 'text-error');
        
        let out = `<b>--- PROCESS INTROSPECTION : PID ${pid} ---</b>\n`;
        out += `Name:           <span class="text-info">${proc.name}</span>\n`;
        out += `State:          <span class="${proc.state === 'RUNNING' ? 'text-success' : 'text-error'}">${proc.state}</span>\n`;
        out += `Base Address:   <span class="text-muted">0x${Math.floor(Math.random()*0xFFFFFF).toString(16).toUpperCase().padStart(8,'0')}</span>\n`;
        out += `Thread Count:   ${Math.floor(Math.random() * 64 + 1)}\n`;
        out += `Open FDs:       ${Math.floor(Math.random() * 20)}\n`;
        out += `Socket Binds:   ${Math.random() > 0.5 ? '1 (TCP)' : 'None'}\n`;
        out += `<b>-----------------------------------------</b>`;
        printHTML(out);
    },
    ping: (args) => {
        if (!args.length) return printLine('Usage: ping <host>', 'text-error');
        const host = args[0];
        printLine(`PING ${host} (192.168.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}): 56 data bytes`, 'text-info');
        
        let count = 0;
        function sendPing() {
            if(count < 4) {
                const time = (Math.random() * 40 + 10).toFixed(1);
                printLine(`64 bytes from ${host}: icmp_seq=${count} ttl=64 time=${time} ms`, 'text-success');
                count++;
                setTimeout(sendPing, 1000);
            } else {
                printLine(`--- ${host} ping statistics ---`, 'text-highlight');
                printLine(`4 packets transmitted, 4 packets received, 0.0% packet loss`, 'text-info');
            }
        }
        setTimeout(sendPing, 500);
    },
    sysinfo: () => {
        const logo = `
<span class="text-error">      :::::::::  :::::::::: :::::::::  </span>
<span class="text-error">     :+:    :+: :+:        :+:    :+: </span>
<span class="text-error">    +:+    +:+ +:+        +:+    +:+  </span>
<span class="text-error">   +#++:++#:  +#++:++#   +#+    +:+   </span>
<span class="text-error">  +#+    +#+ +#+        +#+    +#+    </span>
<span class="text-error"> #+#    #+# #+#        #+#    #+#     </span>
<span class="text-error">###    ### ########## #########       </span>
        `;
        const specs = `
<span class="text-highlight">OS:</span>      RedTerminal Web OS v1.0.4
<span class="text-highlight">Kernel:</span>  RT-JS-Engine (V8)
<span class="text-highlight">Uptime:</span>  ${formatUptime(globalUptimeSeconds)}
<span class="text-highlight">CPU:</span>     Simulated 128-Thread APU
<span class="text-highlight">Memory:</span>  ${memVal.textContent} / 16.0 GB
<span class="text-highlight">Theme:</span>   <span class="text-error">Dynamic</span>
        `;
        printHTML(`<div style="display:flex; gap: 20px;"><div>${logo}</div><div style="padding-top:10px;">${specs}</div></div>`);
    },
    calc: (args) => {
        if (!args.length) return printLine('Usage: calc <expression>', 'text-error');
        try {
            // Very basic evaluation for simulation purposes. Uses Function constructor safely.
            const expr = args.join(' ');
            const result = new Function(`return ${expr}`)();
            printLine(`${expr} = ${result}`, 'text-success');
        } catch(e) {
            printLine(`ERR: Invalid mathematical expression`, 'text-error');
        }
    },
    ls: () => {
        const files = vfs[currentPath];
        if(!files) return printLine('Directory empty or access denied.', 'text-error');
        let out = '';
        files.forEach(f => {
            if(f.includes('.')) out += `<span class="text-success">${padEnd(f, 15)}</span>`;
            else out += `<span class="text-info">${padEnd(f+'/', 15)}</span>`;
        });
        printHTML(out);
    },
    cd: (args) => {
        if(!args.length) { currentPath = '/root'; return; }
        let dir = args[0];
        if(dir === '..') {
            if(currentPath !== '/root') {
                let parts = currentPath.split('/');
                parts.pop();
                currentPath = parts.join('/');
            }
            return;
        }
        let target = currentPath === '/root' ? `/root/${dir}` : `${currentPath}/${dir}`;
        if(vfs[target]) {
            currentPath = target;
        } else if (vfs[currentPath] && vfs[currentPath].includes(dir) && !dir.includes('.')) {
            currentPath = target;
        } else {
            printLine(`cd: no such file or directory: ${dir}`, 'text-error');
        }
    }
};

// Data Stream Generators
function genHexLine() {
    let addr = "0x" + Math.floor(Math.random()*0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
    let hex = "";
    let ascii = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.";
    for(let i=0; i<8; i++) {
        let val = Math.floor(Math.random()*256);
        hex += val.toString(16).toUpperCase().padStart(2, '0') + " ";
        ascii += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${addr}: <span class="text-muted">${hex}</span> <span class="text-success">${ascii}</span>`;
}

function updateHexStream() {
    if(!isRunning) return;
    const line = document.createElement('div');
    line.innerHTML = genHexLine();
    hexStream.appendChild(line);
    if(hexStream.childElementCount > 12) hexStream.removeChild(hexStream.firstChild);
}

const kernelLogMsgs = [
    "[SYS_MEM] Page fault handled at ",
    "[IRQ] Interrupt request processed #",
    "[SCHED] Context switch triggered by PID ",
    "[VFS] Inode cache sync completed",
    "[NET] Packet dropped matching filter rule ",
    "[SEC] Ring 0 boundary check OK for thread "
];

function updateKernelLog() {
    if(!isRunning) return;
    if(Math.random() > 0.4) return; // only log occasionally
    const msg = kernelLogMsgs[Math.floor(Math.random() * kernelLogMsgs.length)];
    const val = Math.floor(Math.random() * 9999);
    const line = document.createElement('div');
    line.textContent = `[${getCurrentTime().split(' ')[1]}] ${msg}${val}`;
    kernelLogStream.appendChild(line);
    if(kernelLogStream.childElementCount > 10) kernelLogStream.removeChild(kernelLogStream.firstChild);
}

function initSockets() {
    const states = ["ESTABLISHED", "LISTEN", "TIME_WAIT", "CLOSE_WAIT"];
    netSockets.innerHTML = '';
    for(let i=0; i<10; i++) {
        const ip = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.1.${Math.floor(Math.random()*255)}`;
        const port = Math.floor(Math.random() * 65000);
        const state = states[Math.floor(Math.random() * states.length)];
        const stateClass = state === "ESTABLISHED" ? "text-success" : (state === "LISTEN" ? "text-warn" : "text-muted");
        
        netSockets.innerHTML += `
        <div class="socket-row">
            <span class="text-info">TCP</span>
            <span>10.0.0.45:${Math.floor(Math.random()*10000)+10000}</span>
            <span>-></span>
            <span>${ip}:${port}</span>
            <span class="${stateClass}">${state}</span>
        </div>`;
    }
}

// Simulation Loops
setInterval(() => {
    if (!isRunning) return;
    globalUptimeSeconds++;
    sysUptime.textContent = formatUptime(globalUptimeSeconds);

    if (isBlocked && blockedOnPid) {
        const proc = processTable.find(p => p.pid === blockedOnPid);
        if (!proc || proc.state === 'TERMINATED') {
            isBlocked = false;
            blockedOnPid = null;
            input.disabled = false;
            input.focus();
            printLine(`[+] Process terminated. Terminal unblocked.`, 'text-success');
        }
    }

    processTable.forEach(p => {
        if (p.state === 'RUNNING') {
            p.cpuTime += 1;
            p.uptime += 1;
            let walk = (Math.random() - 0.5) * 5;
            p.cpuUsage = Math.max(0, Math.min(100, p.cpuUsage + walk));
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
    
    // Rotate sockets occasionally
    if(Math.random() > 0.7) initSockets();
}, 1000);

setInterval(updateHexStream, 150);
setInterval(updateKernelLog, 800);
setInterval(() => { if (isRunning) updateTelemetry(); }, 100);

// Input Handling
let commandHistory = [];
let historyIndex = -1;

input.addEventListener('input', () => { typedInput.textContent = input.value; });

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
        printLine(`RedTerm➜ ${val}`, 'text-info');

        const parts = val.split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        if(cmd === 'cd' || cmd === 'ls' || cmd === 'theme') {
            document.querySelector('.window-title').textContent = `root@redterm:${currentPath} (Simulator)`;
        }

        if (commands[cmd]) commands[cmd](args);
        else printLine(`ERR: Unknown command '${cmd}'. Type 'help' for manual.`, 'text-error');
        
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
    initSockets();
    const bootScreen = document.getElementById('boot-screen');
    const bootText = document.getElementById('boot-text');
    const dashboard = document.getElementById('dashboard');

    const bootSequence = [
        "Initializing RED_CORE Kernel v1.0.4...",
        "Loading advanced telemetry modules...",
        "Mounting virtual process matrix...",
        "Establishing external socket connections...",
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
            setTimeout(runBoot, 300 + Math.random() * 300);
        } else {
            setTimeout(() => {
                bootScreen.classList.add('fade-out');
                dashboard.classList.add('app-visible');
                
                setTimeout(() => {
                    bootScreen.style.display = 'none';
                    input.focus();
                    printLine('Welcome to RedTerminal Command Center. System is ONLINE.', 'text-highlight');
                    printLine("Type 'sysinfo' for OS details or 'help' for manual.", 'text-muted');
                    printLine('');
                }, 1000);
            }, 800);
        }
    }
    setTimeout(runBoot, 300);
};
