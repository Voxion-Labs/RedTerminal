#define __USE_MINGW_ANSI_STDIO 1
#include "scanner.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <math.h>

// Dynamic buffer structure for safe pointer-based output accumulation
typedef struct {
    char *data;
    size_t size;
    size_t cap;
} ByteBuffer;

static inline void buf_init(ByteBuffer *b, size_t initial_cap) {
    if (initial_cap < 128) initial_cap = 128;
    b->data = (char*)malloc(initial_cap);
    b->size = 0;
    b->cap = b->data ? initial_cap : 0;
    if (b->data) b->data[0] = '\0';
}

static inline void buf_ensure_cap(ByteBuffer *b, size_t extra) {
    if (b->size + extra + 1 > b->cap) {
        size_t new_cap = (b->cap == 0) ? 256 : b->cap * 2;
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

// Pure pointer arithmetic character classifications
static inline bool is_alphanumeric(char c) {
    return (c >= '0' && c <= '9') ||
           (c >= 'A' && c <= 'Z') ||
           (c >= 'a' && c <= 'z');
}

static inline bool is_hex_digit(char c) {
    return (c >= '0' && c <= '9') ||
           (c >= 'A' && c <= 'F') ||
           (c >= 'a' && c <= 'f');
}

static inline bool is_token_char(char c) {
    return is_alphanumeric(c) ||
           c == '+' || c == '/' || c == '=' ||
           c == '_' || c == '-' || c == '.';
}

static inline bool is_token_delimiter(char c) {
    return ((unsigned char)c <= 32) ||
           c == '"' || c == '\'' || c == '`' ||
           c == '<' || c == '>' || c == '(' || c == ')' ||
           c == '{' || c == '}' || c == '[' || c == ']' ||
           c == ',' || c == ';' || c == '=' || c == ':' ||
           c == '&' || c == '?' || c == '|' || c == '\\';
}

// Shannon entropy calculation over [p, p + len) using natural log conversion
static double calculate_entropy(const char *str, size_t len) {
    if (!str || len == 0) return 0.0;
    size_t counts[256] = {0};
    const unsigned char *p = (const unsigned char*)str;
    for (size_t i = 0; i < len; i++) {
        counts[p[i]]++;
    }

    double entropy = 0.0;
    double dlen = (double)len;
    const double ln2 = 0.693147180559945309417; // ln(2)

    for (int i = 0; i < 256; i++) {
        if (counts[i] > 0) {
            double prob = (double)counts[i] / dlen;
            entropy -= prob * (log(prob) / ln2);
        }
    }
    return entropy;
}

// Lookback in preceding text (up to 48 chars) for secret-associated keywords
static bool has_preceding_secret_keyword(const char *text, const char *match_start) {
    if (match_start <= text) return false;
    const char *limit = (match_start - text > 48) ? match_start - 48 : text;

    static const char *keywords[] = {
        "secret", "key", "token", "password", "passwd", "auth",
        "bearer", "credential", "private", "access_key", "api", "apikey"
    };
    const size_t kw_count = sizeof(keywords) / sizeof(keywords[0]);

    for (const char *p = limit; p < match_start; p++) {
        for (size_t k = 0; k < kw_count; k++) {
            size_t kw_len = strlen(keywords[k]);
            if ((size_t)(match_start - p) >= kw_len) {
                bool match = true;
                for (size_t i = 0; i < kw_len; i++) {
                    char c = p[i];
                    if (c >= 'A' && c <= 'Z') c += ('a' - 'A'); // lowercase
                    if (c != keywords[k][i]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    bool left_boundary = (p == text || !is_alphanumeric(*(p - 1)));
                    bool right_boundary = (!is_alphanumeric(p[kw_len]));
                    if (left_boundary && right_boundary) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// Check for sequential character runs (e.g. "abcdefgh", "12345678")
static bool is_sequential_or_repetitive(const char *str, size_t len) {
    if (len < 4) return false;
    size_t transitions = 0;
    size_t repetitions = 0;

    for (size_t i = 1; i < len; i++) {
        if (str[i] == str[i - 1] + 1) transitions++;
        if (str[i] == str[i - 1]) repetitions++;
    }

    if (transitions * 2 >= len || repetitions * 2 >= len) {
        return true;
    }
    return false;
}

// Count character class distribution
static void analyze_classes(const char *str, size_t len, int *out_upper, int *out_lower, int *out_digits, int *out_special) {
    int upper = 0, lower = 0, digits = 0, special = 0;
    for (size_t i = 0; i < len; i++) {
        char c = str[i];
        if (c >= 'A' && c <= 'Z') upper++;
        else if (c >= 'a' && c <= 'z') lower++;
        else if (c >= '0' && c <= '9') digits++;
        else special++;
    }
    *out_upper = upper;
    *out_lower = lower;
    *out_digits = digits;
    *out_special = special;
}

// -------------------------------------------------------------
// Prefix Matchers using Pure Pointer Arithmetic
// -------------------------------------------------------------

// AWS Access Key ID: "AKIA" or "ASIA" followed by 16 uppercase alphanumeric chars
static bool match_aws_key(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining < 20) return false;

    bool is_akia = (p[0] == 'A' && p[1] == 'K' && p[2] == 'I' && p[3] == 'A');
    bool is_asia = (p[0] == 'A' && p[1] == 'S' && p[2] == 'I' && p[3] == 'A');
    bool is_abia = (p[0] == 'A' && p[1] == 'B' && p[2] == 'I' && p[3] == 'A');
    bool is_acca = (p[0] == 'A' && p[1] == 'C' && p[2] == 'C' && p[3] == 'A');

    if (!is_akia && !is_asia && !is_abia && !is_acca) return false;

    for (size_t i = 4; i < 20; i++) {
        char c = p[i];
        if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z'))) {
            return false;
        }
    }

    if (remaining > 20 && is_alphanumeric(p[20])) {
        return false;
    }

    *out_len = 20;
    if (is_akia) *out_subtype = "AWS Access Key ID";
    else if (is_asia) *out_subtype = "AWS Temp Access Key ID (STS)";
    else *out_subtype = "AWS Account/Service Key ID";
    return true;
}

// Stripe Key: "sk_live_", "rk_live_", "sk_test_", "rk_test_" followed by 24+ chars
static bool match_stripe_key(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining < 32) return false;

    const char *subtype = NULL;
    if (memcmp(p, "sk_live_", 8) == 0) subtype = "Stripe Live Secret Key";
    else if (memcmp(p, "rk_live_", 8) == 0) subtype = "Stripe Live Restricted Key";
    else if (memcmp(p, "sk_test_", 8) == 0) subtype = "Stripe Test Secret Key";
    else if (memcmp(p, "rk_test_", 8) == 0) subtype = "Stripe Test Restricted Key";
    else return false;

    size_t len = 8;
    while (len < remaining && is_alphanumeric(p[len])) {
        len++;
    }

    if (len - 8 < 24) return false;

    *out_len = len;
    *out_subtype = subtype;
    return true;
}

// GitHub Tokens: "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"
static bool match_github_token(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining >= 34 && (
        memcmp(p, "ghp_", 4) == 0 ||
        memcmp(p, "gho_", 4) == 0 ||
        memcmp(p, "ghu_", 4) == 0 ||
        memcmp(p, "ghs_", 4) == 0 ||
        memcmp(p, "ghr_", 4) == 0
    )) {
        size_t len = 4;
        while (len < remaining && is_alphanumeric(p[len])) {
            len++;
        }
        if (len >= 34) {
            *out_len = len;
            if (memcmp(p, "ghp_", 4) == 0) *out_subtype = "GitHub Personal Access Token";
            else *out_subtype = "GitHub OAuth/App Access Token";
            return true;
        }
        return false;
    }

    if (remaining >= 80 && memcmp(p, "github_pat_", 11) == 0) {
        size_t len = 11;
        while (len < remaining && (is_alphanumeric(p[len]) || p[len] == '_')) len++;
        if (len >= 80) {
            *out_len = len;
            *out_subtype = "GitHub Fine-Grained Personal Access Token";
            return true;
        }
    }

    return false;
}

// GitLab Token: "glpat-" followed by 20+ chars
static bool match_gitlab_token(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining < 26) return false;
    if (memcmp(p, "glpat-", 6) != 0) return false;

    size_t len = 6;
    while (len < remaining && (is_alphanumeric(p[len]) || p[len] == '-' || p[len] == '_')) {
        len++;
    }

    if (len - 6 < 20) return false;

    *out_len = len;
    *out_subtype = "GitLab Personal Access Token";
    return true;
}

// Slack Token: "xoxb-", "xoxp-", "xoxa-"
static bool match_slack_token(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining < 24) return false;
    if (memcmp(p, "xoxb-", 5) != 0 && memcmp(p, "xoxp-", 5) != 0 && memcmp(p, "xoxa-", 5) != 0) {
        return false;
    }

    size_t len = 5;
    while (len < remaining && (is_alphanumeric(p[len]) || p[len] == '-')) {
        len++;
    }

    if (len < 24) return false;

    *out_len = len;
    if (memcmp(p, "xoxb-", 5) == 0) *out_subtype = "Slack Bot Token";
    else if (memcmp(p, "xoxp-", 5) == 0) *out_subtype = "Slack User Token";
    else *out_subtype = "Slack API Token";
    return true;
}

// Google / Firebase API Key: "AIza" followed by 35 chars
static bool match_google_key(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining < 39) return false;
    if (memcmp(p, "AIza", 4) != 0) return false;

    for (size_t i = 4; i < 39; i++) {
        char c = p[i];
        if (!is_alphanumeric(c) && c != '_' && c != '-') {
            return false;
        }
    }

    if (remaining > 39 && (is_alphanumeric(p[39]) || p[39] == '_' || p[39] == '-')) {
        return false;
    }

    *out_len = 39;
    *out_subtype = "Google / Firebase API Key";
    return true;
}

// Private Key Header Block: "-----BEGIN ... PRIVATE KEY-----"
static bool match_private_key(const char *p, size_t remaining, size_t *out_len, const char **out_subtype) {
    if (remaining < 27) return false;
    if (memcmp(p, "-----BEGIN ", 11) != 0) return false;

    const char *end = p + 11;
    const char *limit = p + (remaining < 64 ? remaining : 64);

    while (end + 16 <= limit) {
        if (memcmp(end, "PRIVATE KEY-----", 16) == 0) {
            *out_len = (size_t)((end + 16) - p);
            *out_subtype = "Cryptographic Private Key Block";
            return true;
        }
        end++;
    }

    return false;
}

// -------------------------------------------------------------
// Core Exported Function: scan_secrets
// -------------------------------------------------------------

EMSCRIPTEN_KEEPALIVE
char* scan_secrets(char *text) {
    ByteBuffer out;
    buf_init(&out, 512);

    if (!text || *text == '\0') {
        buf_append_str(&out, "[CLEAN] Zero-Trust Scanner: Empty input. 0 vulnerabilities detected.\n");
        return buf_detach(&out);
    }

    size_t text_len = strlen(text);
    const char *p = text;
    const char *text_end = text + text_len;

    size_t line_num = 1;
    size_t col_num = 1;
    size_t vuln_count = 0;

    ByteBuffer findings;
    buf_init(&findings, 512);

    while (p < text_end) {
        char c = *p;

        if (c == '\n') {
            line_num++;
            col_num = 1;
            p++;
            continue;
        }

        size_t remaining = (size_t)(text_end - p);
        bool found = false;
        size_t match_len = 0;
        const char *rule_type = NULL;
        const char *severity = "HIGH";
        const char *action_desc = "Revoke and rotate exposed credential immediately.";
        double match_entropy = 0.0;

        // Ensure boundary preceding token
        bool left_boundary = (p == text || is_token_delimiter(*(p - 1)));

        // 1. Sliding window check: Known secret prefixes
        if (left_boundary) {
            if (match_aws_key(p, remaining, &match_len, &rule_type)) {
                severity = "CRITICAL";
                action_desc = "Revoke AWS IAM access key immediately via AWS Console / IAM.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            } else if (match_stripe_key(p, remaining, &match_len, &rule_type)) {
                severity = (strstr(rule_type, "Live") != NULL) ? "CRITICAL" : "MEDIUM";
                action_desc = "Rotate Stripe secret key in Stripe Dashboard API settings.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            } else if (match_github_token(p, remaining, &match_len, &rule_type)) {
                severity = "CRITICAL";
                action_desc = "Revoke GitHub access token immediately in developer settings.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            } else if (match_gitlab_token(p, remaining, &match_len, &rule_type)) {
                severity = "CRITICAL";
                action_desc = "Revoke GitLab personal access token immediately.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            } else if (match_slack_token(p, remaining, &match_len, &rule_type)) {
                severity = "HIGH";
                action_desc = "Revoke Slack token in Slack API app settings.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            } else if (match_google_key(p, remaining, &match_len, &rule_type)) {
                severity = "HIGH";
                action_desc = "Restrict or revoke Google Cloud API key in GCP Console.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            } else if (match_private_key(p, remaining, &match_len, &rule_type)) {
                severity = "CRITICAL";
                action_desc = "Private key exposed. Regenerate keypair and replace certificate.";
                match_entropy = calculate_entropy(p, match_len);
                found = true;
            }
        }

        // 2. Sliding window check: Generic high-entropy strings & candidate tokens
        if (!found && left_boundary) {
            const char *token_start = p;
            const char *token_cur = token_start;

            while (token_cur < text_end && is_token_char(*token_cur)) {
                token_cur++;
            }

            size_t token_len = (size_t)(token_cur - token_start);

            if (token_len >= 16 && token_len <= 128) {
                // Check if preceded by a sensitive assignment/keyword
                bool has_keyword = has_preceding_secret_keyword(text, token_start);

                int upper = 0, lower = 0, digits = 0, special = 0;
                analyze_classes(token_start, token_len, &upper, &lower, &digits, &special);

                int classes_present = (upper > 0) + (lower > 0) + (digits > 0) + (special > 0);
                bool not_repetitive = !is_sequential_or_repetitive(token_start, token_len);

                if (not_repetitive) {
                    // Check sub-window entropy (width 32) or full token entropy
                    size_t win_size = (token_len < 32) ? token_len : 32;
                    double max_win_entropy = 0.0;

                    for (size_t offset = 0; offset + win_size <= token_len; offset += 4) {
                        double win_ent = calculate_entropy(token_start + offset, win_size);
                        if (win_ent > max_win_entropy) {
                            max_win_entropy = win_ent;
                        }
                    }

                    // Pure hex token check (e.g., MD5 / SHA256 / API token)
                    bool is_hex = (upper + lower + digits == (int)token_len) && (special == 0);
                    if (is_hex) {
                        for (size_t i = 0; i < token_len; i++) {
                            if (!is_hex_digit(token_start[i])) {
                                is_hex = false;
                                break;
                            }
                        }
                    }

                    if (has_keyword) {
                        if (is_hex && token_len >= 24 && max_win_entropy >= 3.2) {
                            match_len = token_len;
                            rule_type = "High-Entropy Hex Secret (Keyword Associated)";
                            severity = "HIGH";
                            action_desc = "Potential cryptographic secret or API token in configuration.";
                            match_entropy = max_win_entropy;
                            found = true;
                        } else if (classes_present >= 2 && max_win_entropy >= 3.6) {
                            match_len = token_len;
                            rule_type = "High-Entropy Secret / Token (Keyword Associated)";
                            severity = "HIGH";
                            action_desc = "Verify if token is an active credential or secret key.";
                            match_entropy = max_win_entropy;
                            found = true;
                        }
                    } else {
                        // High entropy without explicit keyword: require high randomness & mixed classes
                        if (token_len >= 24 && classes_present >= 3 && max_win_entropy >= 4.2) {
                            match_len = token_len;
                            rule_type = "Generic High-Entropy Secret (High Randomness)";
                            severity = "MEDIUM";
                            action_desc = "High-entropy token detected. Review for exposed credentials.";
                            match_entropy = max_win_entropy;
                            found = true;
                        }
                    }
                }
            }
        }

        // If a vulnerability was identified at current pointer
        if (found && match_len > 0) {
            vuln_count++;

            char entry[512];
            char preview[72];

            // Safely truncate match preview if exceptionally long
            if (match_len > 48) {
                memcpy(preview, p, 24);
                preview[24] = '\0';
                strcat(preview, "...[REDACTED]...");
                strncat(preview, p + match_len - 12, 12);
            } else {
                memcpy(preview, p, match_len);
                preview[match_len] = '\0';
            }

            snprintf(entry, sizeof(entry),
                "[VULN #%lu] %s - %s\n"
                "  Location: Line %lu, Column %lu\n"
                "  Entropy:  %.2f bits/char\n"
                "  Match:    %s\n"
                "  Action:   %s\n\n",
                (unsigned long)vuln_count, severity, rule_type,
                (unsigned long)line_num, (unsigned long)col_num,
                match_entropy,
                preview,
                action_desc
            );

            buf_append_str(&findings, entry);

            // Advance pointer past matched secret
            p += match_len;
            col_num += match_len;
            continue;
        }

        p++;
        col_num++;
    }

    if (vuln_count > 0) {
        char header[256];
        snprintf(header, sizeof(header),
            "[!] ZERO-TRUST SCANNER: %lu VULNERABILITY(IES) DETECTED\n"
            "================================================================================\n",
            (unsigned long)vuln_count
        );
        buf_append_str(&out, header);
        buf_append_bytes(&out, findings.data, findings.size);

        char footer[128];
        snprintf(footer, sizeof(footer),
            "================================================================================\n"
            "Summary: %lu security vulnerability(ies) identified in text.\n",
            (unsigned long)vuln_count
        );
        buf_append_str(&out, footer);
    } else {
        buf_append_str(&out,
            "[CLEAN] Zero-Trust Scanner: 0 vulnerabilities detected.\n"
            "No known secret prefixes or high-entropy tokens found.\n"
        );
    }

    if (findings.data) free(findings.data);
    return buf_detach(&out);
}
