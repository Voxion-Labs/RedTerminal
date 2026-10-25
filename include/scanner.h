#ifndef SCANNER_H
#define SCANNER_H

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

#include <stddef.h>

/**
 * Scans input text using a sliding window and pure C11 pointer arithmetic
 * for exposed secrets, common credential prefixes (e.g., 'AKIA', 'sk_live_'),
 * and high-entropy cryptographic strings.
 *
 * Strict Rule: Pure C pointer arithmetic only. No external regex libraries.
 *
 * @param text Null-terminated input text to analyze
 * @return Newly allocated null-terminated vulnerability report string.
 *         Caller is responsible for freeing the buffer via free().
 */
EMSCRIPTEN_KEEPALIVE
char* scan_secrets(char *text);

#endif /* SCANNER_H */
