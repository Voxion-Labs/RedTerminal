#include "scanner.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

int main(void) {
    printf("Running test_scanner...\n");

    // 1. Clean text test
    char clean_text[] = "Hello world! This is a benign text without any API credentials or tokens.";
    char *report1 = scan_secrets(clean_text);
    assert(report1 != NULL);
    assert(strstr(report1, "[CLEAN]") != NULL);
    assert(strstr(report1, "0 vulnerabilities detected") != NULL);
    free(report1);
    printf("PASS: Clean text produced 0 vulnerabilities.\n");

    // 2. AWS Key detection test
    char aws_text[] = "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nexport REGION=us-east-1";
    char *report2 = scan_secrets(aws_text);
    assert(report2 != NULL);
    assert(strstr(report2, "[!] ZERO-TRUST SCANNER") != NULL);
    assert(strstr(report2, "AWS Access Key ID") != NULL);
    assert(strstr(report2, "AKIAIOSFODNN7EXAMPLE") != NULL);
    assert(strstr(report2, "CRITICAL") != NULL);
    free(report2);
    printf("PASS: AWS Access Key ID detected with CRITICAL severity.\n");

    // 3. Stripe Key detection test (dynamically formatted to prevent false-positive GitHub push protection blocks)
    char stripe_text[128];
    snprintf(stripe_text, sizeof(stripe_text), "const stripe = require('stripe')('%s%s%s');",
             "sk_", "live_", "0123456789abcdefghijklmnopqrstuvwxyz");
    char *report3 = scan_secrets(stripe_text);
    assert(report3 != NULL);
    assert(strstr(report3, "Stripe Live Secret Key") != NULL);
    assert(strstr(report3, "sk_live_") != NULL);
    assert(strstr(report3, "CRITICAL") != NULL);
    free(report3);
    printf("PASS: Stripe Live Secret Key detected with CRITICAL severity.\n");

    // 4. GitHub Token detection test
    char gh_text[] = "git config github.token ghp_0123456789abcdefghijklmnopqrstuvwxyz01";
    char *report4 = scan_secrets(gh_text);
    assert(report4 != NULL);
    assert(strstr(report4, "GitHub Personal Access Token") != NULL);
    assert(strstr(report4, "ghp_") != NULL);
    free(report4);
    printf("PASS: GitHub PAT detected.\n");

    // 5. High-Entropy Secret with Keyword detection test
    char secret_text[] = "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    char *report5 = scan_secrets(secret_text);
    assert(report5 != NULL);
    assert(strstr(report5, "High-Entropy Secret") != NULL);
    free(report5);
    printf("PASS: High-Entropy Secret detected.\n");

    // 6. Multiple vulnerabilities in multi-line text
    char multi_text[256];
    snprintf(multi_text, sizeof(multi_text),
        "Line 1: safe\n"
        "Line 2: aws_key=AKIAIOSFODNN7EXAMPLE\n"
        "Line 3: stripe=%s%s%s\n"
        "Line 4: safe line again\n",
        "sk_", "live_", "0123456789abcdefghijklmnopqrstuvwxyz"
    );
    char *report6 = scan_secrets(multi_text);
    assert(report6 != NULL);
    assert(strstr(report6, "2 VULNERABILITY(IES) DETECTED") != NULL);
    assert(strstr(report6, "Line 2") != NULL);
    assert(strstr(report6, "Line 3") != NULL);
    free(report6);
    printf("PASS: Multi-line text correctly tracked line numbers for multiple vulnerabilities.\n");

    // 7. NULL and empty string handling
    char *null_rep = scan_secrets(NULL);
    assert(null_rep != NULL);
    assert(strstr(null_rep, "[CLEAN]") != NULL);
    free(null_rep);

    char *empty_rep = scan_secrets("");
    assert(empty_rep != NULL);
    assert(strstr(empty_rep, "[CLEAN]") != NULL);
    free(empty_rep);
    printf("PASS: NULL and empty strings handled safely.\n");

    printf("All test_scanner checks passed successfully!\n");
    return 0;
}
