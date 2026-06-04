#ifndef LOGGER_H
#define LOGGER_H

#include <stdbool.h>

typedef enum {
    LOG_LEVEL_INFO,
    LOG_LEVEL_WARN,
    LOG_LEVEL_ERROR
} log_level_t;

// Logger API
bool logger_init(const char *filepath);
void logger_close(void);
void logger_log(log_level_t level, const char *format, ...);
void logger_dump_to_console(void);

#endif // LOGGER_H
