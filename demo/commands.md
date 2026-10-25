# RedTerminal Command Reference

This document defines the complete command surface for RedTerminal across its native POSIX shell and WebAssembly browser terminal interface.

---

## Command Matrix Summary

| Command | Execution Surface | Purpose | Input Arguments |
| :--- | :--- | :--- | :--- |
| `start` | Native | Spawns a new process entry in the PCB table. | `<name>` (string, max 31 chars) |
| `kill` | Native | Terminates an active or stopped process. | `<pid>` (integer) |
| `pause` | Native | Suspends process execution; freezes CPU time counter. | `<pid>` (integer) |
| `resume` | Native | Restores suspended process to active execution. | `<pid>` (integer) |
| `ps` | Native / Web | Dumps active Process Control Block records. | None |
| `logs` | Native | Streams raw events from `redterm.log`. | None |
| `fetch <url> \| filter <kw>` | Web | Scrapes URL via Go CORS proxy and extracts matching lines via WASM log filter. | `<url>` and `<keyword>` |
| `query` | Web | Executes SQL against an in-memory CSV temporary table via SQLite-WASM. | `<sql_query>` (string) |
| `upload` | Web | Ingests CSV to in-memory SQLite table or binary to WASM memory via `_malloc`. | None (triggers file picker dialog) |
| `filter` | Web | Performs pointer-based substring extraction on log lines via WASM. | `<keyword>` (string) |
| `b64` | Web | Encodes or decodes text via RFC 4648 Base64 WASM engine. | `[-e\|-d] <text>` (flag and string) |
| `hash` | Web | Generates a 64-character lowercase SHA-256 hex digest via WASM. | `<text>` (string) |
| `check` | Web | Performs $O(N)$ single-pass bracket/brace/quote syntax validation. | `<json_string>` (string) |
| `echo` | Web | Outputs argument string directly to terminal buffer. | `[text]` (string) |
| `ping` | Web | Verifies terminal I/O latency. | None |
| `info` | Web | Displays runtime architecture and active subsystem specifications. | None |
| `clear` | Web | Flushes terminal display buffer. | None |
| `help` | Native / Web | Prints command index and argument syntax. | None |
| `exit` | Native | Joins scheduler thread, closes file handles, and halts binary. | None |

---

## Detailed Command Specifications

### Process Management Commands (Native Interface)

#### `start <name>`
- **Syntax:** `start <name>`
- **Description:** Allocates a Process Control Block within the static table.
- **Parameters:**
  - `<name>`: Alphanumeric process identifier (maximum length: 31 bytes).
- **Semantics:**
  - Assigns monotonically increasing integer PID starting at 1.
  - Initialises process state to `PROCESS_STATE_RUNNING`.
  - Initialises `cpu_time` to 0.
  - Returns error if process table is full (maximum: 256 entries).

#### `kill <pid>`
- **Syntax:** `kill <pid>`
- **Description:** Terminates execution of a target process.
- **Parameters:**
  - `<pid>`: Target Process ID.
- **Semantics:**
  - Sets target PCB state to `PROCESS_STATE_TERMINATED`.
  - Halts all further CPU time accumulation.
  - Returns error if `<pid>` does not exist.
  - Returns warning if `<pid>` is already terminated.

#### `pause <pid>`
- **Syntax:** `pause <pid>`
- **Description:** Suspends CPU time allocation for a running process.
- **Parameters:**
  - `<pid>`: Target Process ID.
- **Semantics:**
  - Transitions target process from `PROCESS_STATE_RUNNING` to `PROCESS_STATE_STOPPED`.
  - Rejects transition if target is not currently in `RUNNING` state.

#### `resume <pid>`
- **Syntax:** `resume <pid>`
- **Description:** Re-enables CPU time accumulation for a suspended process.
- **Parameters:**
  - `<pid>`: Target Process ID.
- **Semantics:**
  - Transitions target process from `PROCESS_STATE_STOPPED` to `PROCESS_STATE_RUNNING`.
  - Rejects transition if target is not currently in `STOPPED` state.

#### `ps`
- **Syntax:** `ps`
- **Description:** Formats and outputs the current snapshot of the process table.
- **Columns:**
  - `PID`: Monotonic process identifier.
  - `NAME`: Allocated process name.
  - `STATE`: Current status (`RUNNING`, `STOPPED`, `TERMINATED`).
  - `CPU_TIME`: Total simulated CPU execution seconds.
  - `CREATED_AT`: System timestamp of process creation.

