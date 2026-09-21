<p align="center">
  <img src="docs/assets/logo.png" alt="RedTerminal logo" width="220" />
</p>
<p align="center">
  A systems-level C executable engineered for process lifecycle management and simulated CPU scheduling.
</p>
<p align="center">
  <a href="https://voxion-labs.github.io/RedTerminal/">Live Web Interface</a>
  |
  <a href="https://github.com/Voxion-Labs/RedTerminal">Repository</a>
</p>

---

## Overview
RedTerminal operates as a C-based process simulator and interactive CLI. It enforces strict process state transitions, thread-safe asynchronous logging, and background thread scheduling. The project includes a Vanilla JS web-based terminal emulator that mirrors the OS mechanics within a browser environment.

---

## System Definition
RedTerminal is an isolated execution environment designed for the analysis of operating system process managers.

At the technical level, RedTerminal functions as:
- an interactive REPL shell environment
- a background CPU time scheduler simulator utilizing POSIX threads
- a Process Control Block (PCB) manager
- a thread-safe asynchronous event logger
- a web-based terminal emulator for browser deployment

---

## Architectural Objective
Analyzing operating systems typically involves navigating monolithic codebases, complicating the isolation of fundamental mechanisms.

RedTerminal provides a sterile, isolated environment to analyze:
- process transitions between RUNNING, STOPPED, and TERMINATED states
- background schedulers simulating CPU time allocation without blocking I/O
- concurrency management via thread-safe mutex locks
- the visualization of backend concepts in a modern web dashboard

---

