<p align="center">
  <img src="demo/logo.png" alt="RedTerminal Logo" width="130" />
</p>
<h1 align="center">RedTerminal</h1>
<p align="center">
  A high-performance C-dominant security analysis, data crunching, and WebAssembly execution workstation operating directly in the browser and as a toggleable Manifest V3 overlay extension.
</p>
<p align="center">
  <a href="https://voxion-labs.github.io/RedTerminal/">Live Terminal</a>
  |
  <a href="https://github.com/Voxion-Labs/RedTerminal/issues">Telemetry and Issues</a>
</p>

---

## Overview

RedTerminal is a client-isolated systems workstation and execution environment. Built around a **strictly C-dominant execution architecture**, JavaScript is restricted to a "dumb pipe" for I/O and display, while all intensive compute, raw memory transformations, and parsing occur inside pure C11 compiled to WebAssembly (WASM).

### Core Pillars

1. **Zero-Trust Secret & Vulnerability Scanner (`scan`):** Pure C pointer arithmetic engine utilizing a sliding window and Shannon entropy analysis ($H = -\sum p \log_2 p$) to detect exposed AWS IAM keys, Stripe secret keys, GitHub tokens, Slack credentials, private keys, and high-entropy secrets in text and live DOM trees.
2. **5MB WASM Memory Chunking (`upload`):** Streams arbitrary gigabyte-scale datasets using the browser's `File.slice()` API in bounded 5MB segments, processing each chunk via `process_chunk` and immediately deallocating via `Module._free()` to guarantee a flat $\le 5\text{MB}$ RAM footprint.
3. **In-Memory CSV-to-SQL Cruncher (`query <sql>`):** Client-side relational SQL execution powered by an isolated, precompiled `sqlite3.wasm` drop-in. Requires zero npm packages, zero host SQL database servers, and zero disk writes. The entire database resides in WebAssembly `:memory:` and vanishes completely when the tab closes.
4. **C-Powered DOM Extraction (`extract-tables`, `nuke-ads`, `extract <tag>`):** Parses raw HTML strings directly in C memory using pointer arithmetic, extracting tables to RFC 4180 CSV strings and purging ad/tracking scripts with zero JS DOM-query overhead.
5. **CORS Scraping Proxy & Piped Processing (`fetch <url> | filter <kw>` / `fetch <url> | scan`):** A lightweight Go backend streams raw external web pages directly to WASM memory for instant keyword extraction or credential audits.
6. **Native POSIX Subsystem:** A compiled C11 multi-threaded CLI (`redterm`) providing process scheduling (`pthreads`), process control block (PCB) tracking, and mutex-locked asynchronous logging.

---

## Technical Specifications

### Architecture Matrix

| Subsystem | Source Path | Target Surface | Key Primitives | Memory / Execution Model |
| :--- | :--- | :--- | :--- | :--- |
| **Zero-Trust Scanner** | `src/scanner.c` | WASM / Native | Raw pointer increments, Shannon entropy | Bounded lookback sliding window; character-frequency entropy; zero regex libraries. |
| **Stream Chunk Processor** | `src/stream.c` | WASM / Native | Pointer traversal, FNV-1a hash | Constant memory overhead; processes 5MB slices; immediate deallocation via `_free()`. |
| **HTML Parser & Extractor** | `src/html_parser.c` | WASM / Native | Pointer bounds, state machine | Extracts tags and formats CSV directly in linear memory; zero DOM traversal. |
| **CSV-to-SQL Cruncher** | `public/sqlite3.wasm` | Browser WASM | SQLite v3.x engine, `:memory:` | Isolated WASM heap; transient in-memory database; vanishes upon tab close. |
| **Log Filter** | `src/filter.c` | WASM / Native | Raw pointer increments, `\n` boundaries | Single-pass $O(N)$ newline-isolated line extraction. |
| **Crypto Engine** | `src/crypto.c` | WASM / Native | Bitwise rotation, arrays | 32-bit word transforms; RFC 4648 Base64 & FIPS 180-4 SHA-256; zero external dependencies. |
| **JSON Validator** | `src/validator.c` | WASM / Native | Stack-based bracket match | Single-pass $O(N)$ syntax parser; returns line-level syntax error offsets without AST. |
| **Process Manager** | `src/process.c` | Native | `pcb_t`, `process_table` | Static table (256 PCBs), mutex-synchronized (`pt_mutex`). |
| **Scheduler** | `src/scheduler.c` | Native | `pthread_create`, `sleep` | Dedicated POSIX worker thread, increments `cpu_time` of `RUNNING` tasks. |
| **Logger** | `src/logger.c` | Native | `vfprintf`, `pthread_mutex` | File-backed stream (`redterm.log`) protected by `log_mutex`. |
| **Web & Proxy Server** | `main.go` | Host | `net/http`, standard library | Standard library static file server (`:8080`), `/ping` health endpoint, and `/proxy?url=` CORS bypass. |
| **Terminal Client** | `public/app.js` | Browser / Extension | Native DOM, `File.slice()` | Dumb-pipe I/O layer, Emscripten linear memory bridge (`HEAPU8`), ANSI rendering. |

---

## Execution Surfaces

### 1. WebAssembly Client & Extension Overlay

RedTerminal deploys as both a standalone web application and a Manifest V3 cross-browser extension overlay (Chromium and Firefox):

