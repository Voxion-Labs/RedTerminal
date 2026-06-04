#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <stdbool.h>

// Scheduler API
bool scheduler_init(void);
void scheduler_start(void);
void scheduler_stop(void);

// Expose update interface (tick) for the simulation
void scheduler_tick(void);

#endif // SCHEDULER_H
