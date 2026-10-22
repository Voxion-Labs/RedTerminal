#include "crypto.h"
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

// ==========================================
// Base64 Implementation (RFC 4648)
// ==========================================
static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

EMSCRIPTEN_KEEPALIVE
char* base64_encode(const char *input) {
    if (!input) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    size_t in_len = strlen(input);
    size_t out_len = 4 * ((in_len + 2) / 3);
    char *out = (char*)malloc(out_len + 1);
    if (!out) return NULL;

    const unsigned char *src = (const unsigned char*)input;
    char *dst = out;
    size_t i = 0;

    while (i + 2 < in_len) {
        uint32_t triple = ((uint32_t)src[i] << 16) | ((uint32_t)src[i + 1] << 8) | (uint32_t)src[i + 2];
        *dst++ = b64_table[(triple >> 18) & 0x3F];
        *dst++ = b64_table[(triple >> 12) & 0x3F];
        *dst++ = b64_table[(triple >> 6) & 0x3F];
        *dst++ = b64_table[triple & 0x3F];
        i += 3;
    }

    if (i < in_len) {
        size_t rem = in_len - i;
        if (rem == 1) {
            uint32_t triple = ((uint32_t)src[i] << 16);
            *dst++ = b64_table[(triple >> 18) & 0x3F];
            *dst++ = b64_table[(triple >> 12) & 0x3F];
            *dst++ = '=';
            *dst++ = '=';
        } else if (rem == 2) {
            uint32_t triple = ((uint32_t)src[i] << 16) | ((uint32_t)src[i + 1] << 8);
            *dst++ = b64_table[(triple >> 18) & 0x3F];
            *dst++ = b64_table[(triple >> 12) & 0x3F];
            *dst++ = b64_table[(triple >> 6) & 0x3F];
            *dst++ = '=';
        }
    }

    *dst = '\0';
    return out;
}

static int b64_decode_char(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

EMSCRIPTEN_KEEPALIVE
char* base64_decode(const char *input) {
    if (!input) {
        char *empty = (char*)malloc(1);
        if (empty) *empty = '\0';
        return empty;
    }

    size_t in_len = strlen(input);
    char *out = (char*)malloc(in_len + 1);
    if (!out) return NULL;

    unsigned char *dst = (unsigned char*)out;
    uint32_t buffer = 0;
    int bits = 0;

    for (size_t i = 0; i < in_len; i++) {
        char c = input[i];
        if (c == '=' || c == ' ' || c == '\n' || c == '\r' || c == '\t') {
            continue;
        }
        int val = b64_decode_char(c);
        if (val < 0) continue;

        buffer = (buffer << 6) | (uint32_t)val;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            *dst++ = (unsigned char)((buffer >> bits) & 0xFF);
        }
    }

    *dst = '\0';
    return out;
}

// ==========================================
// SHA-256 Implementation (FIPS 180-4)
// ==========================================
#define ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))
#define CH(x, y, z) (((x) & (y)) ^ (~(x) & (z)))
#define MAJ(x, y, z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))
#define SIGMA0(x) (ROTR(x, 2) ^ ROTR(x, 13) ^ ROTR(x, 22))
#define SIGMA1(x) (ROTR(x, 6) ^ ROTR(x, 11) ^ ROTR(x, 25))
#define sigma0(x) (ROTR(x, 7) ^ ROTR(x, 18) ^ ((x) >> 3))
#define sigma1(x) (ROTR(x, 17) ^ ROTR(x, 19) ^ ((x) >> 10))

static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

EMSCRIPTEN_KEEPALIVE
char* sha256_hash(const char *input) {
    if (!input) input = "";

    size_t len = strlen(input);

    // Initial hash values
    uint32_t H[8] = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };

    // Calculate padded length in 64-byte blocks
    size_t padded_len = ((len + 8) / 64 + 1) * 64;
    uint8_t *msg = (uint8_t*)calloc(1, padded_len);
    if (!msg) return NULL;

    memcpy(msg, input, len);
    msg[len] = 0x80;

    // Append 64-bit length in big-endian
    uint64_t bit_len = (uint64_t)len * 8;
    for (int i = 0; i < 8; i++) {
        msg[padded_len - 1 - i] = (uint8_t)((bit_len >> (i * 8)) & 0xFF);
    }

    // Process each 512-bit (64-byte) chunk
    for (size_t chunk = 0; chunk < padded_len; chunk += 64) {
        uint32_t W[64];
        const uint8_t *block = msg + chunk;

        for (int t = 0; t < 16; t++) {
            W[t] = ((uint32_t)block[t * 4] << 24) |
                   ((uint32_t)block[t * 4 + 1] << 16) |
                   ((uint32_t)block[t * 4 + 2] << 8) |
                   ((uint32_t)block[t * 4 + 3]);
        }
        for (int t = 16; t < 64; t++) {
            W[t] = sigma1(W[t - 2]) + W[t - 7] + sigma0(W[t - 15]) + W[t - 16];
        }

        uint32_t a = H[0];
        uint32_t b = H[1];
        uint32_t c = H[2];
        uint32_t d = H[3];
        uint32_t e = H[4];
        uint32_t f = H[5];
        uint32_t g = H[6];
        uint32_t h = H[7];

        for (int t = 0; t < 64; t++) {
            uint32_t T1 = h + SIGMA1(e) + CH(e, f, g) + K[t] + W[t];
            uint32_t T2 = SIGMA0(a) + MAJ(a, b, c);
            h = g;
            g = f;
            f = e;
            e = d + T1;
            d = c;
            c = b;
            b = a;
            a = T1 + T2;
        }

        H[0] += a;
        H[1] += b;
        H[2] += c;
        H[3] += d;
        H[4] += e;
        H[5] += f;
        H[6] += g;
        H[7] += h;
    }

    free(msg);

    // Format digest as 64-character lowercase hex string
    char *hex_out = (char*)malloc(65);
    if (!hex_out) return NULL;

    static const char hex_chars[] = "0123456789abcdef";
    for (int i = 0; i < 8; i++) {
        for (int j = 0; j < 4; j++) {
            uint8_t byte = (uint8_t)((H[i] >> (24 - j * 8)) & 0xFF);
            hex_out[(i * 4 + j) * 2] = hex_chars[(byte >> 4) & 0x0F];
            hex_out[(i * 4 + j) * 2 + 1] = hex_chars[byte & 0x0F];
        }
    }
    hex_out[64] = '\0';

    return hex_out;
}
