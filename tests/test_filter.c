#include "filter.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

int main(void) {
    printf("Running test_filter...\n");

    // Test 1: Basic keyword filtering
    char input1[] = "2026-10-22 INFO User logged in\n"
                    "2026-10-22 ERROR Database connection failed\n"
                    "2026-10-22 WARN High memory usage\n"
                    "2026-10-22 ERROR Segmentation fault\n"
                    "2026-10-22 INFO Shutdown completed\n";

    char *res1 = filter_logs(input1, "ERROR");
    assert(res1 != NULL);
    assert(strstr(res1, "ERROR Database connection failed") != NULL);
    assert(strstr(res1, "ERROR Segmentation fault") != NULL);
    assert(strstr(res1, "User logged in") == NULL);
    assert(strstr(res1, "High memory usage") == NULL);
    free(res1);

    // Test 2: No match found
    char *res2 = filter_logs(input1, "CRITICAL");
    assert(res2 != NULL);
    assert(strlen(res2) == 0);
    free(res2);

    // Test 3: Last line without trailing newline
    char input3[] = "alpha\nbeta\ngamma";
    char *res3 = filter_logs(input3, "gamma");
    assert(res3 != NULL);
    assert(strcmp(res3, "gamma\n") == 0);
    free(res3);

    // Test 4: Empty keyword returns all lines
    char *res4 = filter_logs(input3, "");
    assert(res4 != NULL);
    assert(strcmp(res4, input3) == 0);
    free(res4);

    // Test 5: Single character keyword
    char *res5 = filter_logs(input3, "b");
    assert(res5 != NULL);
    assert(strcmp(res5, "beta\n") == 0);
    free(res5);

    // Test 6: Null inputs
    char *res6 = filter_logs(NULL, "test");
    assert(res6 != NULL);
    assert(strlen(res6) == 0);
    free(res6);

    printf("All test_filter checks passed successfully!\n");
    return 0;
}
