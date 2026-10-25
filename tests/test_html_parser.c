#include "html_parser.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

int main(void) {
    printf("Running test_html_parser...\n");

    char html1[] =
        "<!DOCTYPE html>\n"
        "<html>\n"
        "<head>\n"
        "  <script src=\"https://ads.example.com/banner.js\"></script>\n"
        "  <script>console.log('tracker');</script>\n"
        "</head>\n"
        "<body>\n"
        "  <h1>Sample Page</h1>\n"
        "  <table id=\"team-table\">\n"
        "    <tr><th>ID</th><th>Name</th></tr>\n"
        "    <tr><td>101</td><td>Alice Smith</td></tr>\n"
        "    <tr><td>102</td><td>Bob Jones</td></tr>\n"
        "  </table>\n"
        "  <div><p>Footer text</p></div>\n"
        "</body>\n"
        "</html>\n";

    // Test 1: Extract <table> tags
    char *tables = extract_page_data(html1, "table");
    assert(tables != NULL);
    assert(strstr(tables, "<table id=\"team-table\">") != NULL);
    assert(strstr(tables, "Alice Smith") != NULL);
    assert(strstr(tables, "Bob Jones") != NULL);
    assert(strstr(tables, "<script") == NULL);
    assert(strstr(tables, "<h1>") == NULL);
    free(tables);

    // Test 2: Extract <script> tags for ads/trackers
    char *scripts = extract_page_data(html1, "<script>");
    assert(scripts != NULL);
    assert(strstr(scripts, "ads.example.com/banner.js") != NULL);
    assert(strstr(scripts, "console.log('tracker');") != NULL);
    assert(strstr(scripts, "<table") == NULL);
    free(scripts);

    // Test 3: Extract tables as RFC 4180 CSV
    char *csv = extract_tables_csv(html1);
    assert(csv != NULL);
    assert(strstr(csv, "ID,Name") != NULL);
    assert(strstr(csv, "101,Alice Smith") != NULL);
    assert(strstr(csv, "102,Bob Jones") != NULL);
    free(csv);

    // Test 4: Target tag not found
    char *none = extract_page_data(html1, "video");
    assert(none != NULL);
    assert(strlen(none) == 0);
    free(none);

    // Test 5: Null / Empty input
    char *empty = extract_page_data(NULL, "table");
    assert(empty != NULL);
    assert(strlen(empty) == 0);
    free(empty);

    printf("All test_html_parser checks passed successfully!\n");
    return 0;
}