#### `logs`
- **Syntax:** `logs`
- **Description:** Flushes and outputs historical records from `redterm.log`.
- **Format:** `[YYYY-MM-DD HH:MM:SS] [LEVEL] <message>`

---

### WebAssembly Engine Commands (Web Interface)

#### `query <sql>`
- **Syntax:** `query <sql>`
- **Description:** Executes SQL against client-side in-memory SQLite database populated from uploaded CSV files.
- **Parameters:**
  - `<sql>`: SQLite SQL query string (e.g. `SELECT * FROM temp_table WHERE age > 30 ORDER BY name LIMIT 10`).
- **Semantics:**
  - Connects to in-memory SQLite table (`temp_table`, with aliases `csv_data`, `data`, and `<filename>`).
  - Formats output as an aligned ASCII terminal table.
  - If no CSV table is loaded, automatically opens file picker to load a CSV and executes query upon selection.

#### `fetch <url> | filter <keyword>`
- **Syntax:** `fetch <url> | filter <keyword>`
- **Description:** Scrapes any web URL via the RedTerminal Go CORS proxy and filters matching lines via WASM `filter_logs`.
- **Parameters:**
  - `<url>`: Target URL to fetch raw HTML from.
  - `<keyword>`: Substring term to search for across lines.
- **Semantics:**
  - Performs an HTTP GET request to `/proxy?url=<target>`.
  - Passes received HTML buffer into WASM `filter_logs` bounded strictly by newline boundaries.
  - Outputs matching lines directly to the terminal display.

#### `upload`
- **Syntax:** `upload`
- **Description:** Demonstrates full-duplex WASM memory handoff via hidden DOM file picker.
- **Execution Flow:**
  1. Opens local file picker input.
  2. Reads selected file into `ArrayBuffer`.
  3. Allocates memory inside the WebAssembly heap using `Module._malloc(byte_size)`.
  4. Copies byte stream into `Module.HEAPU8`.
  5. Executes C function `process_data(uint8_t *data, int size)`.
  6. Reads returned memory address from `Module.HEAPU8`, wraps into a `Blob`, and triggers automated browser download.
  7. Deallocates heap space via `Module._free`.

#### `filter <keyword>`
- **Syntax:** `filter <keyword>`
- **Description:** Executes high-throughput pointer arithmetic line extraction via WASM `filter_logs`.
- **Parameters:**
  - `<keyword>`: Substring term to search for across lines.
- **Semantics:**
  - Calls `char* filter_logs(char *input, char *keyword)` compiled from `src/filter.c`.
  - Scans character buffers using raw pointer increments; outputs matching lines directly.

#### `b64 [-e|-d] <text>`
- **Syntax:**
  - `b64 -e <text>` or `b64 encode <text>`: Encodes raw string into RFC 4648 Base64 format.
  - `b64 -d <text>` or `b64 decode <text>`: Decodes Base64 string into plain text.
  - `b64 <text>`: Defaults to encoding.
- **Semantics:**
  - Executes `char* base64_encode(const char *input)` or `char* base64_decode(const char *input)` from `src/crypto.c`.
  - Runs with zero external libraries; returns newly allocated heap string.

#### `hash <text>`
- **Syntax:** `hash <text>`
- **Description:** Computes a cryptographic SHA-256 digest over the input string.
- **Parameters:**
  - `<text>`: Input message payload.
- **Semantics:**
  - Executes `char* sha256_hash(const char *input)` from `src/crypto.c`.
  - Implements standard 512-bit block compression; outputs 64-character lowercase hex digest.

#### `check <json_string>`
- **Syntax:** `check <json_string>`
- **Description:** Executes high-speed AST-free structural syntax validation on JSON payloads.
- **Parameters:**
  - `<json_string>`: Raw JSON payload to parse.
- **Semantics:**
  - Invokes `int validate_json(char *payload)` from `src/validator.c`.
  - Evaluates matching brackets (`[]`), braces (`{}`), and string literal quotes (`""`).
  - Output values:
    - `0`: Valid syntax.
    - `> 0`: 1-based line number of the first encountered syntax failure.

#### `clear`
- **Syntax:** `clear`
- **Description:** Resets terminal output container and scrolls viewport to origin.

#### `exit`
- **Syntax:** `exit`
- **Description:** Halts native runtime loop, signals background scheduler shutdown, joins POSIX thread, closes log file descriptors, and terminates with status code `0`.
