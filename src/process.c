#include "process.h"
#include "logger.h"
#include <string.h>
#include <pthread.h>
#include <stdio.h>

#define MAX_PROCESSES 256

static pcb_t process_table[MAX_PROCESSES];
static size_t process_count = 0;
static int next_pid = 1;
static pthread_mutex_t pt_mutex = PTHREAD_MUTEX_INITIALIZER;

void process_init(void) {
    pthread_mutex_lock(&pt_mutex);
    process_count = 0;
    next_pid = 1;
    memset(process_table, 0, sizeof(process_table));
    pthread_mutex_unlock(&pt_mutex);
    logger_log(LOG_LEVEL_INFO, "Process Manager initialized");
}

int process_create(const char *name) {
    pthread_mutex_lock(&pt_mutex);
    if (process_count >= MAX_PROCESSES) {
        pthread_mutex_unlock(&pt_mutex);
        logger_log(LOG_LEVEL_ERROR, "Cannot create process %s: table full", name);
        return -1;
    }

    pcb_t *p = &process_table[process_count];
    p->pid = next_pid++;
    strncpy(p->name, name, MAX_PROCESS_NAME - 1);
    p->name[MAX_PROCESS_NAME - 1] = '\0';
    p->state = PROCESS_STATE_RUNNING;
    p->created_at = time(NULL);
    p->cpu_time = 0;

    process_count++;
    int created_pid = p->pid;
    pthread_mutex_unlock(&pt_mutex);

    logger_log(LOG_LEVEL_INFO, "Process created: PID=%d, Name=%s", created_pid, name);
    return created_pid;
}

bool process_kill(int pid) {
    pthread_mutex_lock(&pt_mutex);
    for (size_t i = 0; i < process_count; ++i) {
        if (process_table[i].pid == pid) {
            if (process_table[i].state == PROCESS_STATE_TERMINATED) {
                pthread_mutex_unlock(&pt_mutex);
                logger_log(LOG_LEVEL_WARN, "Cannot kill process %d: already terminated", pid);
                return false;
            }
            process_table[i].state = PROCESS_STATE_TERMINATED;
            pthread_mutex_unlock(&pt_mutex);
            logger_log(LOG_LEVEL_INFO, "Process killed: PID=%d", pid);
            return true;
        }
    }
    pthread_mutex_unlock(&pt_mutex);
    logger_log(LOG_LEVEL_ERROR, "Cannot kill process %d: not found", pid);
    return false;
}

bool process_pause(int pid) {
    pthread_mutex_lock(&pt_mutex);
    for (size_t i = 0; i < process_count; ++i) {
        if (process_table[i].pid == pid) {
            if (process_table[i].state != PROCESS_STATE_RUNNING) {
                pthread_mutex_unlock(&pt_mutex);
                logger_log(LOG_LEVEL_WARN, "Cannot pause process %d: not running", pid);
                return false;
            }
            process_table[i].state = PROCESS_STATE_STOPPED;
            pthread_mutex_unlock(&pt_mutex);
            logger_log(LOG_LEVEL_INFO, "Process paused: PID=%d", pid);
            return true;
        }
    }
    pthread_mutex_unlock(&pt_mutex);
    logger_log(LOG_LEVEL_ERROR, "Cannot pause process %d: not found", pid);
    return false;
}

bool process_resume(int pid) {
    pthread_mutex_lock(&pt_mutex);
    for (size_t i = 0; i < process_count; ++i) {
        if (process_table[i].pid == pid) {
            if (process_table[i].state != PROCESS_STATE_STOPPED) {
                pthread_mutex_unlock(&pt_mutex);
                logger_log(LOG_LEVEL_WARN, "Cannot resume process %d: not stopped", pid);
                return false;
            }
            process_table[i].state = PROCESS_STATE_RUNNING;
            pthread_mutex_unlock(&pt_mutex);
            logger_log(LOG_LEVEL_INFO, "Process resumed: PID=%d", pid);
            return true;
        }
    }
    pthread_mutex_unlock(&pt_mutex);
    logger_log(LOG_LEVEL_ERROR, "Cannot resume process %d: not found", pid);
    return false;
}

pcb_t* process_get_table(size_t *count) {
    // Return direct pointer for iteration. 
    // Data race on cpu_time is acceptable in this simulator context.
    if (count) *count = process_count;
    return process_table;
}

pcb_t* process_get_by_pid(int pid) {
    for (size_t i = 0; i < process_count; ++i) {
        if (process_table[i].pid == pid) {
            return &process_table[i];
        }
    }
    return NULL;
}
