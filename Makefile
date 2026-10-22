CC = gcc
CFLAGS = -Wall -Wextra -std=c11 -g -pthread
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

# Emscripten WASM Toolchain & Passive Library Sources
EMCC = emcc
EMCC_FLAGS = -I./include -s WASM=1 -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "UTF8ToString"]' -s EXPORTED_FUNCTIONS='["_malloc", "_free"]' -s NO_EXIT_RUNTIME=1 -O2
WASM_SRCS = $(SRC_DIR)/crypto.c $(SRC_DIR)/filter.c $(SRC_DIR)/validator.c $(SRC_DIR)/utils.c $(SRC_DIR)/process.c $(SRC_DIR)/scheduler.c $(SRC_DIR)/shell.c

.PHONY: all clean run test build-wasm

all: $(TARGET)

$(TARGET): $(OBJS) $(MAIN_OBJ)
	$(CC) $(CFLAGS) -o $@ $^

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c
	@mkdir -p $(OBJ_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

build-wasm:
	@mkdir -p public
	$(EMCC) $(EMCC_FLAGS) $(WASM_SRCS) -o public/redterm.js

run: build-wasm
	go run main.go

test: $(TEST_BINS)
	@for t in $(TEST_BINS); do echo "Running $$t..."; ./$$t || exit 1; done
	@echo "All tests passed!"

$(TEST_DIR)/%: $(TEST_DIR)/%.c $(OBJS)
	$(CC) $(CFLAGS) $(INCLUDES) -o $@ $^

clean:
	rm -rf $(OBJ_DIR) $(TARGET) redterm.log $(TEST_BINS) public/redterm.js public/redterm.wasm
