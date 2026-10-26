# Official Golang Alpine base image
FROM golang:alpine

# Set working directory inside container
WORKDIR /app

# Install CA certificates for outbound HTTPS proxy requests
RUN apk --no-cache add ca-certificates

# Copy Go module definition
COPY go.mod ./

# Copy Go server source code
COPY main.go ./

# Copy static frontend assets (including WASM modules, UI, and drop-in SQLite-WASM)
COPY public ./public

# Build the Go web server binary as a standalone executable
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o server main.go

# Expose port 8080
EXPOSE 8080

# Run the Go web server (serves public/ directory relative to /app)
CMD ["./server"]