## Links
- **[Live Web Interface](https://voxion-labs.github.io/RedTerminal/)**
- **[GitHub Repository](https://github.com/Voxion-Labs/RedTerminal)**
- **[Telemetry & Issues](https://github.com/Voxion-Labs/RedTerminal/issues)**

---

## Current Project State
RedTerminal currently ships with:

- a C-based interactive shell with command parsing
- executable commands: `start`, `kill`, `pause`, `resume`, `ps`, and `logs`
- an asynchronous `pthread`-based scheduler simulating CPU execution
- strict process lifecycle management scaling up to 256 concurrent processes
- an integrated Vanilla JS web interface mirroring the OS logic
- assertion-based test suites for core modules
- complete build automation via `Makefile`

---

## Core Specifications
- web interface utilizing glassmorphism UI and an OS-style initialization sequence
- real-time terminal input history and typing latency simulation in the browser
- decoupled background scheduler in C utilizing POSIX threads
- thread-safe logging infrastructure using mutexes
- interactive CLI interface handling edge cases and state validation
- lightweight footprint requiring only `gcc` and `make` for local compilation

---

## Execution Surfaces
### C Application Experience
- interactive REPL environment operating directly on standard I/O
- deterministic process lifecycle handling (RUNNING, STOPPED, TERMINATED)
- automated background logging of all critical system events
- detailed process table (`ps`) outputting active states and CPU time

### Web Interface Experience
- initialization screen sequence for OS startup simulation
- live telemetry sidebar tracking simulated CPU load, Memory, and Uptime
- cursor and typing animations mimicking native terminal behavior
- command history accessible via directional keys

---

## Telemetry Gallery
<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/web-demo-boot.png" alt="RedTerminal Boot" />
      <br />
      <strong>1. System Boot & Initialization</strong>
      <br />
      The web environment boots into a ready state with zero active processes and a baseline telemetry sidebar.
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/web-demo-active.png" alt="RedTerminal Active Processes" />
      <br />
      <strong>2. Active Process Simulation</strong>
      <br />
      Upon process initialization, the terminal tracks states in real-time, mapping PID allocations while the telemetry sidebar graphs synthetic CPU and memory load.
    </td>
  </tr>
</table>

---

## Operating Directives
RedTerminal operates on the following architectural directives:
- isolate complex OS mechanics
- translate concepts into readable C implementations
- provide an interactive execution interface
- output deterministic visualizations

These directives strictly govern the module structure, the threading model, data structures, and the accompanying web layer.

---

## Tech Stack
### Core Systems (Backend)
- C11 Standard
- POSIX Threads (`pthreads`)
- GNU Make

### Web Interface (Frontend)
- HTML5
- CSS3 (Custom Properties, Flexbox, Animations)
- Vanilla JavaScript (ES6+)

---

## Project Structure
```text
RedTerminal/
├── Makefile                # Build system configuration
├── README.md               # Project overview and instructions
├── LICENSE                 # MIT License
├── .github/workflows/      # CI/CD pipelines
├── demo/                   # Technical documentation & assets
│   ├── architecture.md     # Module layout and thread model
│   ├── commands.md         # CLI reference guide
│   └── screenshots/        # Telemetry gallery assets
├── include/                # Public C header files (API contracts)
├── src/                    # C source implementations
├── tests/                  # Automated C test suite
└── docs/                   # Vanilla JS Browser Simulation
    ├── app.js
    ├── index.html
    └── style.css
```

---

## Architecture
### Systems Responsibilities
- **Process Manager**: Handles Process Control Blocks (PCBs) and strict state transitions. Secures memory and enforces active limits.
- **Scheduler**: Utilizes POSIX threads to simulate CPU time allocation in the background, fully decoupled from blocking I/O.
- **Logger**: Asynchronously writes structured system events to `redterm.log` using mutex locks.
- **Shell**: The primary entry point providing the REPL interface.

### Data Flow
1. User executes a command via the shell interface.
2. The shell parses arguments and delegates to the Process Manager.
3. The Process Manager updates the global PCB array securely.
4. The background Scheduler thread continuously polls the PCB array, granting CPU time to `RUNNING` processes.
5. All critical state changes invoke the thread-safe Logger to record events.

---

## Validation Snapshot
The current repository state includes:
- modular C codebase separated into `src` and `include` headers
- a `tests` directory containing assertion-based tests for `logger`, `process`, and `scheduler`
- automated testing execution available via `make test`
- functional web interface deployable to static hosting

---

## Key Capabilities
- simulated CPU scheduling and multi-process lifecycle tracking
- state validation preventing illegal transitions (e.g., terminating a dead process)
- interactive browser-based simulation mapping the C application feature-set
- live telemetry tracking simulated CPU load, memory usage, and uptime
- CI/CD ready structure utilizing GitHub Actions workflows

---

## Current Scope
RedTerminal is positioned as a systems simulator and web environment with:
- an interactive C CLI executable
- a complete web-based terminal simulator
- background thread simulation
- thread-safe logging infrastructure
- documentation on architecture and command execution

---

## Local Execution
### Prerequisites
- A POSIX-compliant environment (Linux / macOS / WSL)
- `gcc` compiler
- `make` utility

### Compile the Application
```bash
make
```

### Run the Application
```bash
./redterm
# OR
make run
```

---

## Build Directives
### Start Application
```bash
make run
```

### Run Test Suite
```bash
make test
```

### Clean Build Artifacts
```bash
make clean
```

---

## Deployment
### Web Interface Deployment
- Hosted as a static web environment via GitHub Pages
- Public deployment URL: [https://voxion-labs.github.io/RedTerminal/](https://voxion-labs.github.io/RedTerminal/)

### Deployment Profile
- browser-first frontend located in the `docs/` directory
- zero external dependencies or build tools required for the web environment

---

## License

RedTerminal operates under the MIT License.

The full license text is available in the [LICENSE](LICENSE) directive.

License summary:
- copyright © 2026 Rudranarayan Jena
- permission is granted to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software
- provided "as is", without warranty of any kind

---

## Author
<p align="center">
  <img src="docs/assets/author-rudranarayan-jena.jpg" alt="Rudranarayan Jena" width="180" />
</p>
<p align="center">
  <strong>Maintained by <a href="https://github.com/liambrooks-lab">Rudranarayan Jena</a></strong>
</p>
<p align="center">
  <strong>Founder of Voxion Labs</strong>
</p>

---
