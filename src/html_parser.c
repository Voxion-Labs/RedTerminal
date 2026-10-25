#include "html_parser.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <ctype.h>

// Dynamic buffer structure for safe pointer-based output accumulation
typedef struct {
    char *data;
    size_t size;
    size_t cap;
} ByteBuffer;

static inline void buf_init(ByteBuffer *b, size_t initial_cap) {
    if (initial_cap < 64) initial_cap = 64;
    b->data = (char*)malloc(initial_cap);
    b->size = 0;
    b->cap = b->data ? initial_cap : 0;
    if (b->data) b->data[0] = '\0';
}

static inline void buf_ensure_cap(ByteBuffer *b, size_t extra) {
    if (b->size + extra + 1 > b->cap) {
        size_t new_cap = (b->cap == 0) ? 128 : b->cap * 2;
        while (new_cap < b->size + extra + 1) {
            new_cap *= 2;
        }
        char *new_data = (char*)realloc(b->data, new_cap);
        if (new_data) {
            b->data = new_data;
            b->cap = new_cap;
        }
    }
}

static inline void buf_append_bytes(ByteBuffer *b, const char *src, size_t len) {
    if (!src || len == 0) return;
    buf_ensure_cap(b, len);
    if (!b->data) return;
    memcpy(b->data + b->size, src, len);
    b->size += len;
    b->data[b->size] = '\0';
}

static inline void buf_append_char(ByteBuffer *b, char c) {
    buf_ensure_cap(b, 1);
    if (!b->data) return;
    b->data[b->size++] = c;
    b->data[b->size] = '\0';
}

static inline void buf_append_str(ByteBuffer *b, const char *str) {
    if (!str) return;
    buf_append_bytes(b, str, strlen(str));
}

static inline char* buf_detach(ByteBuffer *b) {
    if (!b->data) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }
    char *shrunk = (char*)realloc(b->data, b->size + 1);
    return shrunk ? shrunk : b->data;
}

// Case-insensitive ASCII tag name match using pure pointer arithmetic
static inline bool match_tag_name(const char *p, const char *tag_name, size_t tag_len) {
    for (size_t i = 0; i < tag_len; i++) {
        char c1 = p[i];
        char c2 = tag_name[i];
        if (c1 >= 'A' && c1 <= 'Z') c1 = (char)(c1 + 32);
        if (c2 >= 'A' && c2 <= 'Z') c2 = (char)(c2 + 32);
        if (c1 != c2) return false;
    }
    // Tag boundary must be followed by space, newline, tab, slash or closing '>'
    char next = p[tag_len];
    return (next == '>' || next == ' ' || next == '\t' || next == '\n' || next == '\r' || next == '/');
}

// Advances past the opening tag's closing '>' ignoring any quotes inside attributes
static inline const char* find_tag_close_bracket(const char *p) {
    bool in_quote = false;
    char q_char = '\0';

    while (*p) {
        if (!in_quote && (*p == '\'' || *p == '"')) {
            in_quote = true;
            q_char = *p;
        } else if (in_quote && *p == q_char) {
            in_quote = false;
        } else if (!in_quote && *p == '>') {
            return p;
        }
        p++;
    }
    return NULL;
}

/**
 * Parses all <table>, <tr>, <th>, <td> elements from raw HTML into
 * RFC 4180 CSV formatted text using pure C pointer arithmetic.
 */
