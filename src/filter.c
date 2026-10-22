#include "filter.h"
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

/**
 * Filter log lines containing a keyword using pure C pointers and strstr.
 *
 * @param input   Null-terminated input log buffer
 * @param keyword Null-terminated search term
 * @return Newly allocated null-terminated output buffer containing matching lines
 */
EMSCRIPTEN_KEEPALIVE
char* filter_logs(const char *input, const char *keyword) {
    if (!input) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    size_t in_len = strlen(input);

    if (!keyword || *keyword == '\0') {
        char *copy = (char*)malloc(in_len + 1);
        if (!copy) return NULL;
        memcpy(copy, input, in_len + 1);
        return copy;
    }

    size_t kw_len = strlen(keyword);
    if (kw_len > in_len) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    // Allocate temporary duplicate to isolate lines with null terminators for strstr
    char *in_copy = (char*)malloc(in_len + 1);
    if (!in_copy) return NULL;
    memcpy(in_copy, input, in_len + 1);

    // Allocate upper-bound buffer: filtered output is bounded by in_len + 2
    char *out_buf = (char*)malloc(in_len + 2);
    if (!out_buf) {
        free(in_copy);
        return NULL;
    }

    char *dst = out_buf;
    char *p = in_copy;

    while (*p) {
        char *line_start = p;

        // Traverse to line boundary using pointer arithmetic
        while (*p && *p != '\n') {
            p++;
        }

        bool has_newline = (*p == '\n');
        if (has_newline) {
            *p = '\0';
        }

        // Check if line contains keyword using strstr
        if (strstr(line_start, keyword) != NULL) {
            const char *src = line_start;
            while (*src) {
                *dst++ = *src++;
            }
            *dst++ = '\n';
        }

        if (has_newline) {
            p++;
        }
    }

    *dst = '\0';
    free(in_copy);

    // Shrink allocation to actual size
    size_t actual_len = (size_t)(dst - out_buf);
    char *shrunk = (char*)realloc(out_buf, actual_len + 1);
    return shrunk ? shrunk : out_buf;
}
