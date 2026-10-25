#include "stream.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

int main(void) {
    printf("Running test_stream...\n");

    stream_reset();
    assert(stream_get_total_bytes() == 0);
    assert(stream_get_chunks_count() == 0);
    assert(stream_get_line_count() == 0);

    // Simulate 3 chunks
    char chunk1[] = "chunk 1 line 1\nchunk 1 line 2\n";
    char chunk2[] = "chunk 2 line 3\nchunk 2 line 4\nchunk 2 line 5\n";
    char chunk3[] = "chunk 3 end";

    int r1 = process_chunk(chunk1, strlen(chunk1));
    assert(r1 == 0);
    assert(stream_get_chunks_count() == 1);
    assert(stream_get_total_bytes() == strlen(chunk1));
    assert(stream_get_line_count() == 2);

    int r2 = process_chunk(chunk2, strlen(chunk2));
    assert(r2 == 0);
    assert(stream_get_chunks_count() == 2);
    assert(stream_get_total_bytes() == strlen(chunk1) + strlen(chunk2));
    assert(stream_get_line_count() == 5);

    int r3 = process_chunk(chunk3, strlen(chunk3));
    assert(r3 == 0);
    assert(stream_get_chunks_count() == 3);
    assert(stream_get_total_bytes() == strlen(chunk1) + strlen(chunk2) + strlen(chunk3));
    assert(stream_get_line_count() == 5);

    // Verify hash is non-zero
    assert(stream_get_checksum() != 0);

    // Null and empty checks
    assert(process_chunk(NULL, 100) == 0);
    assert(process_chunk(chunk1, 0) == 0);

    // Reset check
    stream_reset();
    assert(stream_get_total_bytes() == 0);
    assert(stream_get_chunks_count() == 0);
    assert(stream_get_line_count() == 0);

    printf("All test_stream checks passed successfully!\n");
    return 0;
}