EMSCRIPTEN_KEEPALIVE
char* extract_tables_csv(char *raw_html) {
    if (!raw_html || *raw_html == '\0') {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    ByteBuffer out;
    buf_init(&out, 1024);

    const char *p = raw_html;
    int table_count = 0;

    while (*p) {
        // Find opening <table tag
        if (*p == '<' && *(p + 1) != '/' && match_tag_name(p + 1, "table", 5)) {
            const char *table_gt = find_tag_close_bracket(p + 6);
            if (!table_gt) {
                p++;
                continue;
            }

            table_count++;
            if (table_count > 1) {
                buf_append_str(&out, "\n");
            }
            char header_banner[64];
            int banner_len = snprintf(header_banner, sizeof(header_banner), "=== Table %d ===\n", table_count);
            buf_append_bytes(&out, header_banner, (size_t)banner_len);

            // Find matching </table>
            const char *tbl_content = table_gt + 1;
            const char *tbl_close = tbl_content;
            int depth = 1;
            while (*tbl_close) {
                if (*tbl_close == '<') {
                    if (*(tbl_close + 1) == '/' && match_tag_name(tbl_close + 2, "table", 5)) {
                        depth--;
                        if (depth == 0) break;
                    } else if (*(tbl_close + 1) != '/' && match_tag_name(tbl_close + 1, "table", 5)) {
                        depth++;
                    }
                }
                tbl_close++;
            }

            // Parse <tr> elements inside this table using pointer arithmetic
            const char *tr_scan = tbl_content;
            while (tr_scan < tbl_close) {
                if (*tr_scan == '<' && *(tr_scan + 1) != '/' && match_tag_name(tr_scan + 1, "tr", 2)) {
                    const char *tr_gt = find_tag_close_bracket(tr_scan + 3);
                    if (!tr_gt || tr_gt >= tbl_close) {
                        tr_scan++;
                        continue;
                    }

                    // Find matching </tr> or next <tr>
                    const char *tr_content = tr_gt + 1;
                    const char *tr_close = tr_content;
                    while (tr_close < tbl_close) {
                        if (*tr_close == '<') {
                            if (*(tr_close + 1) == '/' && match_tag_name(tr_close + 2, "tr", 2)) {
                                break;
                            }
                            if (*(tr_close + 1) != '/' && match_tag_name(tr_close + 1, "tr", 2)) {
                                break;
                            }
                        }
                        tr_close++;
                    }

                    // Parse cells (<th> or <td>) inside this row
                    const char *cell_scan = tr_content;
                    bool first_cell = true;

                    while (cell_scan < tr_close) {
                        if (*cell_scan == '<' && *(cell_scan + 1) != '/') {
                            bool is_th = match_tag_name(cell_scan + 1, "th", 2);
                            bool is_td = match_tag_name(cell_scan + 1, "td", 2);
                            if (is_th || is_td) {
                                const char *tag_sym = is_th ? "th" : "td";
                                const char *cell_gt = find_tag_close_bracket(cell_scan + 3);
                                if (!cell_gt || cell_gt >= tr_close) {
                                    cell_scan++;
                                    continue;
                                }

                                const char *cell_content = cell_gt + 1;
                                const char *cell_close = cell_content;
                                while (cell_close < tr_close) {
                                    if (*cell_close == '<') {
                                        if (*(cell_close + 1) == '/' && match_tag_name(cell_close + 2, tag_sym, 2)) {
                                            break;
                                        }
                                        if (*(cell_close + 1) != '/' && (match_tag_name(cell_close + 1, "td", 2) || match_tag_name(cell_close + 1, "th", 2))) {
                                            break;
                                        }
                                    }
                                    cell_close++;
                                }

                                // Extract plain text stripping inner tags
                                ByteBuffer cell_buf;
                                buf_init(&cell_buf, 64);
                                const char *txt = cell_content;
                                while (txt < cell_close) {
                                    if (*txt == '<') {
                                        // Skip inner HTML tags (e.g. <b>, <span>, <a>)
                                        while (txt < cell_close && *txt != '>') txt++;
                                        if (txt < cell_close && *txt == '>') txt++;
                                        continue;
                                    }
                                    // Collapse extra whitespaces
                                    if (*txt == '\r' || *txt == '\n' || *txt == '\t') {
                                        buf_append_char(&cell_buf, ' ');
                                    } else {
                                        buf_append_char(&cell_buf, *txt);
                                    }
                                    txt++;
                                }

                                // Trim cell string
                                char *raw_cell = buf_detach(&cell_buf);
                                char *start = raw_cell;
                                while (*start == ' ') start++;
                                size_t clen = strlen(start);
                                while (clen > 0 && start[clen - 1] == ' ') {
                                    start[--clen] = '\0';
                                }

                                if (!first_cell) {
                                    buf_append_char(&out, ',');
                                }
                                first_cell = false;

                                // Quote escape if needed
                                bool needs_quotes = (strchr(start, ',') != NULL || strchr(start, '"') != NULL || strchr(start, '\n') != NULL);
                                if (needs_quotes) {
                                    buf_append_char(&out, '"');
                                    for (size_t k = 0; k < clen; k++) {
                                        if (start[k] == '"') {
                                            buf_append_char(&out, '"');
                                            buf_append_char(&out, '"');
                                        } else {
                                            buf_append_char(&out, start[k]);
                                        }
                                    }
                                    buf_append_char(&out, '"');
                                } else {
                                    buf_append_bytes(&out, start, clen);
                                }
                                free(raw_cell);

                                cell_scan = cell_close;
                                continue;
                            }
                        }
                        cell_scan++;
                    }

                    if (!first_cell) {
                        buf_append_char(&out, '\n');
                    }
                    tr_scan = tr_close;
                    continue;
                }
                tr_scan++;
            }

            p = (tbl_close < raw_html + strlen(raw_html)) ? tbl_close : p + 1;
            continue;
        }
        p++;
    }

    return buf_detach(&out);
}

/**
 * Pure C HTML parser using pointer arithmetic.
 * Scans raw_html for target_tag (e.g. <table>, <script>, <div>) and
 * extracts matching tag blocks into a newly allocated buffer.
 */
EMSCRIPTEN_KEEPALIVE
char* extract_page_data(char *raw_html, char *target_tag) {
    if (!raw_html || *raw_html == '\0') {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    if (!target_tag || *target_tag == '\0') {
        char *copy = (char*)malloc(strlen(raw_html) + 1);
        if (copy) strcpy(copy, raw_html);
        return copy;
    }

    // Direct routing for CSV conversion requests
    if (strcmp(target_tag, "csv") == 0 || strcmp(target_tag, "table_csv") == 0) {
        return extract_tables_csv(raw_html);
    }

    // Normalize tag name (strip leading '<' and trailing '>')
    const char *tag_name = target_tag;
    while (*tag_name == '<' || *tag_name == ' ' || *tag_name == '\t') {
        tag_name++;
    }
    const char *tag_end = tag_name;
    while (*tag_end && *tag_end != '>' && *tag_end != ' ' && *tag_end != '\t' && *tag_end != '/') {
        tag_end++;
    }
    size_t tag_len = (size_t)(tag_end - tag_name);
    if (tag_len == 0) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    ByteBuffer out;
    buf_init(&out, strlen(raw_html) / 2 + 128);

    const char *p = raw_html;

    while (*p) {
        // Check for opening tag: '<' followed by tag_name
        if (*p == '<' && *(p + 1) != '/' && *(p + 1) != '!' && *(p + 1) != '?') {
            if (match_tag_name(p + 1, tag_name, tag_len)) {
                const char *open_tag_start = p;
                const char *open_tag_gt = find_tag_close_bracket(p + 1 + tag_len);
                if (!open_tag_gt) {
                    p++;
                    continue;
                }

                // Check for self-closing tag: <tag ... />
                bool self_closing = (*(open_tag_gt - 1) == '/');
                const char *block_end = NULL;

                if (self_closing) {
                    block_end = open_tag_gt + 1;
                } else {
                    // Search forward for matching closing tag with depth tracking
                    int depth = 1;
                    const char *scan = open_tag_gt + 1;

                    while (*scan) {
                        if (*scan == '<') {
                            if (*(scan + 1) == '/' && match_tag_name(scan + 2, tag_name, tag_len)) {
                                depth--;
                                if (depth == 0) {
                                    const char *close_gt = find_tag_close_bracket(scan + 2 + tag_len);
                                    block_end = close_gt ? close_gt + 1 : scan + 2 + tag_len;
                                    break;
                                }
                            } else if (*(scan + 1) != '/' && *(scan + 1) != '!' && *(scan + 1) != '?') {
                                if (match_tag_name(scan + 1, tag_name, tag_len)) {
                                    depth++;
                                }
                            }
                        }
                        scan++;
                    }

                    if (!block_end) {
                        // Unclosed tag: capture to end of scan
                        block_end = scan;
                    }
                }

                // Append extracted tag block using pointer arithmetic
                size_t block_len = (size_t)(block_end - open_tag_start);
                buf_append_bytes(&out, open_tag_start, block_len);
                buf_append_char(&out, '\n');

                p = block_end;
                continue;
            }
        }
        p++;
    }

    return buf_detach(&out);
}