```text
Host Web Page / Browser Tab
  │
  ├── [content.js] ────────── Passes document.documentElement.outerHTML ──────┐
  │                                                                           │
  ▼                                                                           ▼
RedTerminal UI (Isolated Shadow DOM / IFrame Container)                 WASM Linear Heap
  │                                                                           │
  ├── [scan] ───────────────── Run sliding window & entropy analysis ─────────┤
  ├── [upload] ─────────────── Stream 5MB slices via File.slice() ────────────┤
  ├── [query <sql>] ────────── Transient in-memory SQLite table (:memory:) ───┤
  ├── [nuke-ads] ───────────── Parse & isolate <script> ad tags in C ─────────┤
  └── [extract-tables] ─────── Convert <table> elements to CSV string in C ───┘
```

### 2. Native POSIX CLI

The native application compiles with any standard C11 compiler and requires only POSIX thread support. It executes an interactive REPL while allocating CPU runtime in a background scheduler thread.

```text
[Main Thread]   fgets() ──> Command Parser ──> Mutex Lock ──> Update PCB ──> Mutex Unlock
                                                                    ^
[Worker Thread] Sleep(1s) ──────────────────────────────────────────┴ Poll & Increment cpu_time
```

---

## WebAssembly Exported Function Interface

The following C functions are exported through the Emscripten runtime:

| Exported C Symbol | Parameters | Return Type | Semantics |
| :--- | :--- | :--- | :--- |
| `scan_secrets` | `char *text` | `char*` | Sliding window zero-trust scanner; detects credential prefixes & high entropy; returns report. |
| `process_chunk` | `char *buffer, size_t size` | `int` | Ingests a 5MB memory slice using pointer arithmetic, updating running metrics & checksum. |
| `stream_reset` | `void` | `void` | Resets running stream byte counters, chunk metrics, and rolling FNV-1a checksum. |
| `stream_get_total_bytes` | `void` | `size_t` | Returns total bytes processed across stream chunks. |
| `extract_page_data` | `char *raw_html, char *target_tag` | `char*` | Extracts matching tag blocks via pointer scanning without DOM parsing APIs. |
| `extract_tables_csv` | `char *raw_html` | `char*` | Traverses table elements using pure C pointer arithmetic and serializes to CSV format. |
| `filter_logs` | `const char *input, const char *keyword` | `char*` | Extracts lines containing keyword bounded strictly by newline boundaries. |
| `base64_encode` | `const char *input` | `char*` | Encodes input string using RFC 4648 Base64; returns null-terminated string. |
| `base64_decode` | `const char *input` | `char*` | Decodes Base64 string; ignores whitespace; returns null-terminated string. |
| `sha256_hash` | `const char *input` | `char*` | Computes standard 256-bit message digest; returns 64-character lowercase hex string. |
| `validate_json` | `char *payload` | `int` | Single-pass structural validator; returns `0` if valid, or 1-based error line number. |

---

## Command Reference

| Command | Environment | Description | Syntax |
| :--- | :--- | :--- | :--- |
| `scan` | Web / Extension | Zero-Trust secret & high-entropy credential scanner (C engine) | `scan [text]` |
| `query` | Web | Executes SQL on uploaded CSV via ephemeral in-memory SQLite-WASM | `query <sql_query>` |
| `upload` | Web | Streams massive files in 5MB slices to WASM memory chunker | `upload` |
| `extract <tag>` | Web / Extension | Parse and extract specific tag blocks via pure C WASM engine | `extract <tag>` |
| `extract-tables` | Web / Extension | Extract all `<table>` elements into CSV via C WASM engine | `extract-tables` |
| `nuke-ads` | Web / Extension | Scan and extract ad/tracking script blocks via C WASM engine | `nuke-ads` |
| `fetch <url> \| filter <kw>` | Web | Scrapes URL via Go CORS proxy and filters matching lines via WASM | `fetch <url> \| filter <kw>` |
| `fetch <url> \| scan` | Web | Scrapes URL via Go CORS proxy and audits content for credentials | `fetch <url> \| scan` |
| `filter` | Web | Filter log lines containing a keyword via WASM pointer scan | `filter <keyword>` |
| `b64` | Web | Encode or decode string via WASM Base64 engine | `b64 [-e\|-d] <text>` |
| `hash` | Web | Compute SHA-256 hash digest via WASM | `hash <text>` |
| `check` | Web | Validate JSON bracket, brace, and quote syntax via WASM | `check <json>` |
| `start` | Native | Allocate a new process in the PCB table | `start <name>` |
| `kill` | Native | Terminate an active or suspended process | `kill <pid>` |
| `pause` | Native | Suspend CPU time allocation | `pause <pid>` |
| `resume` | Native | Resume CPU time allocation | `resume <pid>` |
| `ps` | Native / Web | Display active Process Control Block records | `ps` |
| `logs` | Native | Dump internal system events from disk | `logs` |
| `echo` | Web | Print arguments to terminal buffer | `echo [text]` |
| `ping` | Web | Measure local execution latency | `ping` |
| `clear` | Web | Flush terminal viewport | `clear` |
| `info` | Web | Output system architecture specifications | `info` |
| `help` | Native / Web | Display available commands | `help` |
| `exit` | Native | Terminate scheduler thread and close application | `exit` |

---

## Build and Execution

### Prerequisites

- GCC (supporting `-std=c11` and `-pthread`)
- GNU Make
- Go 1.20+ (for backend HTTP execution)
- Emscripten SDK (`emcc`, for compiling C modules to WebAssembly)

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
Compiles and executes test binaries in `tests/`, validating process lifecycles, thread safety, cryptography, syntax validation, stream chunking, and secret scanning.

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
  Zero-Backend · CRDT Edge Cookies · C · WebAssembly
</p>
