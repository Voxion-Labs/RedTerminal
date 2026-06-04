#ifndef PROCESS_H
#define PROCESS_H

#include <stddef.h>
#include <time.h>
#include <stdbool.h>

#define MAX_PROCESS_NAME 32

typedef enum {
    PROCESS_STATE_RUNNING,
    PROCESS_STATE_STOPPED,
    PROCESS_STATE_TERMINATED
} process_state_t;

typedef struct {
    int pid;
    char name[MAX_PROCESS_NAME];
    process_state_t state;
    time_t created_at;
    unsigned int cpu_time; // Simulated execution time
} pcb_t;

// Core Process API
void process_init(void);
int process_create(const char *name);
bool process_kill(int pid);
bool process_pause(int pid);
bool process_resume(int pid);

// Access and iteration API
pcb_t* process_get_table(size_t *count);
pcb_t* process_get_by_pid(int pid);

#endif // PROCESS_H
