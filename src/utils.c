#include "utils.h"
#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>

void utils_trim_whitespace(char *str) {
    if (!str) return;

    // Trim leading space
    char *start = str;
    while (isspace((unsigned char)*start)) {
        start++;
    }

    if (*start == '\0') {
        str[0] = '\0';
        return;
    }

    // Move string to the beginning
    size_t len = strlen(start);
    memmove(str, start, len + 1);

    // Trim trailing space
    char *end = str + strlen(str) - 1;
    while (end > str && isspace((unsigned char)*end)) {
        end--;
    }
    
    // Write new null terminator
    end[1] = '\0';
}

int utils_parse_pid(const char *str, bool *success) {
    if (!str || !success) return -1;
    char *endptr;
    long val = strtol(str, &endptr, 10);
    
    // If no conversion was performed, or there are trailing invalid characters
    if (endptr == str || *endptr != '\0') {
        *success = false;
        return -1;
    }
    
    *success = true;
    return (int)val;
}

void utils_format_time(char *buffer, size_t size) {
    if (!buffer || size == 0) return;
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    if (t) {
        strftime(buffer, size, "%Y-%m-%d %H:%M:%S", t);
    } else {
        buffer[0] = '\0';
    }
}
