#include "scheduler.h"
#include "process.h"
#include "logger.h"
#include <pthread.h>
#include <unistd.h>
#include <stdlib.h>

static pthread_t scheduler_thread;
static bool scheduler_running = false;

void scheduler_tick(void) {
    size_t count = 0;
    pcb_t *table = process_get_table(&count);
    
    // Simulate scheduling by finding RUNNING processes and incrementing CPU time
    for (size_t i = 0; i < count; ++i) {
        if (table[i].state == PROCESS_STATE_RUNNING) {
            table[i].cpu_time += 1;
        }
    }
}

static void* scheduler_loop(void *arg) {
    (void)arg;
    while (scheduler_running) {
        scheduler_tick();
        sleep(1); // 1 second per tick
    }
    return NULL;
}

bool scheduler_init(void) {
    scheduler_running = false;
    logger_log(LOG_LEVEL_INFO, "Scheduler initialized");
    return true;
}

void scheduler_start(void) {
    if (scheduler_running) return;
    
    scheduler_running = true;
    if (pthread_create(&scheduler_thread, NULL, scheduler_loop, NULL) != 0) {
        logger_log(LOG_LEVEL_ERROR, "Failed to start scheduler thread");
        scheduler_running = false;
    } else {
        logger_log(LOG_LEVEL_INFO, "Scheduler started");
    }
}

void scheduler_stop(void) {
    if (!scheduler_running) return;
    
    scheduler_running = false;
    pthread_join(scheduler_thread, NULL);
    logger_log(LOG_LEVEL_INFO, "Scheduler stopped");
}
