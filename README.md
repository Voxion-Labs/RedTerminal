# RedTerminal

RedTerminal is a lightweight, systems-level C project that demonstrates fundamental operating systems concepts, including process lifecycle management, simulated CPU scheduling, and interactive CLI design. 

## Project Structure

```text
RedTerminal/
├── Makefile                # Build system configuration
├── README.md               # Project overview and instructions
├── LICENSE                 # MIT License
├── .gitignore              # Ignored files
├── .github/workflows/      # CI/CD pipelines
│   └── build.yml
├── docs/                   # Detailed technical documentation
│   ├── architecture.md     # Module layout and thread model
│   └── commands.md         # CLI reference guide
├── include/                # Public C header files (API contracts)
│   ├── logger.h
│   ├── process.h
│   ├── scheduler.h
│   ├── shell.h
│   └── utils.h
├── src/                    # C source implementations
│   ├── logger.c
│   ├── main.c
│   ├── process.c
│   ├── scheduler.c
│   ├── shell.c
│   └── utils.c
├── tests/                  # Automated C test suite
│   ├── test_logger.c
│   ├── test_process.c
│   └── test_scheduler.c
└── demo/                   # Vanilla JS Browser Simulation
    ├── app.js
    ├── index.html
    └── style.css
```

## Building and Running (Linux / macOS / WSL)

This project requires a POSIX-compliant environment with `gcc` and `make`.

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

### Run the Test Suite
The project includes minimal, meaningful assertion-based tests for the core modules.
```bash
make test
```

### Clean Build Artifacts
```bash
make clean
```

## Core Features

- **Process Manager**: Handles Process Control Blocks (PCBs) and strict state transitions (`RUNNING`, `STOPPED`, `TERMINATED`). Safely manages up to 256 processes.
- **Background Scheduler**: Utilizes POSIX threads (`pthreads`) to simulate CPU time allocation in the background, fully decoupled from the shell blocking IO.
- **Interactive Shell**: A robust REPL interface. Type `help` to see commands like `start`, `kill`, `pause`, `resume`, `ps`, and `logs`.
- **Thread-safe Logger**: Asynchronously writes structured system events to `redterm.log` using mutex locks.
- **Web Demo**: A stunning, glassmorphism-styled Vanilla JS terminal emulator available in the `demo/` folder, directly deployable to GitHub Pages.

## Documentation

For an in-depth look at how the modules interact, the threading model, and the data structures used, please see [Architecture (docs/architecture.md)](docs/architecture.md).

For a complete reference on all CLI commands and their behaviors, please see [Commands (docs/commands.md)](docs/commands.md).

## Future Improvements

While this simulator demonstrates core concepts, future iterations could explore:
1. **Advanced Scheduling Algorithms**: Transition from simple accumulation to priority-based queues, Round-Robin (RR), or Shortest Job First (SJF) simulations.
2. **Memory Management Simulation**: Introduce simulated paging or segmentation logic attached to each PCB.
3. **Piped Commands**: Add shell capabilities for piping outputs (e.g., `ps | grep name`).
4. **True Multi-Processing**: Replace the simulated array approach with actual `fork()` and `execvp()` calls to manage real OS processes.

## License

This project is open-source and available under the [MIT License](LICENSE).
