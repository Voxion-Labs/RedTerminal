#include "crypto.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

int main(void) {
    printf("Running test_crypto...\n");

    // 1. Test Base64 Encoding & Decoding
    const char *text1 = "Hello, World!";
    char *enc1 = base64_encode(text1);
    assert(enc1 != NULL);
    assert(strcmp(enc1, "SGVsbG8sIFdvcmxkIQ==") == 0);

    char *dec1 = base64_decode(enc1);
    assert(dec1 != NULL);
    assert(strcmp(dec1, text1) == 0);
    free(enc1);
    free(dec1);

    // Test Base64 single character padding
    char *enc2 = base64_encode("a");
    assert(strcmp(enc2, "YQ==") == 0);
    char *dec2 = base64_decode(enc2);
    assert(strcmp(dec2, "a") == 0);
    free(enc2);
    free(dec2);

    // Test Base64 two characters padding
    char *enc3 = base64_encode("ab");
    assert(strcmp(enc3, "YWI=") == 0);
    char *dec3 = base64_decode(enc3);
    assert(strcmp(dec3, "ab") == 0);
    free(enc3);
    free(dec3);

    // 2. Test SHA-256 standard vectors
    // Empty string
    char *h_empty = sha256_hash("");
    assert(h_empty != NULL);
    assert(strcmp(h_empty, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") == 0);
    free(h_empty);

    // "abc"
    char *h_abc = sha256_hash("abc");
    assert(h_abc != NULL);
    assert(strcmp(h_abc, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") == 0);
    free(h_abc);

    // "The quick brown fox jumps over the lazy dog"
    char *h_fox = sha256_hash("The quick brown fox jumps over the lazy dog");
    assert(h_fox != NULL);
    assert(strcmp(h_fox, "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592") == 0);
    free(h_fox);

    printf("All test_crypto assertions passed successfully!\n");
    return 0;
}
