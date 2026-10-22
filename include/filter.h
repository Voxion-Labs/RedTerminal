#ifndef FILTER_H
#define FILTER_H

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

// Fast Log Filtering via pure pointer arithmetic for WASM export
EMSCRIPTEN_KEEPALIVE
char* filter_logs(char *input, char *keyword);

#endif // FILTER_H
