# Official Golang Alpine base image
FROM golang:alpine

# Set working directory inside container
WORKDIR /app

# Install CA certificates for outbound HTTPS proxy requests and curl
RUN apk --no-cache add ca-certificates curl

# Copy Go module definition
COPY go.mod ./

# Copy Go server source code, build engine, and templates
COPY main.go build.go ./
COPY templates ./templates
COPY public ./public

# Compile Go templates to generate fresh frontend assets and ensure SQLite WASM drop-in
RUN go run build.go

# Build the Go web server binary as a standalone executable
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o server main.go

# Expose port 8080
EXPOSE 8080

# Run the Go web server (serves public/ directory relative to /app)
CMD ["./server"]
