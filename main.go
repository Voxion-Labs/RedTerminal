package main

import (
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"time"
)

// proxyHandler fetches and returns raw HTML from any URL, acting as a CORS bypass.
func proxyHandler(w http.ResponseWriter, r *http.Request) {
	// CORS bypass headers to allow cross-origin requests
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		http.Error(w, "Query parameter 'url' is required", http.StatusBadRequest)
		return
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid URL: %v", err), http.StatusBadRequest)
		return
	}

	// Default to https scheme if none provided
	if parsedURL.Scheme == "" {
		rawURL = "https://" + rawURL
		parsedURL, err = url.Parse(rawURL)
		if err != nil || parsedURL.Host == "" {
			http.Error(w, "Invalid target URL", http.StatusBadRequest)
			return
		}
	}

	client := &http.Client{
		Timeout: 20 * time.Second,
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusBadRequest)
		return
	}

	// Provide a standard browser User-Agent so scraping requests are not blocked
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RedTerminal/1.0")

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch target URL: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "text/html; charset=utf-8"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(resp.StatusCode)

	if _, err := io.Copy(w, resp.Body); err != nil {
		log.Printf("Error streaming proxy response: %v\n", err)
	}
}

func main() {
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	mux := http.NewServeMux()

	// /ping endpoint returning 'pong'
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, "pong")
	})

	// /proxy?url= endpoint to fetch and return raw HTML from any URL
	mux.HandleFunc("/proxy", proxyHandler)

	// Static file server pointing to public/ directory
	fileServer := http.FileServer(http.Dir("public"))
	mux.Handle("/", fileServer)

	addr := ":8080"
	log.Printf("RedTerminal server started on http://localhost%s\n", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
