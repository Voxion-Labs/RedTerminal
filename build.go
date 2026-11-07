//go:build ignore
// +build ignore

package main

import (
	"bytes"
	"flag"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type PageConfig struct {
	Title       string
	Description string
	Version     string
	Port        string
	Year        int
}

var defaultConfig = PageConfig{
	Title:       "RedTerminal",
	Description: "A high-performance C-dominant security analysis, data crunching, and WebAssembly execution workstation.",
	Version:     "1.0.0",
	Port:        "8080",
	Year:        time.Now().Year(),
}

func main() {
	serveFlag := flag.Bool("serve", false, "Start development server with live template rendering")
	portFlag := flag.String("port", "8080", "Port for dev server")
	extOnly := flag.Bool("ext", false, "Only build browser extension files")
	tmplOnly := flag.Bool("tmpl", false, "Only compile HTML and JS from Go templates")
	flag.Parse()

	if *portFlag != "" {
		defaultConfig.Port = *portFlag
	}
	if envPort := os.Getenv("PORT"); envPort != "" {
		defaultConfig.Port = envPort
	}

	if *serveFlag {
		buildAll()
		startDevServer(defaultConfig.Port)
		return
	}

	if *extOnly {
		buildExtension()
		return
	}

	if *tmplOnly {
		buildTemplates()
		buildTerminal()
		return
	}

	buildAll()
}

func buildAll() {
	fmt.Println("==================================================")
	fmt.Println(" RedTerminal Go Build & Template Engine")
	fmt.Println("==================================================")

	if err := os.MkdirAll("public", 0755); err != nil {
		log.Fatalf("Error creating public directory: %v", err)
	}

	buildTemplates()
	buildTerminal()
	buildExtension()
	ensureSqlite()

	fmt.Println("Build complete. All assets compiled from templates/ into public/.")
}

func buildTemplates() {
	fmt.Println("--> Compiling Go templates (templates/*.tmpl -> public/index.html)...")

	htmlTmpls := []string{
		"templates/layout.tmpl",
		"templates/head.tmpl",
		"templates/styles.tmpl",
		"templates/scripts.tmpl",
	}

	t, err := template.ParseFiles(htmlTmpls...)
	if err != nil {
		log.Fatalf("Error parsing HTML templates: %v", err)
	}

	var buf bytes.Buffer
	err = t.ExecuteTemplate(&buf, "layout", defaultConfig)
	if err != nil {
		log.Fatalf("Error executing layout template: %v", err)
	}

	cleanHTML := strings.TrimSpace(buf.String()) + "\n"
	err = os.WriteFile(filepath.Join("public", "index.html"), []byte(cleanHTML), 0644)
	if err != nil {
		log.Fatalf("Error writing public/index.html: %v", err)
	}

	fmt.Printf("    Generated public/index.html (%d bytes)\n", len(cleanHTML))
}

func buildTerminal() {
	fmt.Println("--> Compiling terminal emulator (templates/terminal.tmpl -> public/app.js)...")

	content, err := os.ReadFile(filepath.Join("templates", "terminal.tmpl"))
	if err != nil {
		log.Fatalf("Error reading templates/terminal.tmpl: %v", err)
	}

	err = os.WriteFile(filepath.Join("public", "app.js"), content, 0644)
	if err != nil {
		log.Fatalf("Error writing public/app.js: %v", err)
	}

	fmt.Printf("    Generated public/app.js (%d bytes)\n", len(content))
}

func buildExtension() {
	fmt.Println("--> Compiling browser extension assets (templates/*.tmpl -> content.js, background.js)...")

	// Compile content.js
	if contentScript, err := os.ReadFile(filepath.Join("templates", "content.tmpl")); err == nil {
		if err := os.WriteFile("content.js", contentScript, 0644); err != nil {
			log.Fatalf("Error writing content.js: %v", err)
		}
		fmt.Printf("    Generated content.js (%d bytes)\n", len(contentScript))
	}

	// Compile background.js
	if bgScript, err := os.ReadFile(filepath.Join("templates", "background.tmpl")); err == nil {
		if err := os.WriteFile("background.js", bgScript, 0644); err != nil {
			log.Fatalf("Error writing background.js: %v", err)
		}
		fmt.Printf("    Generated background.js (%d bytes)\n", len(bgScript))
	}
}

func ensureSqlite() {
	sqliteJsPath := filepath.Join("public", "sqlite3.js")
	if _, err := os.Stat(sqliteJsPath); err == nil {
		fmt.Println("    Verified public/sqlite3.js drop-in file.")
		return
	}

	fmt.Println("--> Downloading official SQLite3-WASM drop-in asset to public/sqlite3.js...")
	resp, err := http.Get("https://unpkg.com/@sqlite.org/sqlite-wasm@3.46.1-build1/sqlite-wasm/jswasm/sqlite3.js")
	if err != nil {
		fmt.Printf("    Warning: Could not download sqlite3.js: %v (CDN fallback will be used in browser)\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		out, err := os.Create(sqliteJsPath)
		if err != nil {
			fmt.Printf("    Warning: Could not create %s: %v\n", sqliteJsPath, err)
			return
		}
		defer out.Close()
		_, _ = io.Copy(out, resp.Body)
		fmt.Println("    Successfully provisioned public/sqlite3.js.")
	}
}

func startDevServer(port string) {
	fmt.Printf("\nServing RedTerminal with live template pipeline at http://localhost:%s\n", port)
	fmt.Println("Press Ctrl+C to stop.")

	mux := http.NewServeMux()

	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, "pong")
	})

	fileServer := http.FileServer(http.Dir("public"))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fileServer.ServeHTTP(w, r)
	})

	log.Fatal(http.ListenAndServe(":"+port, mux))
}
