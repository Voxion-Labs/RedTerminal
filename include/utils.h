#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

// General Utility API
void utils_trim_whitespace(char *str);
int utils_parse_pid(const char *str, bool *success);
void utils_format_time(char *buffer, size_t size);

// WASM Data Processing API
EMSCRIPTEN_KEEPALIVE
uint8_t* process_data(uint8_t *data, int size);

#endif // UTILS_H
