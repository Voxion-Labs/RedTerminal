#include "validator.h"
#include <stdio.h>
#include <assert.h>

int main(void) {
    printf("Running test_validator...\n");

    // 1. Valid JSON object with nested array
    char valid1[] = "{\n"
                    "  \"name\": \"RedTerm\",\n"
                    "  \"version\": 1.0,\n"
                    "  \"features\": [\"wasm\", \"shell\"]\n"
                    "}";
    assert(validate_json(valid1) == 0);

    // 2. Valid empty object and array
    assert(validate_json("{}") == 0);
    assert(validate_json("[]") == 0);

    // 3. Valid JSON with escaped quotes and characters inside string
    char valid_escapes[] = "{\"msg\": \"hello \\\"world\\\" [not a bracket] {not a brace}\"}";
    assert(validate_json(valid_escapes) == 0);

    // 4. Mismatched bracket and brace
    char invalid1[] = "{\n"
                      "  \"items\": [1, 2, 3}\n"
                      "}";
    int err1 = validate_json(invalid1);
    assert(err1 == 2);

    // 5. Unclosed string
    char invalid2[] = "{\n"
                      "  \"unclosed: 123\n"
                      "}";
    int err2 = validate_json(invalid2);
    assert(err2 == 2);

    // 6. Unclosed opening brace at EOF
    char invalid3[] = "{\n"
                      "  \"a\": 1\n";
    int err3 = validate_json(invalid3);
    assert(err3 == 1);

    // 7. Unexpected extra closing brace
    char invalid4[] = "{}\n"
                      "}";
    int err4 = validate_json(invalid4);
    assert(err4 == 2);

    // 8. Empty input
    assert(validate_json("") == 1);
    assert(validate_json("   \n  \t  ") == 2);

    printf("All test_validator checks passed successfully!\n");
    return 0;
}
