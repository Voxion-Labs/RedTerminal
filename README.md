<p align="center">
  <img src="docs/assets/logo.png" alt="RedTerminal logo" width="130" />
</p>
<p align="center">
  A systems-level C executable engineered for process lifecycle management and simulated CPU scheduling.
</p>
<p align="center">
  <a href="https://voxion-labs.github.io/RedTerminal/">Live Terminal</a>
  |
  <a href="https://github.com/Voxion-Labs/RedTerminal/issues">Telemetry and Issues</a>
</p>

---

## Overview

RedTerminal is a dual-surface systems environment providing isolated process management and high-throughput byte manipulation. It implements two operational modes:

1. **Native POSIX Subsystem:** A compiled C11 binary providing multithreaded process scheduling (`pthreads`), thread-safe asynchronous logging, process control block (PCB) tracking, and a command-line REPL.
2. **WebAssembly / Go Subsystem:** C modules compiled to WebAssembly via Emscripten (`redterm.wasm`), served by a Go standard library HTTP backend (`main.go`), and operated through a zero-dependency vanilla JavaScript terminal emulator with HTMX health polling.

---

## Repository Structure

```text
RedTerminal/
├── Makefile                # Unified build system (native C + Emscripten WASM)
├── go.mod                  # Go module definition (redterminal)
├── main.go                 # Standard library HTTP static file & ping server (:8080)
├── demo/                   # Technical reference specifications
│   ├── architecture.md     # Memory model, thread layout, and lifecycle spec
│   └── commands.md         # Comprehensive CLI and WASM command index
├── include/                # Public C header contracts
│   ├── crypto.h            # RFC 4648 Base64 & FIPS 180-4 SHA-256 exports
│   ├── filter.h            # Fast pointer-arithmetic line filtering
│   ├── logger.h            # Mutex-locked asynchronous event logging
│   ├── process.h           # PCB data structures and state transitions
│   ├── scheduler.h         # Background POSIX thread CPU allocator
│   ├── shell.h             # Native interactive REPL interface
│   ├── utils.h             # General utility and WASM memory handoff
│   └── validator.h         # Single-pass AST-free JSON syntax validator
├── src/                    # C11 module implementations
│   ├── crypto.c            # Pure C cryptographic routines
│   ├── filter.c            # Raw pointer scan log extraction
│   ├── logger.c            # Thread-safe log dispatch
│   ├── main.c              # Native CLI entrypoint and shutdown sequence
│   ├── process.c           # Static PCB allocation and table mutation
│   ├── scheduler.c         # Background CPU tick thread
│   ├── shell.c             # Native command dispatch loop
│   ├── utils.c             # String sanitisation and time formatting
│   └── validator.c         # High-speed bracket/brace/quote syntax parser
├── public/                 # Web interface assets
│   ├── app.js              # Vanilla JS terminal emulator & WASM bridge
│   └── index.html          # Dark developer theme & HTMX 30s status polling
├── docs/                   # GitHub Pages static documentation build
└── tests/                  # Automated assertion-based test suites
    ├── test_crypto.c       # Verification of Base64 and SHA-256 vectors
    ├── test_filter.c       # Boundary tests for pointer line filter
    ├── test_logger.c       # Concurrent log write verification
    ├── test_process.c      # Process transition state assertions
    ├── test_scheduler.c    # Timer and tick increment validation
    └── test_validator.c    # Single-pass JSON syntax edge case suite
```

---

## Technical Specifications

### Architecture Matrix

| Subsystem | Source Path | Target Surface | Key Primitives | Memory / Threading Model |
| :--- | :--- | :--- | :--- | :--- |
| **Process Manager** | `src/process.c` | Native | `pcb_t`, `process_table` | Static table (256 PCBs), mutex-synchronized (`pt_mutex`). |
| **Scheduler** | `src/scheduler.c` | Native | `pthread_create`, `sleep` | Dedicated POSIX worker thread, increments `cpu_time` of `RUNNING` tasks. |
| **Logger** | `src/logger.c` | Native | `vfprintf`, `pthread_mutex` | File-backed stream (`redterm.log`) protected by `log_mutex`. |
| **Log Filter** | `src/filter.c` | WASM / Native | Raw pointer increments | Single-pass $O(N)$ string scan; upper-bounded single heap allocation. |
| **Crypto Engine** | `src/crypto.c` | WASM / Native | Bitwise rotation, arrays | 32-bit word transforms; zero third-party dependencies; FIPS 180-4 compliant. |
| **JSON Validator** | `src/validator.c` | WASM / Native | Stack-based bracket match | Single-pass $O(N)$ syntax parser; returns line-level syntax error offsets without AST. |
| **Web Server** | `main.go` | Host | `net/http` | Standard library file server and health endpoint (`/ping`) on port 8080. |
| **Terminal Client** | `public/app.js` | Browser | Native DOM, `FileReader` | Zero-dependency event loop; Emscripten linear memory bridge (`HEAPU8`). |

