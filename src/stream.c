#include "stream.h"
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

// Static stream state metrics (pure C11, no external libraries)
static size_t g_total_bytes = 0;
static size_t g_chunks_count = 0;
static size_t g_line_count = 0;
static uint32_t g_fnv1a_hash = 2166136261u; // 32-bit FNV-1a offset basis

EMSCRIPTEN_KEEPALIVE
void stream_reset(void) {
    g_total_bytes = 0;
    g_chunks_count = 0;
    g_line_count = 0;
    g_fnv1a_hash = 2166136261u;
}

EMSCRIPTEN_KEEPALIVE
size_t stream_get_total_bytes(void) {
    return g_total_bytes;
}

EMSCRIPTEN_KEEPALIVE
size_t stream_get_chunks_count(void) {
    return g_chunks_count;
}

EMSCRIPTEN_KEEPALIVE
uint32_t stream_get_checksum(void) {
    return g_fnv1a_hash;
}

EMSCRIPTEN_KEEPALIVE
size_t stream_get_line_count(void) {
    return g_line_count;
}

/**
 * Process a single memory chunk using pure C11 pointer arithmetic.
 * Accumulates running stream metrics with flat memory overhead.
 *
 * @param buffer Pointer to chunk memory in WASM linear heap
 * @param size   Number of bytes in chunk
 * @return 0 on success
 */
EMSCRIPTEN_KEEPALIVE
int process_chunk(char *buffer, size_t size) {
    if (!buffer || size == 0) {
        return 0;
    }

    g_chunks_count++;
    g_total_bytes += size;

    // Fast pointer traversal over chunk buffer
    const uint8_t *p = (const uint8_t*)buffer;
    const uint8_t *end = p + size;

    uint32_t hash = g_fnv1a_hash;
    size_t lines = 0;

    while (p < end) {
        if (*p == '\n') {
            lines++;
        }

        // 32-bit FNV-1a rolling hash
        hash ^= (uint32_t)(*p);
        hash *= 16777619u;

        p++;
    }

    g_fnv1a_hash = hash;
    g_line_count += lines;

    return 0;
}
