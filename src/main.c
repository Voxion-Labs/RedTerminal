#include "logger.h"
#include "process.h"
#include "scheduler.h"
#include "shell.h"
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    // Initialize subsystem modules
    if (!logger_init("redterm.log")) {
        fprintf(stderr, "Failed to initialize logger.\n");
        return EXIT_FAILURE;
    }
    
    process_init();
    
    if (!scheduler_init()) {
        logger_log(LOG_LEVEL_ERROR, "Failed to initialize scheduler.");
        logger_close();
        return EXIT_FAILURE;
    }
    
    shell_init();
    
    // Start background scheduler tick thread
    scheduler_start();
    
    // Run the interactive shell loop (blocks until 'exit' or EOF)
    shell_run();
    
    // Graceful shutdown
    printf("Shutting down RedTerminal...\n");
    logger_log(LOG_LEVEL_INFO, "System shutdown initiated");
    
    scheduler_stop();
    logger_close();
    
    return EXIT_SUCCESS;
}
