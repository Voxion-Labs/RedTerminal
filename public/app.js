/**
 * RedTerminal - Vanilla JS Terminal Emulator
 * Zero-dependency interactive terminal with Emscripten WASM Module integration.
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

// Fallback allocator in case Emscripten runtime is still loading or running standalone
let mockMemoryBuffer = null;
let mockHeapOffset = 4096;
function ensureWasmMemory() {
    if (!Module.HEAPU8) {
        if (!mockMemoryBuffer) {
            mockMemoryBuffer = new ArrayBuffer(16 * 1024 * 1024); // 16MB mock WASM linear memory
        }
        Module.HEAPU8 = new Uint8Array(mockMemoryBuffer);
    }
    if (typeof Module._malloc !== 'function') {
        Module._malloc = function(size) {
            const ptr = mockHeapOffset;
            mockHeapOffset += (size + 15) & ~15; // 16-byte alignment
            if (mockHeapOffset > Module.HEAPU8.length) {
                mockHeapOffset = 4096;
            }
            return ptr;
        };
    }
    if (typeof Module._free !== 'function') {
        Module._free = function() {};
    }
    if (typeof Module._process_data !== 'function') {
        Module._process_data = function(ptr) {
            // Mock implementation: returns input pointer
            return ptr;
        };
    }
    if (typeof Module._filter_logs !== 'function') {
        Module._filter_logs = function(inPtr) {
            return inPtr;
        };
    }
    if (typeof Module._validate_json !== 'function') {
        Module._validate_json = function() {
            return 0;
        };
    }
    if (typeof Module.UTF8ToString !== 'function') {
        Module.UTF8ToString = function(ptr) {
            if (!ptr || !Module.HEAPU8) return '';
            let str = '';
            let p = ptr;
            while (p < Module.HEAPU8.length && Module.HEAPU8[p] !== 0) {
                str += String.fromCharCode(Module.HEAPU8[p]);
                p++;
            }
            try {
                return decodeURIComponent(escape(str));
            } catch (e) {
                return str;
            }
        };
    }
}

/**
 * Fallback single-pass JSON validator when WASM binary is not loaded.
 */
function validateJsonFallback(payload) {
    if (!payload || !payload.trim()) return 1;
    let line = 1;
    const charStack = [];
    const lineStack = [];
    let inString = false;
    let stringStartLine = 1;

    for (let i = 0; i < payload.length; i++) {
        const c = payload[i];
        if (c === '\n') {
            line++;
            continue;
        }
        if (inString) {
            if (c === '\\') {
                i++;
                if (i < payload.length && payload[i] === '\n') line++;
                continue;
            }
            if (c === '"') {
                inString = false;
            }
            continue;
        }
        if (c === '"') {
            inString = true;
            stringStartLine = line;
        } else if (c === '{') {
            charStack.push('}');
            lineStack.push(line);
        } else if (c === '[') {
            charStack.push(']');
            lineStack.push(line);
        } else if (c === '}' || c === ']') {
            if (charStack.length === 0 || charStack.pop() !== c) {
                return line;
            }
            lineStack.pop();
        }
    }
    if (inString) return stringStartLine;
    if (charStack.length > 0) return lineStack.pop();
    return 0;
}

/**
 * Reads data from a WASM memory pointer, converts to Blob, and triggers browser file download.
 *
 * @param {number} ptr - Pointer address in WASM linear memory
 * @param {number} size - Number of bytes to read
 * @param {string} filename - Target file name for download
 * @param {string} [mimeType='application/octet-stream'] - MIME type for the Blob
 */
function downloadWasmOutput(ptr, size, filename = 'processed_output.bin', mimeType = 'application/octet-stream') {
    if (!ptr || size <= 0) {
        termPrint('ERR: Invalid WASM output pointer or size.', 'error');
        return;
    }

    ensureWasmMemory();

    // Read WASM memory slice from Emscripten HEAPU8
    const outputBytes = Module.HEAPU8.subarray(ptr, ptr + size);

    // Copy to an independent Uint8Array so it is detached from WASM heap
    const copiedBuffer = new Uint8Array(outputBytes);

    // Convert to Blob
    const blob = new Blob([copiedBuffer], { type: mimeType });

    // Trigger automatic browser file download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Opens a hidden file picker input and fires callback when a file is selected.
 *
 * @param {Function} onFileSelected - Callback receiving the selected File object
 * @param {string} [accept=''] - Optional MIME/extension filter
 */
function openHiddenFilePicker(onFileSelected, accept = '') {
    let picker = document.getElementById('hidden-file-picker');
    if (!picker) {
        picker = document.createElement('input');
        picker.type = 'file';
        picker.id = 'hidden-file-picker';
        picker.style.display = 'none';
        document.body.appendChild(picker);
    }
    picker.accept = accept;
    picker.value = '';
    picker.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            onFileSelected(file);
        }
    };
    picker.click();
}

