#include "scheduler.h"
#include "process.h"
#include "logger.h"
#include <assert.h>
#include <stdio.h>
#include <unistd.h>

int main(void) {
    logger_init("test.log");
    process_init();
    scheduler_init();

    process_create("proc1");
    
    size_t count = 0;
    pcb_t *table = process_get_table(&count);
    assert(table[0].cpu_time == 0);

    // Manually trigger tick without starting the thread
    scheduler_tick();
    assert(table[0].cpu_time == 1);

    process_pause(1);
    scheduler_tick();
    
    // CPU time should not increase for paused process
    assert(table[0].cpu_time == 1);

    printf("test_scheduler passed.\n");
    return 0;
}
