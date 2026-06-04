#include "logger.h"
#include "utils.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <pthread.h>

static FILE *log_file = NULL;
static char log_filepath[256];
static pthread_mutex_t log_mutex = PTHREAD_MUTEX_INITIALIZER;

bool logger_init(const char *filepath) {
    pthread_mutex_lock(&log_mutex);
    if (log_file != NULL) {
        pthread_mutex_unlock(&log_mutex);
        return true;
    }
    
    strncpy(log_filepath, filepath, sizeof(log_filepath) - 1);
    log_filepath[sizeof(log_filepath) - 1] = '\0';
    
    log_file = fopen(log_filepath, "a");
    pthread_mutex_unlock(&log_mutex);
    return log_file != NULL;
}

void logger_close(void) {
    pthread_mutex_lock(&log_mutex);
    if (log_file != NULL) {
        fclose(log_file);
        log_file = NULL;
    }
    pthread_mutex_unlock(&log_mutex);
}

void logger_log(log_level_t level, const char *format, ...) {
    pthread_mutex_lock(&log_mutex);
    if (log_file == NULL) {
        pthread_mutex_unlock(&log_mutex);
        return;
    }

    char time_buf[64];
    utils_format_time(time_buf, sizeof(time_buf));

    const char *level_str = "INFO";
    switch(level) {
        case LOG_LEVEL_INFO: level_str = "INFO"; break;
        case LOG_LEVEL_WARN: level_str = "WARN"; break;
        case LOG_LEVEL_ERROR: level_str = "ERROR"; break;
    }

    fprintf(log_file, "[%s] [%s] ", time_buf, level_str);

    va_list args;
    va_start(args, format);
    vfprintf(log_file, format, args);
    va_end(args);

    fprintf(log_file, "\n");
    fflush(log_file);
    pthread_mutex_unlock(&log_mutex);
}

void logger_dump_to_console(void) {
    pthread_mutex_lock(&log_mutex);
    if (log_filepath[0] == '\0') {
        printf("Logger not initialized.\n");
        pthread_mutex_unlock(&log_mutex);
        return;
    }

    FILE *f = fopen(log_filepath, "r");
    if (f) {
        printf("\n--- System Logs ---\n");
        char line[256];
        while (fgets(line, sizeof(line), f)) {
            printf("%s", line);
        }
        printf("-------------------\n");
        fclose(f);
    } else {
        printf("Failed to read logs from %s\n", log_filepath);
    }
    pthread_mutex_unlock(&log_mutex);
}
