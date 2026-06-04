# RedTerminal Architecture

RedTerminal is structured as a modular, multithreaded systems simulator written in C17. It avoids external dependencies, relying solely on POSIX standards (specifically `pthreads`) and the standard C library.

## Module Overview

The system is divided into five core components:

1. **Process Manager (`process.h` / `process.c`)**
   - **Responsibility:** Maintains the internal state of all simulated processes.
   - **Data Structure:** A fixed-size array (`process_table`) capable of holding up to 256 `pcb_t` (Process Control Block) structures.
   - **Concurrency:** Uses a POSIX mutex (`pt_mutex`) to ensure thread-safe creation and state modifications of processes.
   
2. **Scheduler Simulator (`scheduler.h` / `scheduler.c`)**
   - **Responsibility:** Simulates CPU time allocation.
   - **Threading:** Runs on a dedicated background POSIX thread spawned during `scheduler_start()`.
   - **Logic:** Wakes up every 1 second (`sleep(1)`). Iterates over the process table via `process_get_table()` and increments the `cpu_time` of any process currently in the `PROCESS_STATE_RUNNING` state.

3. **Interactive Shell (`shell.h` / `shell.c`)**
   - **Responsibility:** The main user interface loop.
   - **Logic:** Blocks on `stdin` using `fgets`. Parses commands, extracts arguments using string manipulation, and delegates actions to the Process Manager or Logger.
   - **Integration:** Calls process state transition functions (`process_create`, `process_kill`, etc.) based on user input and prints the formatted process table.

4. **Thread-Safe Logger (`logger.h` / `logger.c`)**
   - **Responsibility:** Records system events asynchronously to a file (`redterm.log`).
   - **Concurrency:** Uses `log_mutex` to ensure multiple threads (e.g., the main shell thread and the background scheduler thread) can write logs without interleaving or tearing.
   - **Features:** Supports `INFO`, `WARN`, and `ERROR` log levels, appending timestamps automatically.

5. **Utilities (`utils.h` / `utils.c`)**
   - **Responsibility:** Helper functions for string parsing and time formatting. Includes `utils_trim_whitespace` for clean CLI input and `utils_parse_pid` for safe string-to-integer conversion.

## Module Interactions (The Lifecycle)

1. **Boot:** `main.c` executes. It sequentially initializes the Logger, Process Manager, Scheduler, and Shell.
2. **Backgrounding:** `main.c` calls `scheduler_start()`, which spins up the background `pthread`.
3. **Execution:** `main.c` calls `shell_run()`. The main thread is now blocked waiting for user input.
4. **Command Dispatch:** When a user types `start A`, the Shell parses it and calls `process_create("A")`. The Process Manager acquires the `pt_mutex`, creates the PCB, sets state to `RUNNING`, unlocks the mutex, and logs the event.
5. **Simulation Tick:** In the background, the Scheduler wakes up, grabs a pointer to the process table, sees process "A" is `RUNNING`, and increments its `cpu_time`.
6. **Shutdown:** When the user types `exit`, `shell_run()` returns. `main.c` gracefully calls `scheduler_stop()` (which joins the thread) and `logger_close()`.

## Process Lifecycle Details

A process in RedTerminal follows a strict state machine:
- **Creation:** A process always begins in `PROCESS_STATE_RUNNING` when created via `start`.
- **Pausing:** Calling `pause <pid>` transitions a `RUNNING` process to `PROCESS_STATE_STOPPED`. The scheduler stops incrementing its `cpu_time`.
- **Resuming:** Calling `resume <pid>` transitions a `STOPPED` process back to `PROCESS_STATE_RUNNING`.
- **Termination:** Calling `kill <pid>` on a `RUNNING` or `STOPPED` process transitions it to `PROCESS_STATE_TERMINATED`. Terminated processes remain in the process table as "zombies" for historical tracking but receive no CPU time and cannot be restarted.
