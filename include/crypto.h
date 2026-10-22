#ifndef CRYPTO_H
#define CRYPTO_H

#include <stddef.h>
#include <stdint.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

// Base64 Encoding: Encodes input string to standard Base64 representation
EMSCRIPTEN_KEEPALIVE
char* base64_encode(const char *input);

// Base64 Decoding: Decodes Base64 string to original representation
EMSCRIPTEN_KEEPALIVE
char* base64_decode(const char *input);

// SHA-256 Hash Generator: Computes 64-character lowercase hex SHA-256 digest
EMSCRIPTEN_KEEPALIVE
char* sha256_hash(const char *input);

#endif // CRYPTO_H
