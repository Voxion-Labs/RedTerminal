package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPingEndpoint(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	w := httptest.NewRecorder()

	mux := http.NewServeMux()
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		io.WriteString(w, "pong")
	})

	mux.ServeHTTP(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "pong" {
		t.Fatalf("expected 'pong', got '%s'", string(body))
	}
}

func TestProxyMissingURL(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/proxy", nil)
	w := httptest.NewRecorder()

	proxyHandler(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", resp.StatusCode)
	}

	// Verify CORS header is set
	if origin := resp.Header.Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got '%s'", origin)
	}
}

func TestProxySuccess(t *testing.T) {
	// Setup mock upstream target server
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, "<!DOCTYPE html><html><body><h1>Hello World</h1><p>Test paragraph</p></body></html>")
	}))
	defer targetServer.Close()

	req := httptest.NewRequest(http.MethodGet, "/proxy?url="+targetServer.URL, nil)
	w := httptest.NewRecorder()

	proxyHandler(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	if origin := resp.Header.Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got '%s'", origin)
	}

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	if !strings.Contains(bodyStr, "<h1>Hello World</h1>") {
		t.Fatalf("expected response body to contain target HTML, got: %s", bodyStr)
	}
}

func TestProxyOptionsCORS(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/proxy", nil)
	w := httptest.NewRecorder()

	proxyHandler(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for OPTIONS, got %d", resp.StatusCode)
	}

	if origin := resp.Header.Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got '%s'", origin)
	}
}