// ==========================================
// SQLite-WASM & CSV In-Memory Database Engine
// ==========================================

let sqlite3Instance = null;
let activeSqliteDb = null;
let activeDbMetadata = null;

/**
 * Fallback in-memory SQL database for offline / isolated environments.
 */
class FallbackSqliteDb {
    constructor() {
        this.tables = {};
        this.isFallback = true;
    }

    exec(options) {
        const sql = (typeof options === 'string' ? options : options.sql || '').trim();
        if (!sql) return;

        const callback = typeof options === 'object' && typeof options.callback === 'function' ? options.callback : null;
        const columnNames = typeof options === 'object' && Array.isArray(options.columnNames) ? options.columnNames : null;

        const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
            // Ignore transaction control
            if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(stmt)) continue;

            // DROP TABLE
            const dropMatch = stmt.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?([a-zA-Z0-9_]+)["`]?/i);
            if (dropMatch) {
                delete this.tables[dropMatch[1].toLowerCase()];
                continue;
            }

            // CREATE TABLE
            const createMatch = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z0-9_]+)["`]?\s*\((.*)\)/is);
            if (createMatch) {
                const tblName = createMatch[1].toLowerCase();
                const colsDef = createMatch[2].split(',').map(c => {
                    const p = c.trim().split(/\s+/);
                    return p[0].replace(/["`]/g, '').toLowerCase();
                });
                this.tables[tblName] = { columns: colsDef, rows: [] };
                continue;
            }

            // CREATE VIEW
            const viewMatch = stmt.match(/CREATE\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z0-9_]+)["`]?\s+AS\s+SELECT\s+\*\s+FROM\s+["`]?([a-zA-Z0-9_]+)["`]?/is);
            if (viewMatch) {
                const alias = viewMatch[1].toLowerCase();
                const target = viewMatch[2].toLowerCase();
                if (this.tables[target]) {
                    this.tables[alias] = this.tables[target];
                }
                continue;
            }

            // INSERT INTO
            const insertMatch = stmt.match(/INSERT\s+INTO\s+["`]?([a-zA-Z0-9_]+)["`]?\s*(?:\([^)]*\))?\s*VALUES\s*\((.*)\)/is);
            if (insertMatch) {
                const tblName = insertMatch[1].toLowerCase();
                const tbl = this.tables[tblName];
                if (tbl) {
                    const rawVals = insertMatch[2].split(',').map(v => {
                        v = v.trim();
                        if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
                            return v.slice(1, -1).replace(/''/g, "'");
                        }
                        if (v.toLowerCase() === 'null') return null;
                        const num = Number(v);
                        return isNaN(num) ? v : num;
                    });
                    tbl.rows.push(rawVals);
                }
                continue;
            }

            // SELECT
            if (/^SELECT/i.test(stmt)) {
                const fromMatch = stmt.match(/FROM\s+["`]?([a-zA-Z0-9_]+)["`]?/i);
                const tblName = fromMatch ? fromMatch[1].toLowerCase() : Object.keys(this.tables)[0];
                const tbl = this.tables[tblName] || { columns: ['col'], rows: [] };

                let selectedCols = tbl.columns;
                const selectColsMatch = stmt.match(/SELECT\s+(.*?)\s+FROM/is);
                if (selectColsMatch && selectColsMatch[1].trim() !== '*') {
                    const colsRaw = selectColsMatch[1].split(',').map(c => c.trim().replace(/["`]/g, '').toLowerCase());
                    if (colsRaw.length === 1 && /^count\s*\(\s*\*\s*\)/i.test(colsRaw[0])) {
                        if (columnNames) columnNames.push('count(*)');
                        if (callback) callback([tbl.rows.length]);
                        return;
                    }
                    selectedCols = colsRaw;
                }

                if (columnNames) {
                    for (const col of selectedCols) {
                        columnNames.push(col);
                    }
                }

                const colIndices = selectedCols.map(c => tbl.columns.indexOf(c));
                let resRows = tbl.rows.slice();

                // WHERE
                const whereMatch = stmt.match(/WHERE\s+(.*?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/is);
                if (whereMatch) {
                    const cond = whereMatch[1].trim();
                    const m = cond.match(/["`]?([a-zA-Z0-9_]+)["`]?\s*(=|!=|>|<|>=|<=|LIKE)\s*(.*)/i);
                    if (m) {
                        const colName = m[1].toLowerCase();
                        const op = m[2].toUpperCase();
                        let targetVal = m[3].trim().replace(/^['"]|['"]$/g, '');
                        const colIdx = tbl.columns.indexOf(colName);
                        if (colIdx !== -1) {
                            resRows = resRows.filter(r => {
                                const v = r[colIdx];
                                if (op === '=') return String(v).toLowerCase() === targetVal.toLowerCase();
                                if (op === '!=') return String(v).toLowerCase() !== targetVal.toLowerCase();
                                if (op === '>') return Number(v) > Number(targetVal);
                                if (op === '<') return Number(v) < Number(targetVal);
                                if (op === '>=') return Number(v) >= Number(targetVal);
                                if (op === '<=') return Number(v) <= Number(targetVal);
                                if (op === 'LIKE') {
                                    const reg = new RegExp('^' + targetVal.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
                                    return reg.test(String(v));
                                }
                                return true;
                            });
                        }
                    }
                }

                // ORDER BY
                const orderMatch = stmt.match(/ORDER\s+BY\s+["`]?([a-zA-Z0-9_]+)["`]?(?:\s+(ASC|DESC))?/i);
                if (orderMatch) {
                    const colName = orderMatch[1].toLowerCase();
                    const isDesc = (orderMatch[2] || '').toUpperCase() === 'DESC';
                    const colIdx = tbl.columns.indexOf(colName);
                    if (colIdx !== -1) {
                        resRows.sort((a, b) => {
                            const valA = a[colIdx];
                            const valB = b[colIdx];
                            const cmp = valA < valB ? -1 : (valA > valB ? 1 : 0);
                            return isDesc ? -cmp : cmp;
                        });
                    }
                }

                // LIMIT
                const limitMatch = stmt.match(/LIMIT\s+(\d+)/i);
                if (limitMatch) {
                    const lim = parseInt(limitMatch[1], 10);
                    resRows = resRows.slice(0, lim);
                }

                for (const r of resRows) {
                    const projRow = colIndices.map(idx => (idx !== -1 ? r[idx] : null));
                    if (callback) callback(projRow);
                }
            }
        }
    }

    close() {
        this.tables = {};
    }
}

/**
 * Initializes SQLite-WASM from official CDN or falls back to in-memory SQL engine.
 */
async function initSqliteWasm() {
    if (sqlite3Instance) return sqlite3Instance;
    if (window.sqlite3) {
        sqlite3Instance = window.sqlite3;
        return sqlite3Instance;
    }

    try {
        termPrint('Initializing SQLite-WASM subsystem...', 'dim');
        let initFn = window.sqlite3InitModule;
        if (!initFn) {
            const cdnUrls = [
                'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs',
                'https://unpkg.com/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs'
            ];
            for (const url of cdnUrls) {
                try {
                    const mod = await import(url);
                    initFn = mod.default || mod;
                    if (initFn) break;
                } catch (e) {
                    console.warn(`Failed loading from ${url}:`, e);
                }
            }
        }

        if (typeof initFn === 'function') {
            sqlite3Instance = await initFn({
                print: (msg) => console.log('[sqlite3]', msg),
                printErr: (msg) => console.error('[sqlite3]', msg)
            });
            window.sqlite3 = sqlite3Instance;
            termPrint(`SQLite-WASM core ready (v${sqlite3Instance.version ? sqlite3Instance.version.libVersion : '3.x'}).`, 'success');
            return sqlite3Instance;
        }
    } catch (err) {
        console.warn('SQLite-WASM initialization failed, using in-memory engine fallback:', err);
    }

    termPrint('SQLite-WASM running with local in-memory SQL fallback engine.', 'dim');
    return null;
}

/**
 * Parses CSV text compliant with RFC 4180.
 *
 * @param {string} text - Raw CSV content
 * @returns {Array<Array<string>>} Array of row arrays
 */
function parseCSV(text) {
    const lines = [];
    let row = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i += 2;
                continue;
            } else {
                inQuotes = !inQuotes;
                i++;
                continue;
            }
        }

        if (!inQuotes) {
            if (char === ',') {
                row.push(current.trim());
                current = '';
                i++;
                continue;
            }
            if (char === '\r') {
                if (nextChar === '\n') i++;
                row.push(current.trim());
                if (row.some(val => val.length > 0)) lines.push(row);
                row = [];
                current = '';
                i++;
                continue;
            }
            if (char === '\n') {
                row.push(current.trim());
                if (row.some(val => val.length > 0)) lines.push(row);
                row = [];
                current = '';
                i++;
                continue;
            }
        }

        current += char;
        i++;
    }

    if (current.length > 0 || row.length > 0) {
        row.push(current.trim());
        if (row.some(val => val.length > 0)) lines.push(row);
    }

    return lines;
}

/**
 * Formats table rows into clean aligned ASCII terminal lines.
 */
function formatTerminalTable(headers, rows) {
    if (!headers || headers.length === 0) return ['Empty result set (0 columns).'];

    const colWidths = headers.map((h, i) => {
        let maxLen = String(h).length;
        for (const row of rows) {
            const val = row[i];
            const str = val === null || val === undefined ? 'NULL' : String(val);
            if (str.length > maxLen) maxLen = str.length;
        }
        return Math.max(maxLen, 3);
    });

    const headerLine = headers.map((h, i) => String(h).padEnd(colWidths[i])).join(' | ');
    const sepLine = colWidths.map(w => '-'.repeat(w)).join('-+-');

    const lines = [headerLine, sepLine];
    for (const row of rows) {
        const rowLine = headers.map((_, i) => {
            const val = row[i];
            const str = val === null || val === undefined ? 'NULL' : String(val);
            return str.padEnd(colWidths[i]);
        }).join(' | ');
        lines.push(rowLine);
    }
    return lines;
}

/**
 * Automatically creates an in-memory SQLite database, parses the CSV headers and rows,
 * and inserts them into a temporary table ('temp_table').
 *
 * @param {string} csvText - Raw CSV text
 * @param {string} filename - Source filename for labeling
 */
async function loadCSVIntoDatabase(csvText, filename = 'data.csv') {
    termPrint(`Parsing CSV '${filename}'...`, 'dim');
    const parsed = parseCSV(csvText);
    if (!parsed || parsed.length === 0) {
        termPrint('ERR: Uploaded CSV file is empty.', 'error');
        return;
    }

    const rawHeaders = parsed[0];
    const dataRows = parsed.slice(1);

    if (rawHeaders.length === 0) {
        termPrint('ERR: No headers found in CSV.', 'error');
        return;
    }

    // Sanitize headers to clean SQL column identifiers
    const seen = new Set();
    const cleanHeaders = rawHeaders.map((h, idx) => {
        let name = h.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        if (!name || /^[0-9]/.test(name)) name = 'col_' + (name || idx + 1);
        let uniqueName = name;
        let counter = 2;
        while (seen.has(uniqueName)) {
            uniqueName = `${name}_${counter++}`;
        }
        seen.add(uniqueName);
        return uniqueName;
    });

    // Invert/infer column types
    const colTypes = cleanHeaders.map((_, colIdx) => {
        let isInt = true;
        let isReal = true;
        let count = 0;
        for (const r of dataRows) {
            const val = r[colIdx];
            if (val === undefined || val === '') continue;
            count++;
            if (!/^-?\d+$/.test(val)) isInt = false;
            if (!/^-?\d+(\.\d+)?$/.test(val)) isReal = false;
        }
        if (count > 0 && isInt) return 'INTEGER';
        if (count > 0 && isReal) return 'REAL';
        return 'TEXT';
    });

    // Initialize SQLite-WASM or Fallback
    const sqlite = await initSqliteWasm();

    if (activeSqliteDb) {
        try { activeSqliteDb.close(); } catch (_) {}
        activeSqliteDb = null;
    }

    if (sqlite && sqlite.oo1 && sqlite.oo1.DB) {
        activeSqliteDb = new sqlite.oo1.DB(':memory:', 'c');
    } else {
        activeSqliteDb = new FallbackSqliteDb();
    }

    // Build temporary table
    const colDefs = cleanHeaders.map((c, i) => `"${c}" ${colTypes[i]}`).join(', ');
    activeSqliteDb.exec(`DROP TABLE IF EXISTS temp_table;`);
    activeSqliteDb.exec(`CREATE TABLE temp_table (${colDefs});`);

    // Views for convenient alias access
    activeSqliteDb.exec(`CREATE VIEW IF NOT EXISTS csv_data AS SELECT * FROM temp_table;`);
    activeSqliteDb.exec(`CREATE VIEW IF NOT EXISTS data AS SELECT * FROM temp_table;`);
    const sanitizedBase = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (sanitizedBase && sanitizedBase !== 'temp_table') {
        activeSqliteDb.exec(`CREATE VIEW IF NOT EXISTS "${sanitizedBase}" AS SELECT * FROM temp_table;`);
    }

    // Insert rows in batch transaction
    activeSqliteDb.exec('BEGIN TRANSACTION;');
    for (const r of dataRows) {
        const valSql = cleanHeaders.map((_, i) => {
            const v = r[i];
            if (v === undefined || v === null || v === '') return 'NULL';
            if (colTypes[i] === 'INTEGER' || colTypes[i] === 'REAL') {
                if (/^-?\d+(\.\d+)?$/.test(v)) return v;
            }
            return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        activeSqliteDb.exec(`INSERT INTO temp_table VALUES (${valSql});`);
    }
    activeSqliteDb.exec('COMMIT;');

    activeDbMetadata = {
        filename,
        columns: cleanHeaders,
        rowCount: dataRows.length
    };

    termPrint(`In-memory SQLite database initialized successfully.`, 'success');
    termPrint(`Table 'temp_table' created with columns: ${cleanHeaders.join(', ')}`, 'dim');
    termPrint(`Inserted ${dataRows.length} row(s) from '${filename}'.`, 'success');
    termPrint(`Ready! Run 'query <sql>' (e.g. query SELECT * FROM temp_table LIMIT 5)`, 'highlight');
}

/**
 * Executes a user SQL string against the in-memory SQLite temporary table
 * and prints formatted results directly to the terminal UI.
 *
 * @param {string} sql - SQL query string
 */
async function executeSqlQuery(sql) {
    if (!activeSqliteDb) {
        termPrint('No active in-memory CSV table found. Select a CSV file to load and query...', 'dim');
        openHiddenFilePicker((file) => {
            termPrint(`Loading '${file.name}'...`, 'highlight');
            const reader = new FileReader();
            reader.onload = async function(e) {
                await loadCSVIntoDatabase(e.target.result, file.name);
                // Immediately execute query once table is loaded
                await executeSqlQuery(sql);
            };
            reader.readAsText(file);
        }, '.csv,text/csv,.txt');
        return;
    }

    termPrint(`SQL> ${sql}`, 'dim');

    const columns = [];
    const rows = [];
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)/i.test(sql);

    try {
        activeSqliteDb.exec({
            sql: sql,
            columnNames: columns,
            rowMode: 'array',
            callback: (row) => {
                rows.push(row);
            }
        });

        if (isSelect || rows.length > 0 || columns.length > 0) {
            if (rows.length === 0) {
                termPrint('Query executed successfully. (0 rows returned)', 'warning');
            } else {
                const lines = formatTerminalTable(columns, rows);
                for (const line of lines) {
                    termPrint(line);
                }
                termPrint(`(${rows.length} row${rows.length === 1 ? '' : 's'} returned)`, 'success');
            }
        } else {
            termPrint('Query executed successfully.', 'success');
        }
    } catch (err) {
        termPrint(`SQL ERROR: ${err.message}`, 'error');
    }
}

/**
 * Handles 'fetch <url> | filter <keyword>' command pipeline.
 * Hits the Go proxy (/proxy?url=...), passes the raw HTML response to the WASM filter_logs,
 * and prints the extracted matching lines to the terminal.
 *
 * @param {string} cmdStr - Full command string entered by user
 */
async function handleFetchFilterCommand(cmdStr) {
    const pipeIdx = cmdStr.indexOf('|');
    if (pipeIdx === -1) {
        // Standalone fetch command without pipe
        const parts = cmdStr.trim().split(/\s+/);
        const targetUrl = parts.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');
        if (!targetUrl) {
            termPrint('Usage: fetch <url> | filter <keyword>', 'error');
            termPrint('Example: fetch https://example.com | filter title', 'dim');
            return;
        }

        termPrint(`Fetching ${targetUrl} via Go proxy...`, 'dim');
        try {
            const resp = await fetch(`/proxy?url=${encodeURIComponent(targetUrl)}`);
            if (!resp.ok) {
                const errText = await resp.text();
                termPrint(`ERR: Proxy request failed (${resp.status}): ${errText || resp.statusText}`, 'error');
                return;
            }
            const rawHtml = await resp.text();
            const lines = rawHtml.split(/\r?\n/).filter(line => line.length > 0);
            const previewLimit = Math.min(20, lines.length);
            termPrint(`--- Fetched ${lines.length} Line(s) from ${targetUrl} (Showing ${previewLimit}) ---`, 'highlight');
            for (let i = 0; i < previewLimit; i++) {
                termPrint(lines[i]);
            }
            if (lines.length > previewLimit) {
                termPrint(`... [${lines.length - previewLimit} additional line(s) omitted. Use '| filter <keyword>' to filter specific content]`, 'dim');
            }
            termPrint('----------------------------------------------------', 'highlight');
        } catch (err) {
            termPrint(`ERR: Failed to fetch: ${err.message}`, 'error');
        }
        return;
    }

    const fetchPart = cmdStr.substring(0, pipeIdx).trim();
    const filterPart = cmdStr.substring(pipeIdx + 1).trim();

    // Extract URL
    const fetchParts = fetchPart.split(/\s+/);
    const targetUrl = fetchParts.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');
    if (!targetUrl) {
        termPrint('ERR: Missing target URL in fetch command.', 'error');
        termPrint('Usage: fetch <url> | filter <keyword>', 'dim');
        return;
    }

    // Validate pipe destination is 'filter'
    const filterParts = filterPart.split(/\s+/);
    const filterAction = filterParts[0] ? filterParts[0].toLowerCase() : '';
    if (filterAction !== 'filter') {
        termPrint(`ERR: Unsupported pipe destination '${filterAction}'. Expected 'filter'.`, 'error');
        termPrint('Usage: fetch <url> | filter <keyword>', 'dim');
        return;
    }

    const keyword = filterParts.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');
    if (!keyword) {
        termPrint('ERR: Missing keyword for filter.', 'error');
        termPrint('Usage: fetch <url> | filter <keyword>', 'dim');
        return;
    }

    termPrint(`Fetching ${targetUrl} via Go proxy...`, 'dim');
    let rawHtml = '';
    try {
        const resp = await fetch(`/proxy?url=${encodeURIComponent(targetUrl)}`);
        if (!resp.ok) {
            const errText = await resp.text();
            termPrint(`ERR: Proxy request failed (${resp.status}): ${errText || resp.statusText}`, 'error');
            return;
        }
        rawHtml = await resp.text();
    } catch (err) {
        termPrint(`ERR: Network error contacting proxy: ${err.message}`, 'error');
        return;
    }

    termPrint(`Filtering raw HTML for keyword '${keyword}' via WASM...`, 'dim');

    // Pass raw HTML to WASM filter_logs
    let filteredText = '';
    let ptr = 0;
    try {
        if (typeof Module !== 'undefined' && typeof Module.ccall === 'function') {
            ptr = Module.ccall('filter_logs', 'number', ['string', 'string'], [rawHtml, keyword]);
            if (ptr) {
                filteredText = Module.UTF8ToString(ptr);
            }
        } else {
            // Line-by-line fallback strictly enforcing \n boundaries matching filter.c
            if (keyword && !keyword.includes('\n')) {
                const lines = rawHtml.split('\n');
                const matched = lines.filter(line => line.includes(keyword));
                filteredText = matched.length > 0 ? matched.join('\n') + '\n' : '';
            }
        }
    } catch (err) {
        termPrint(`ERR: WASM filtering failed: ${err.message}`, 'error');
        return;
    } finally {
        if (ptr && typeof Module._free === 'function') {
            Module._free(ptr);
            ptr = 0;
        }
    }

    // Print extracted lines to the terminal
    const lines = filteredText ? filteredText.split(/\r?\n/) : [];
    const matchedLines = lines.filter(line => line.length > 0);

    if (matchedLines.length === 0) {
        termPrint(`No lines matching keyword '${keyword}' found in ${targetUrl}.`, 'warning');
    } else {
        termPrint(`--- Extracted Matching Line(s) (Total: ${matchedLines.length}) ---`, 'highlight');
        for (const line of matchedLines) {
            termPrint(line);
        }
        termPrint('----------------------------------------------------', 'highlight');
        termPrint(`Extracted ${matchedLines.length} line(s) matching '${keyword}'.`, 'success');
    }
}

/**
 * Placeholder for executing commands via WASM / Emscripten.
 * Dispatches to Module.ccall if available, or processes placeholder commands.
 *
 * @param {string} cmd - Command string entered by user
 */
async function executeCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Intercept fetch & piped filter commands
    if (trimmed.toLowerCase().startsWith('fetch') || (trimmed.includes('|') && trimmed.toLowerCase().includes('fetch'))) {
        await handleFetchFilterCommand(trimmed);
        return;
    }

    // Check if Emscripten ccall is exported and available for general command handling
    if (typeof Module !== 'undefined' && typeof Module.ccall === 'function') {
        try {
            Module.ccall('execute_command', null, ['string'], [trimmed]);
            return;
        } catch (err) {
            // Fallback to local dispatch
        }
    }

    // Local / WASM Command Dispatch
    const parts = trimmed.split(/\s+/);
    const action = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (action) {
        case 'help':
            termPrint('REDTERM Commands:', 'highlight');
            termPrint('  help            - Display available commands');
            termPrint('  fetch <url> | filter <kw> - Fetch URL via Go proxy & filter lines via WASM');
            termPrint('  query <sql>     - Execute SQL on uploaded CSV via in-memory SQLite-WASM');
            termPrint('  upload          - Upload CSV to in-memory SQLite or binary to WASM memory');
            termPrint('  filter <word>   - Filter uploaded log lines via WASM (preview + download)');
            termPrint('  b64 [-e|-d] <s> - Base64 encode/decode string via WASM');
            termPrint('  hash <text>     - Compute SHA-256 hash digest via WASM');
            termPrint('  check <json>    - High-speed single-pass JSON validator via WASM');
            termPrint('  clear           - Clear terminal screen');
            termPrint('  ping            - Test local shell latency');
            termPrint('  echo [text]     - Print arguments to terminal');
            termPrint('  ps              - Display mock process table');
            termPrint('  info            - Show architecture and runtime info');
            break;

        case 'fetch':
            await handleFetchFilterCommand(trimmed);
            break;

        case 'query': {
            const sqlQuery = args.join(' ').trim();
            if (!sqlQuery) {
                termPrint('Usage: query <sql>', 'error');
                termPrint('Example: query SELECT * FROM temp_table LIMIT 5', 'dim');
                break;
            }
            await executeSqlQuery(sqlQuery);
            break;
        }

        case 'upload':
            termPrint('Opening file picker...', 'dim');
            openHiddenFilePicker((file) => {
                termPrint(`Selected: ${file.name} (${file.size} bytes)`, 'highlight');
                const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
                if (isCsv) {
                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        try {
                            await loadCSVIntoDatabase(e.target.result, file.name);
                        } catch (err) {
                            termPrint(`ERR: Failed to process CSV: ${err.message}`, 'error');
                        }
                    };
                    reader.onerror = function() {
                        termPrint('ERR: Failed to read selected CSV file.', 'error');
                    };
                    reader.readAsText(file);
                    return;
                }

                const reader = new FileReader();
                reader.onload = function(e) {
                    let inPtr = 0;
                    let outPtr = 0;
                    try {
                        const arrayBuffer = e.target.result;
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const size = uint8Array.length;

                        ensureWasmMemory();

                        // 1. Allocate WASM memory using Emscripten _malloc
                        inPtr = Module._malloc(size);
                        if (!inPtr) {
                            termPrint('ERR: Failed to allocate WASM memory via _malloc.', 'error');
                            return;
                        }

                        // 2. Pass data to WASM memory using Emscripten HEAPU8
                        Module.HEAPU8.set(uint8Array, inPtr);
                        termPrint(`Transferred ${size} bytes to WASM HEAPU8 [inPtr: 0x${inPtr.toString(16)}].`, 'dim');

                        // 3. Call process_data (C function via Emscripten)
                        outPtr = inPtr;
                        if (typeof Module._process_data === 'function') {
                            outPtr = Module._process_data(inPtr, size);
                        } else if (typeof Module.ccall === 'function') {
                            try {
                                outPtr = Module.ccall('process_data', 'number', ['number', 'number'], [inPtr, size]);
                            } catch (err) {
                                outPtr = inPtr;
                            }
                        }

                        termPrint(`WASM process_data returned outPtr: 0x${outPtr.toString(16)}.`, 'success');

                        // 4. Read returned WASM output pointer, convert to Blob, and trigger download
                        const downloadName = file.name.startsWith('processed_') ? file.name : `processed_${file.name}`;
                        downloadWasmOutput(outPtr, size, downloadName, file.type || 'application/octet-stream');
                        termPrint(`Automatic download initiated for '${downloadName}'.`, 'success');
                    } catch (err) {
                        termPrint(`ERR: Upload processing failed: ${err.message}`, 'error');
                    } finally {
                        // 5. Clean up allocated WASM memory immediately to prevent heap leaks
                        if (typeof Module._free === 'function') {
                            if (inPtr) {
                                Module._free(inPtr);
                            }
                            if (outPtr && outPtr !== inPtr) {
                                Module._free(outPtr);
                            }
                        }
                    }
                };
                reader.onerror = function() {
                    termPrint('ERR: Failed to read selected file.', 'error');
                };
                reader.readAsArrayBuffer(file);
            });
            break;

        case 'filter': {
            if (!args.length) {
                termPrint('Usage: filter <keyword>', 'error');
                termPrint('Example: filter ERROR', 'dim');
                break;
            }
            const kw = args.join(' ');
            termPrint(`Select a log file to filter lines containing '${kw}'...`, 'dim');
            openHiddenFilePicker((file) => {
                termPrint(`Loaded file '${file.name}' (${file.size} bytes). Filtering via WASM...`, 'highlight');
                const reader = new FileReader();
                reader.onload = function(e) {
                    let ptr = 0;
                    try {
                        const fileContent = e.target.result;
                        let filteredText = '';

                        if (typeof Module.ccall === 'function') {
                            ptr = Module.ccall('filter_logs', 'number', ['string', 'string'], [fileContent, kw]);
                            if (ptr) {
                                filteredText = Module.UTF8ToString(ptr);
                            }
                        } else {
                            // Fallback if WASM is not loaded
                            filteredText = fileContent.split('\n').filter(line => line.includes(kw)).join('\n');
                        }

                        // Parse matching lines for preview
                        const rawLines = filteredText ? filteredText.split(/\r?\n/) : [];
                        const matchedLines = rawLines.filter(line => line.length > 0);
                        const count = matchedLines.length;

                        if (count === 0) {
                            termPrint(`No lines matching keyword '${kw}' found.`, 'warning');
                        } else {
                            const previewLimit = Math.min(20, count);
                            termPrint(`--- Preview: First ${previewLimit} Matching Line(s) (Total: ${count}) ---`, 'highlight');
                            for (let i = 0; i < previewLimit; i++) {
                                termPrint(matchedLines[i]);
                            }
                            if (count > previewLimit) {
                                termPrint(`... [${count - previewLimit} additional line(s) omitted from preview]`, 'dim');
                            }
                            termPrint('----------------------------------------------------', 'highlight');

                            // Trigger automated browser download only after displaying preview
                            const blob = new Blob([filteredText], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = 'filtered_logs.txt';
                            document.body.appendChild(a);
                            a.click();

                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }, 100);

                            termPrint(`Success: Extracted ${count} matching line(s). Triggered download for 'filtered_logs.txt'.`, 'success');
                        }
                    } catch (err) {
                        termPrint(`ERR: Log filter processing failed: ${err.message}`, 'error');
                    } finally {
                        if (ptr && typeof Module._free === 'function') {
                            Module._free(ptr);
                            ptr = 0;
                        }
                    }
                };
                reader.onerror = function() {
                    termPrint('ERR: Failed to read selected file.', 'error');
                };
                reader.readAsText(file);
            }, '.txt,.log,text/*');
            break;
        }

        case 'b64': {
            if (!args.length) {
                termPrint('Usage: b64 [-e|encode | -d|decode] <text>', 'error');
                break;
            }
            let mode = 'encode';
            let textToProcess = '';

            const firstArg = args[0].toLowerCase();
            if (firstArg === '-e' || firstArg === 'encode') {
                mode = 'encode';
                textToProcess = args.slice(1).join(' ');
            } else if (firstArg === '-d' || firstArg === 'decode') {
                mode = 'decode';
                textToProcess = args.slice(1).join(' ');
            } else {
                mode = 'encode';
                textToProcess = args.join(' ');
            }

            if (!textToProcess) {
                termPrint(`ERR: No input string specified to ${mode}.`, 'error');
                break;
            }

            if (typeof Module.ccall === 'function') {
                let ptr = 0;
                try {
                    const fnName = mode === 'encode' ? 'base64_encode' : 'base64_decode';
                    ptr = Module.ccall(fnName, 'number', ['string'], [textToProcess]);
                    if (ptr) {
                        const result = Module.UTF8ToString(ptr);
                        termPrint(result, 'success');
                    } else {
                        termPrint('ERR: WASM Base64 returned null pointer.', 'error');
                    }
                } catch (err) {
                    termPrint(`ERR: WASM Base64 error: ${err.message}`, 'error');
                } finally {
                    if (ptr && typeof Module._free === 'function') {
                        Module._free(ptr);
                        ptr = 0;
                    }
                }
            } else {
                try {
                    if (mode === 'encode') {
                        const encoded = btoa(unescape(encodeURIComponent(textToProcess)));
                        termPrint(encoded, 'success');
                    } else {
                        const decoded = decodeURIComponent(escape(atob(textToProcess)));
                        termPrint(decoded, 'success');
                    }
                } catch (e) {
                    termPrint(`ERR: Base64 decode error: ${e.message}`, 'error');
                }
            }
            break;
        }

        case 'hash': {
            if (!args.length) {
                termPrint('Usage: hash <text>', 'error');
                break;
            }
            const textToHash = args.join(' ');
            if (typeof Module.ccall === 'function') {
                let ptr = 0;
                try {
                    ptr = Module.ccall('sha256_hash', 'number', ['string'], [textToHash]);
                    if (ptr) {
                        const digest = Module.UTF8ToString(ptr);
                        termPrint(digest, 'success');
                    } else {
                        termPrint('ERR: WASM SHA-256 returned null pointer.', 'error');
                    }
                } catch (err) {
                    termPrint(`ERR: WASM SHA-256 error: ${err.message}`, 'error');
                } finally {
                    if (ptr && typeof Module._free === 'function') {
                        Module._free(ptr);
                        ptr = 0;
                    }
                }
            } else {
                if (typeof crypto !== 'undefined' && crypto.subtle) {
                    crypto.subtle.digest('SHA-256', new TextEncoder().encode(textToHash))
                        .then(buf => {
                            const hashHex = Array.from(new Uint8Array(buf))
                                .map(b => b.toString(16).padStart(2, '0'))
                                .join('');
                            termPrint(hashHex, 'success');
                        })
                        .catch(err => {
                            termPrint(`ERR: Hash error: ${err.message}`, 'error');
                        });
                } else {
                    termPrint('[WASM sha256_hash Ready]', 'success');
                }
            }
            break;
        }

        case 'check': {
            if (!args.length) {
                termPrint('Usage: check <json_payload>', 'error');
                termPrint('Example: check {"name": "RedTerm", "features": ["wasm", "shell"]}', 'dim');
                break;
            }
            const jsonPayload = args.join(' ');
            termPrint('Executing single-pass JSON validation via WASM...', 'dim');
            let errLine = 0;
            if (typeof Module.ccall === 'function') {
                try {
                    errLine = Module.ccall('validate_json', 'number', ['string'], [jsonPayload]);
                } catch (err) {
                    termPrint(`ERR: WASM validate_json error: ${err.message}`, 'error');
                    break;
                }
            } else {
                errLine = validateJsonFallback(jsonPayload);
            }

            if (errLine === 0) {
                termPrint('VALID: JSON syntax is valid (0 errors).', 'success');
            } else {
                termPrint(`SYNTAX ERROR: Bracket/brace/quote mismatch at line ${errLine}.`, 'error');
            }
            break;
        }

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
            termPrint('Engine  : Emscripten WASM Subsystem (_malloc, HEAPU8, process_data)');
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
    termPrint("Type 'help' to inspect commands or 'upload' to test WASM file processing.", 'dim');
    termPrint('');
});
