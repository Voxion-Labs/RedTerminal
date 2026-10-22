#include "filter.h"
#include <stdlib.h>
#include <stddef.h>
#include <stdbool.h>

/**
 * Filter log lines containing a keyword using pure C pointer arithmetic.
 * Optimized for high throughput and single-allocation execution.
 *
 * @param input   Null-terminated input log buffer
 * @param keyword Null-terminated search term
 * @return Newly allocated null-terminated output buffer with matching lines
 */
EMSCRIPTEN_KEEPALIVE
char* filter_logs(char *input, char *keyword) {
    if (!input) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    if (!keyword || *keyword == '\0') {
        // Return duplicate of entire input if keyword is empty
        const char *s = input;
        while (*s) s++;
        size_t len = (size_t)(s - input);
        char *out = (char*)malloc(len + 1);
        if (!out) return NULL;
        char *d = out;
        s = input;
        while ((*d++ = *s++));
        return out;
    }

    // Fast-path length scans using pointer arithmetic
    const char *p = input;
    while (*p) p++;
    size_t in_len = (size_t)(p - input);

    const char *k = keyword;
    while (*k) k++;
    size_t kw_len = (size_t)(k - keyword);

    if (kw_len > in_len) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    // Allocate upper-bound buffer: filtered output is bounded by in_len + 2
    char *out_buf = (char*)malloc(in_len + 2);
    if (!out_buf) return NULL;

    char *dst = out_buf;
    const char *line_start = input;
    p = input;
    const char kw_first = *keyword;

    while (*p) {
        // Locate end of current line using raw pointer traversal
        while (*p && *p != '\n') {
            p++;
        }

        const char *line_end = p;
        size_t line_len = (size_t)(line_end - line_start);

        // Substring search via pointer arithmetic
        if (line_len >= kw_len) {
            const char *scan = line_start;
            const char *scan_limit = line_end - kw_len;
            bool matched = false;

            while (scan <= scan_limit) {
                if (*scan == kw_first) {
                    const char *kp = keyword + 1;
                    const char *cp = scan + 1;
                    while (*kp && *cp == *kp) {
                        cp++;
                        kp++;
                    }
                    if (*kp == '\0') {
                        matched = true;
                        break;
                    }
                }
                scan++;
            }

            if (matched) {
                // Copy matching line directly to output buffer
                const char *src = line_start;
                while (src < line_end) {
                    *dst++ = *src++;
                }
                *dst++ = '\n';
            }
        }

        if (*p == '\n') {
            p++;
        }
        line_start = p;
    }

    *dst = '\0';

    // Shrink allocation to exact footprint
    size_t actual_len = (size_t)(dst - out_buf);
    char *shrunk = (char*)realloc(out_buf, actual_len + 1);
    return shrunk ? shrunk : out_buf;
}
