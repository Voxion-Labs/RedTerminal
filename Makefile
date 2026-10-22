CC = gcc
CFLAGS = -Wall -Wextra -std=c17 -g -pthread
INCLUDES = -I./include
SRC_DIR = src
OBJ_DIR = obj
TEST_DIR = tests

SRCS = $(filter-out $(SRC_DIR)/main.c, $(wildcard $(SRC_DIR)/*.c))
MAIN_SRC = $(SRC_DIR)/main.c
OBJS = $(patsubst $(SRC_DIR)/%.c, $(OBJ_DIR)/%.o, $(SRCS))
MAIN_OBJ = $(OBJ_DIR)/main.o

TEST_SRCS = $(wildcard $(TEST_DIR)/*.c)
TEST_BINS = $(patsubst $(TEST_DIR)/%.c, $(TEST_DIR)/%, $(TEST_SRCS))

TARGET = redterm

# Emscripten WASM Toolchain
EMCC = emcc
EMCC_FLAGS = -I./include -s WASM=1 -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8"]' -s EXPORTED_FUNCTIONS='["_main","_malloc","_free","_process_data","_filter_logs","_base64_encode","_base64_decode","_sha256_hash","_validate_json"]' -s NO_EXIT_RUNTIME=1 -O2

.PHONY: all clean run test build-wasm

all: $(TARGET)

$(TARGET): $(OBJS) $(MAIN_OBJ)
	$(CC) $(CFLAGS) -o $@ $^

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c
	@mkdir -p $(OBJ_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

build-wasm:
	@mkdir -p public
	$(EMCC) $(EMCC_FLAGS) $(wildcard $(SRC_DIR)/*.c) -o public/redterm.js

run: build-wasm
	go run main.go

test: $(TEST_BINS)
	@for t in $(TEST_BINS); do echo "Running $$t..."; ./$$t || exit 1; done
	@echo "All tests passed!"

$(TEST_DIR)/%: $(TEST_DIR)/%.c $(OBJS)
	$(CC) $(CFLAGS) $(INCLUDES) -o $@ $^

clean:
	rm -rf $(OBJ_DIR) $(TARGET) redterm.log $(TEST_BINS) public/redterm.js public/redterm.wasm
