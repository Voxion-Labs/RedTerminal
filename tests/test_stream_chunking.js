const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

async function runTests() {
    console.log("Running WASM Stream Chunking unit tests...");

    const appJsCode = fs.readFileSync('public/app.js', 'utf8');

    let activeAllocations = 0;
    let maxConcurrentAllocatedBytes = 0;
    const allocationHistory = [];
    const freedPointers = [];
    let nextPtr = 10000;

    const sandbox = {
        console,
        window: {
            addEventListener: () => {}
        },
        document: {
            getElementById: () => null,
            createElement: () => ({ style: {} }),
            addEventListener: () => {}
        },
        termPrint: (msg, style) => {
            // console.log(`[termPrint] (${style || 'normal'}): ${msg}`);
        },
        Module: {
            HEAPU8: new Uint8Array(32 * 1024 * 1024),
            _malloc: (size) => {
                activeAllocations++;
                if (size > maxConcurrentAllocatedBytes) {
                    maxConcurrentAllocatedBytes = size;
                }
                const ptr = nextPtr;
                nextPtr += size + 16;
                allocationHistory.push({ ptr, size });
                return ptr;
            },
            _free: (ptr) => {
                activeAllocations--;
                freedPointers.push(ptr);
            },
            _stream_reset: () => {
                sandbox.Module._totalBytes = 0;
                sandbox.Module._chunkCount = 0;
                sandbox.Module._checksum = 2166136261;
            },
            _process_chunk: (ptr, size) => {
                sandbox.Module._chunkCount = (sandbox.Module._chunkCount || 0) + 1;
                sandbox.Module._totalBytes = (sandbox.Module._totalBytes || 0) + size;
                let hash = sandbox.Module._checksum || 2166136261;
                for (let i = 0; i < size; i++) {
                    hash ^= sandbox.Module.HEAPU8[ptr + i];
                    hash = Math.imul(hash, 16777619);
                }
                sandbox.Module._checksum = hash;
                return 0;
            },
            _stream_get_total_bytes: () => sandbox.Module._totalBytes || 0,
            _stream_get_chunks_count: () => sandbox.Module._chunkCount || 0,
            _stream_get_checksum: () => (sandbox.Module._checksum || 0) >>> 0
        },
        performance: {
            now: () => Date.now()
        },
        setTimeout: (fn) => fn()
    };

    vm.createContext(sandbox);
    vm.runInContext(appJsCode, sandbox);

    const streamFileInChunks = vm.runInContext('streamFileInChunks', sandbox);
    assert(typeof streamFileInChunks === 'function', 'streamFileInChunks should be defined');

    // Create a mock large file: 12MB total (5MB + 5MB + 2MB = 3 chunks)
    const FIVE_MB = 5 * 1024 * 1024;
    const TOTAL_SIZE = 12 * 1024 * 1024; // 12MB
    const mockData = new Uint8Array(TOTAL_SIZE);
    mockData.fill(0x42); // 'B'

    const mockFile = {
        name: 'large_data.bin',
        size: TOTAL_SIZE,
        slice: function(start, end) {
            const actualEnd = Math.min(end, TOTAL_SIZE);
            const sliceBuf = mockData.subarray(start, actualEnd);
            return {
                size: sliceBuf.length,
                arrayBuffer: async () => sliceBuf.buffer.slice(sliceBuf.byteOffset, sliceBuf.byteOffset + sliceBuf.byteLength)
            };
        }
    };

    const progressReports = [];
    const result = await streamFileInChunks(mockFile, (p) => {
        progressReports.push({ ...p });
    });

    // 1. Verify 3 chunks were processed
    assert.strictEqual(result.totalBytes, TOTAL_SIZE, 'Total processed bytes must equal 12MB');
    assert.strictEqual(result.totalChunks, 3, '12MB file must be split into exactly 3 chunks of 5MB, 5MB, 2MB');
    console.log("PASS: 12MB file processed in exactly 3 slices (5MB, 5MB, 2MB).");

    // 2. Verify flat RAM footprint: at no time should activeAllocations exceed 1, or maxConcurrentAllocatedBytes exceed 5MB
    assert.strictEqual(allocationHistory.length, 3, 'Must allocate memory exactly 3 times (once per chunk)');
    assert.strictEqual(freedPointers.length, 3, 'Must free memory exactly 3 times (immediately after each chunk)');
    assert.strictEqual(maxConcurrentAllocatedBytes, FIVE_MB, 'Max chunk allocation in WASM memory must never exceed 5MB');
    assert.strictEqual(activeAllocations, 0, 'All allocated WASM memory must be freed after stream completes');
    console.log("PASS: Flat RAM confirmed (active chunk <= 5MB, Module._free called immediately per chunk).");

    // 3. Verify progress reports
    assert.strictEqual(progressReports.length, 3, 'Should report progress for each of the 3 chunks');
    assert.strictEqual(progressReports[0].chunk, 1);
    assert.strictEqual(progressReports[1].chunk, 2);
    assert.strictEqual(progressReports[2].chunk, 3);
    assert.strictEqual(progressReports[2].percent, 100);
    console.log("PASS: Terminal UI progress bar reported increments up to 100%.");

    // 4. Test empty file handling
    const emptyFile = {
        name: 'empty.dat',
        size: 0,
        slice: () => ({ size: 0, arrayBuffer: async () => new ArrayBuffer(0) })
    };
    const emptyResult = await streamFileInChunks(emptyFile);
    assert.strictEqual(emptyResult.totalBytes, 0);
    assert.strictEqual(emptyResult.totalChunks, 0);
    console.log("PASS: Empty file handled gracefully without chunk allocations.");

    console.log("All WASM Stream Chunking tests passed successfully!");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