---

## Execution Surfaces

### 1. Native POSIX CLI

The native application compiles with any standard C11 compiler and requires only POSIX thread support. It executes an interactive REPL while allocating CPU runtime in a background scheduler thread.

```text
[Main Thread]  fgets() ----> Command Parser ----> Mutex Lock ----> Update PCB ----> Mutex Unlock
                                                                        ^
[Worker Thread] Sleep(1s) ---------------------------------------------> Poll & Increment cpu_time
```

### 2. WebAssembly Client-Server

The browser deployment pairs a Go HTTP server with an Emscripten-compiled WebAssembly runtime:

```text
Browser Client (public/index.html + app.js)
  │
  ├── [HTMX Polling] ───────── GET /ping (every 30s) ────────> Go HTTP Server (main.go)
  │                                                                 │
  │                                                            Returns "pong"
  │
  └── [Terminal Commands] ────> WASM Memory Bridge (HEAPU8)
                                    │
                                    ├── Module._malloc(byte_size)
                                    ├── Copy ArrayBuffer payload
                                    ├── Execute C function (filter_logs, sha256_hash, etc.)
                                    ├── Extract pointer / convert to Blob
                                    └── Module._free(ptr)
```

---

## WebAssembly Exported Function Interface

The following C functions are exported through the Emscripten runtime:

| Exported C Symbol | Parameters | Return Type | Semantics |
| :--- | :--- | :--- | :--- |
| `process_data` | `uint8_t *data, int size` | `uint8_t*` | Returns input pointer to confirm memory buffer handoff integrity. |
| `filter_logs` | `char *input, char *keyword` | `char*` | Extracts matching lines via pointer arithmetic; returns dynamically allocated buffer. |
| `base64_encode` | `const char *input` | `char*` | Encodes input string using RFC 4648 Base64; returns null-terminated string. |
| `base64_decode` | `const char *input` | `char*` | Decodes Base64 string; ignores whitespace; returns null-terminated string. |
| `sha256_hash` | `const char *input` | `char*` | Computes standard 256-bit message digest; returns 64-character lowercase hex string. |
| `validate_json` | `char *payload` | `int` | Single-pass structural validator; returns `0` if valid, or 1-based error line number. |

---

## Command Reference

| Command | Environment | Description | Syntax |
| :--- | :--- | :--- | :--- |
| `start` | Native | Allocate a new process in the PCB table | `start <name>` |
| `kill` | Native | Terminate an active or suspended process | `kill <pid>` |
| `pause` | Native | Suspend CPU time allocation | `pause <pid>` |
| `resume` | Native | Resume CPU time allocation | `resume <pid>` |
| `ps` | Native / Web | Display active Process Control Block records | `ps` |
| `logs` | Native | Dump internal system events from disk | `logs` |
| `upload` | Web | Ingest file into WASM memory & trigger processed download | `upload` |
| `filter` | Web | Filter log lines containing a keyword via WASM pointer scan | `filter <keyword>` |
| `b64` | Web | Encode or decode string via WASM Base64 engine | `b64 [-e\|-d] <text>` |
| `hash` | Web | Compute SHA-256 hash digest via WASM | `hash <text>` |
| `check` | Web | Validate JSON bracket, brace, and quote syntax via WASM | `check <json>` |
| `echo` | Web | Print arguments to output stream | `echo [text]` |
| `ping` | Web | Measure local shell execution latency | `ping` |
| `clear` | Web | Flush terminal viewport | `clear` |
| `info` | Web | Output system architecture specifications | `info` |
| `help` | Native / Web | Display command index | `help` |
| `exit` | Native | Terminate scheduler thread and close application | `exit` |

---

## Build and Execution

### Prerequisites

- GCC (supporting `-std=c11` and `-pthread`)
- GNU Make
- Go 1.20+ (for backend HTTP execution)
- Emscripten SDK (`emcc`, for WebAssembly compilation)

### Build Directives

#### 1. Compile Native Binary
```bash
make
```
Produces the `redterm` native executable at the project root.

#### 2. Execute Test Suites
```bash
make test
```
Compiles and executes test binaries in `tests/`, validating process lifecycles, thread safety, cryptography, and syntax validation.

#### 3. Compile WebAssembly Module
```bash
make build-wasm
```
Compiles `src/*.c` using `emcc` into `public/redterm.js` and `public/redterm.wasm` with exported memory functions.

#### 4. Run Web Application
```bash
make run
```
Builds the WebAssembly artifacts and starts the Go HTTP server on `http://localhost:8080`.

#### 5. Clean Artifacts
```bash
make clean
```
Removes compiled object files, native executables, test binaries, and WebAssembly build artifacts.

---

## License

RedTerminal operates under the MIT License.

The full license text is available in the [LICENSE](LICENSE) directive.

---
<div align="center">
  (c) 2026 Voxion Labs & Rudranarayan Jena
</div>
<p align="center">
  Zero-Backend · CRDT Edge Cookies · C
</p>
