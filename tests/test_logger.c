#include "logger.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    const char *test_file = "test_logger_output.log";
    remove(test_file);

    bool init = logger_init(test_file);
    assert(init);

    logger_log(LOG_LEVEL_INFO, "Testing %d %s", 123, "logger");
    logger_close();

    FILE *f = fopen(test_file, "r");
    assert(f != NULL);
    
    char buf[256];
    char *res = fgets(buf, sizeof(buf), f);
    assert(res != NULL);
    assert(strstr(buf, "Testing 123 logger") != NULL);
    
    fclose(f);
    remove(test_file);

    printf("test_logger passed.\n");
    return 0;
}
