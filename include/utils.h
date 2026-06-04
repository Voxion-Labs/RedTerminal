#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>
#include <stdbool.h>

// General Utility API
void utils_trim_whitespace(char *str);
int utils_parse_pid(const char *str, bool *success);
void utils_format_time(char *buffer, size_t size);

#endif // UTILS_H
