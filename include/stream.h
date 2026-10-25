#ifndef STREAM_H
#define STREAM_H

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

#include <stddef.h>
#include <stdint.h>

/**
 * Pure C11 stream chunk processor for massive file ingestion.
 * Operates on fixed memory slices (e.g. 5MB) using pointer arithmetic.
 *
 * @param buffer Pointer to chunk data in WASM linear memory
 * @param size   Size of chunk in bytes
 * @return 0 on success
 */
EMSCRIPTEN_KEEPALIVE
int process_chunk(char *buffer, size_t size);

/**
 * Resets running stream metrics.
 */
EMSCRIPTEN_KEEPALIVE
void stream_reset(void);

/**
 * Returns cumulative bytes processed across all chunks.
 */
EMSCRIPTEN_KEEPALIVE
size_t stream_get_total_bytes(void);

/**
 * Returns number of chunks processed.
 */
EMSCRIPTEN_KEEPALIVE
size_t stream_get_chunks_count(void);

/**
 * Returns running 32-bit FNV-1a checksum of the stream.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t stream_get_checksum(void);

/**
 * Returns total newline count in the stream.
 */
EMSCRIPTEN_KEEPALIVE
size_t stream_get_line_count(void);

#endif // STREAM_H
