#ifndef VALIDATOR_H
#define VALIDATOR_H

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

/**
 * Performs a high-speed, single-pass syntax check on JSON strings.
 * Verifies matched brackets, braces, and quotes without building an AST.
 *
 * @param payload Null-terminated JSON string
 * @return 0 if valid, or the 1-based line number of the first syntax error
 */
EMSCRIPTEN_KEEPALIVE
int validate_json(char *payload);

#endif // VALIDATOR_H
