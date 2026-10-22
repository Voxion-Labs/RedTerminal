#include "logger.h"
#include "process.h"
#include "scheduler.h"
#include "shell.h"
#include <stdio.h>
#include <stdlib.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

/**
 * Passive WASM subsystem initialization.
 * Initializes process table and shell state without starting any blocking I/O loops.
 */
EMSCRIPTEN_KEEPALIVE
int redterm_init(void) {
    process_init();
    shell_init();
    return 0;
}

/**
 * Passive library entrypoint: non-blocking initialization.
 */
int main(void) {
    redterm_init();
    return 0;
}
