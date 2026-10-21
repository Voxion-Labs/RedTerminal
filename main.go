package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	// /ping endpoint returning 'pong'
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, "pong")
	})

	// Static file server pointing to public/ directory
	fileServer := http.FileServer(http.Dir("public"))
	mux.Handle("/", fileServer)

	addr := ":8080"
	log.Printf("RedTerminal server started on http://localhost%s\n", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
