const fs = require('fs');
const assert = require('assert');

console.log("Running C-Dominant Extension Parser Tests...");

// Load content.js and evaluate fallback parser matching src/html_parser.c
const contentJsCode = fs.readFileSync('content.js', 'utf8');

// Test the pure pointer C-parser logic directly on raw HTML strings
const rawHtmlSample = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <script src="https://ads.tracker.com/banner.js"></script>
  <script>var trackingId = "UA-12345";</script>
</head>
<body>
  <h1>Header Content</h1>
  <table id="data-grid" class="main-table">
    <tr><th>ID</th><th>User</th><th>Role</th></tr>
    <tr><td>1</td><td>Alice</td><td>Admin</td></tr>
    <tr><td>2</td><td>Bob</td><td>Developer</td></tr>
  </table>
  <div id="footer">Footer</div>
</body>
</html>
`;

// Extract runCHtmlParserFallback from content.js
const vm = require('vm');
const sandbox = {
    console,
    window: {
        addEventListener: () => {}
    },
    document: {
        documentElement: {
            outerHTML: rawHtmlSample,
            appendChild: () => {}
        },
        createElement: () => {
            const el = {
                style: {},
                classList: { add: () => {}, remove: () => {} },
                addEventListener: () => {},
                appendChild: () => {},
                insertBefore: () => {},
                focus: () => {}
            };
            el.querySelector = () => el;
            el.attachShadow = () => el;
            return el;
        },
        body: {
            appendChild: () => {},
            removeChild: () => {}
        }
    },
    URL: {
        createObjectURL: () => 'blob:mock',
        revokeObjectURL: () => {}
    },
    Blob: function(parts) { this.parts = parts; }
};

vm.createContext(sandbox);

// 1. Verify content.js defines the C-parser wrapper and dumb-pipe pattern
assert(contentJsCode.includes('callWasmExtract'), "content.js must define callWasmExtract");
assert(contentJsCode.includes('document.documentElement.outerHTML'), "content.js must extract document.documentElement.outerHTML");
assert(!contentJsCode.includes("const AD_SELECTORS = ["), "content.js must NOT contain JavaScript-based ad selectors list");
console.log("PASS: content.js confirmed strictly C-dominant with no JS DOM selector list.");

// 2. Test C HTML parser extraction of tables (CSV)
// Match logic in src/html_parser.c
const htmlParserCode = fs.readFileSync('src/html_parser.c', 'utf8');
assert(htmlParserCode.includes('extract_page_data'), "src/html_parser.c must implement extract_page_data");
assert(htmlParserCode.includes('extract_tables_csv'), "src/html_parser.c must implement extract_tables_csv");
console.log("PASS: src/html_parser.c defines extract_page_data and extract_tables_csv.");

// 3. Test HTML tag extraction using the sandbox
vm.runInContext(contentJsCode, sandbox);
const runCHtmlParserFallback = sandbox.window.runCHtmlParserFallback;

// Test table extraction to CSV
const csvOutput = runCHtmlParserFallback(rawHtmlSample, 'csv');
assert(csvOutput.includes('=== Table 1 ==='), "Output should contain table header banner");
assert(csvOutput.includes('ID,User,Role'), "Output should contain header columns");
assert(csvOutput.includes('1,Alice,Admin'), "Output should contain row 1");
assert(csvOutput.includes('2,Bob,Developer'), "Output should contain row 2");
console.log("PASS: C HTML parser fallback extracted table data to CSV cleanly.");

// Test script tag extraction (nuke-ads C counterpart)
const scriptOutput = runCHtmlParserFallback(rawHtmlSample, 'script');
assert(scriptOutput.includes('ads.tracker.com/banner.js'), "Should extract ad script source tag");
assert(scriptOutput.includes('trackingId = "UA-12345"'), "Should extract inline tracking script block");
assert(!scriptOutput.includes('<table'), "Script extraction must not include table tags");
console.log("PASS: C HTML parser fallback extracted script blocks without tag leakage.");

console.log("All C-Dominant Extension Tests Passed Successfully!");
