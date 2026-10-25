#ifndef HTML_PARSER_H
#define HTML_PARSER_H

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

#include <stddef.h>

/**
 * Pure C HTML parser using pointer arithmetic.
 * Scans raw_html for target_tag (e.g. <table>, <script>, <div>) and
 * extracts matching tag blocks into a newly allocated buffer.
 *
 * @param raw_html   Null-terminated raw HTML string
 * @param target_tag Target tag name to search for (e.g. "table", "script", "a")
 * @return Newly allocated null-terminated buffer with extracted tags (caller frees via free())
 */
EMSCRIPTEN_KEEPALIVE
char* extract_page_data(char *raw_html, char *target_tag);

/**
 * Pure C table parser using pointer arithmetic.
 * Parses all <table>, <tr>, <th>, <td> elements from raw HTML into
 * RFC 4180 CSV formatted text.
 *
 * @param raw_html Null-terminated raw HTML string
 * @return Newly allocated null-terminated CSV string (caller frees via free())
 */
EMSCRIPTEN_KEEPALIVE
char* extract_tables_csv(char *raw_html);

#endif // HTML_PARSER_H
