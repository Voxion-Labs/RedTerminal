#include "shell.h"
#include "process.h"
#include "logger.h"
#include "utils.h"
#include "scheduler.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define MAX_CMD_LEN 256

static void print_help(void) {
    printf("RedTerminal Commands:\n");
    printf("  start <name>   - Start a new process\n");
    printf("  kill <pid>     - Terminate a process\n");
    printf("  pause <pid>    - Pause a running process\n");
    printf("  resume <pid>   - Resume a paused process\n");
    printf("  ps             - List all processes\n");
    printf("  logs           - Show system logs\n");
    printf("  help           - Show this help message\n");
    printf("  exit           - Exit RedTerminal\n");
}

static void print_ps(void) {
    size_t count = 0;
    pcb_t *table = process_get_table(&count);
    
    printf("%-5s %-20s %-15s %-10s %-20s\n", "PID", "NAME", "STATE", "CPU_TIME", "CREATED_AT");
    printf("--------------------------------------------------------------------------\n");
    
    for (size_t i = 0; i < count; ++i) {
        const char *state_str = "UNKNOWN";
        switch (table[i].state) {
            case PROCESS_STATE_RUNNING: state_str = "RUNNING"; break;
            case PROCESS_STATE_STOPPED: state_str = "STOPPED"; break;
            case PROCESS_STATE_TERMINATED: state_str = "TERMINATED"; break;
        }
        
        char time_str[64];
        struct tm *t = localtime(&table[i].created_at);
        if (t) {
            strftime(time_str, sizeof(time_str), "%Y-%m-%d %H:%M:%S", t);
        } else {
            time_str[0] = '\0';
        }
        
        printf("%-5d %-20s %-15s %-10u %-20s\n", 
            table[i].pid, 
            table[i].name, 
            state_str, 
            table[i].cpu_time, 
            time_str);
    }
}

bool shell_init(void) {
    logger_log(LOG_LEVEL_INFO, "Shell initialized");
    return true;
}

void shell_run(void) {
    char input[MAX_CMD_LEN];
    printf("Welcome to RedTerminal. Type 'help' for commands.\n");

    while (1) {
        printf("RedTerm> ");
        if (fgets(input, sizeof(input), stdin) == NULL) {
            break; // EOF or error
        }

        utils_trim_whitespace(input);
        if (strlen(input) == 0) {
            continue;
        }

        // Parse command and argument
        char *cmd = input;
        char *arg = strchr(input, ' ');
        if (arg) {
            *arg = '\0';
            arg++;
            utils_trim_whitespace(arg);
        } else {
            arg = "";
        }

        if (strcmp(cmd, "exit") == 0) {
            break;
        } else if (strcmp(cmd, "help") == 0) {
            print_help();
        } else if (strcmp(cmd, "ps") == 0) {
            print_ps();
        } else if (strcmp(cmd, "logs") == 0) {
            logger_dump_to_console();
        } else if (strcmp(cmd, "start") == 0) {
            if (strlen(arg) == 0) {
                printf("Error: Missing process name. Usage: start <name>\n");
            } else {
                int pid = process_create(arg);
                if (pid >= 0) {
                    printf("Process '%s' started with PID %d\n", arg, pid);
                } else {
                    printf("Error: Failed to start process.\n");
                }
            }
        } else if (strcmp(cmd, "kill") == 0 || strcmp(cmd, "pause") == 0 || strcmp(cmd, "resume") == 0) {
            if (strlen(arg) == 0) {
                printf("Error: Missing PID. Usage: %s <pid>\n", cmd);
            } else {
                bool success = false;
                int pid = utils_parse_pid(arg, &success);
                if (!success) {
                    printf("Error: Invalid PID format.\n");
                } else {
                    if (strcmp(cmd, "kill") == 0) {
                        if (process_kill(pid)) printf("Process %d killed.\n", pid);
                        else printf("Error: Could not kill process %d.\n", pid);
                    } else if (strcmp(cmd, "pause") == 0) {
                        if (process_pause(pid)) printf("Process %d paused.\n", pid);
                        else printf("Error: Could not pause process %d.\n", pid);
                    } else if (strcmp(cmd, "resume") == 0) {
                        if (process_resume(pid)) printf("Process %d resumed.\n", pid);
                        else printf("Error: Could not resume process %d.\n", pid);
                    }
                }
            }
        } else {
            printf("Unknown command: '%s'. Type 'help' for a list of commands.\n", cmd);
        }
    }
}
