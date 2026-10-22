#include "validator.h"
#include <stdlib.h>
#include <stddef.h>
#include <stdbool.h>

/**
 * Performs a high-speed, single-pass syntax check on massive JSON strings.
 * Verifies matched brackets, braces, and quotes without building an AST.
 *
 * @param payload Null-terminated JSON string
 * @return 0 if valid, or the 1-based line number of the first syntax error
 */
EMSCRIPTEN_KEEPALIVE
int validate_json(char *payload) {
    if (!payload) return 1;

    const char *p = payload;
    int line = 1;

    // Fast skip leading whitespace
    while (*p && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')) {
        if (*p == '\n') line++;
        p++;
    }

    if (*p == '\0') {
        return line;
    }

    size_t stack_cap = 256;
    char *char_stack = (char*)malloc(stack_cap);
    int *line_stack = (int*)malloc(stack_cap * sizeof(int));
    if (!char_stack || !line_stack) {
        free(char_stack);
        free(line_stack);
        return 1;
    }

    size_t top = 0;
    bool in_string = false;
    int string_start_line = 1;

    while (*p) {
        char c = *p;

        if (c == '\n') {
            line++;
            p++;
            continue;
        }

        if (in_string) {
            if (c == '\\') {
                p++;
                if (*p == '\0') {
                    // Trailing backslash at EOF
                    free(char_stack);
                    free(line_stack);
                    return string_start_line;
                }
                if (*p == '\n') {
                    line++;
                }
                p++;
                continue;
            } else if (c == '"') {
                in_string = false;
            }
            p++;
            continue;
        }

        // Outside string literal
        if (c == '"') {
            in_string = true;
            string_start_line = line;
        } else if (c == '{') {
            if (top >= stack_cap) {
                stack_cap *= 2;
                char *new_chars = (char*)realloc(char_stack, stack_cap);
                int *new_lines = (int*)realloc(line_stack, stack_cap * sizeof(int));
                if (!new_chars || !new_lines) {
                    free(char_stack);
                    free(line_stack);
                    free(new_chars);
                    free(new_lines);
                    return line;
                }
                char_stack = new_chars;
                line_stack = new_lines;
            }
            char_stack[top] = '}';
            line_stack[top] = line;
            top++;
        } else if (c == '[') {
            if (top >= stack_cap) {
                stack_cap *= 2;
                char *new_chars = (char*)realloc(char_stack, stack_cap);
                int *new_lines = (int*)realloc(line_stack, stack_cap * sizeof(int));
                if (!new_chars || !new_lines) {
                    free(char_stack);
                    free(line_stack);
                    free(new_chars);
                    free(new_lines);
                    return line;
                }
                char_stack = new_chars;
                line_stack = new_lines;
            }
            char_stack[top] = ']';
            line_stack[top] = line;
            top++;
        } else if (c == '}' || c == ']') {
            if (top == 0 || char_stack[top - 1] != c) {
                free(char_stack);
                free(line_stack);
                return line;
            }
            top--;
        }

        p++;
    }

    if (in_string) {
        free(char_stack);
        free(line_stack);
        return string_start_line;
    }

    if (top > 0) {
        int err_line = line_stack[top - 1];
        free(char_stack);
        free(line_stack);
        return err_line;
    }

    free(char_stack);
    free(line_stack);
    return 0;
}
