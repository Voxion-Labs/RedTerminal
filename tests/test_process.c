#include "process.h"
#include "logger.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    logger_init("test.log"); 
    process_init();

    int pid = process_create("test_proc");
    assert(pid == 1);

    size_t count = 0;
    pcb_t *table = process_get_table(&count);
    assert(count == 1);
    assert(table[0].pid == 1);
    assert(strcmp(table[0].name, "test_proc") == 0);
    assert(table[0].state == PROCESS_STATE_RUNNING);

    bool paused = process_pause(1);
    assert(paused);
    assert(table[0].state == PROCESS_STATE_STOPPED);

    bool resumed = process_resume(1);
    assert(resumed);
    assert(table[0].state == PROCESS_STATE_RUNNING);

    bool killed = process_kill(1);
    assert(killed);
    assert(table[0].state == PROCESS_STATE_TERMINATED);

    printf("test_process passed.\n");
    return 0;
}
