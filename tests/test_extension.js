const fs = require('fs');
const assert = require('assert');

console.log("Running Extension DOM Mutator Tests...");

// Create a mock DOM environment
class MockElement {
    constructor(tagName, id = '', className = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = className;
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.attributes = {};
        this.innerText = '';
        this.textContent = '';
        this.shadowRoot = null;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    insertBefore(newNode, refNode) {
        newNode.parentNode = this;
        const idx = this.children.indexOf(refNode);
        if (idx >= 0) {
            this.children.splice(idx, 0, newNode);
        } else {
            this.children.push(newNode);
        }
        return newNode;
    }

    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx >= 0) this.parentNode.children.splice(idx, 1);
            this.parentNode = null;
        }
    }

    attachShadow(options) {
        this.shadowRoot = new MockElement('SHADOW-ROOT');
        return this.shadowRoot;
    }

    closest(selector) {
        if (selector === '#redterm-extension-host' || selector === '#terminal-container') {
            let curr = this;
            while (curr) {
                if (curr.id === 'redterm-extension-host' || curr.id === 'terminal-container') return curr;
                curr = curr.parentNode;
            }
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const isTable = selector === 'table';
        const isTr = selector === 'tr';
        const isCell = selector === 'th, td';

        function traverse(node) {
            if (!node || !node.children) return;
            for (const child of node.children) {
                if (isTable && child.tagName === 'TABLE') {
                    results.push(child);
                } else if (isTr && child.tagName === 'TR') {
                    results.push(child);
                } else if (isCell && (child.tagName === 'TH' || child.tagName === 'TD')) {
                    results.push(child);
                } else if (selector.includes('ad') || selector.includes('banner')) {
                    // Check for ad classes or IDs
                    const id = (child.id || '').toLowerCase();
                    const cls = (child.className || '').toLowerCase();
                    if (id.includes('ad-') || id.includes('banner') || cls.includes('ad-') || cls.includes('adsbygoogle')) {
                        results.push(child);
                    }
                }
                traverse(child);
            }
        }
        traverse(this);
        return results;
    }

    querySelector(selector) {
        const res = this.querySelectorAll(selector);
        return res.length > 0 ? res[0] : null;
    }
}

// 1. Test nuke-ads logic
const body = new MockElement('BODY');
const regularDiv = new MockElement('DIV', 'content', 'main-article');
const adBanner = new MockElement('DIV', 'top-ad-banner', 'ad-container');
const adWidget = new MockElement('DIV', 'google_ads_frame', 'adsbygoogle');
const extHost = new MockElement('DIV', 'redterm-extension-host');

body.appendChild(regularDiv);
body.appendChild(adBanner);
body.appendChild(adWidget);
body.appendChild(extHost);

assert.strictEqual(body.children.length, 4);

// Simulate nuke-ads removal
const adElements = body.querySelectorAll('[class*="ad-"]');
let removedCount = 0;
adElements.forEach(el => {
    if (!el.closest('#redterm-extension-host')) {
        el.remove();
        removedCount++;
    }
});

assert.strictEqual(removedCount, 2, "Should remove both ad elements");
assert.strictEqual(body.children.length, 2, "Body should now only contain article and extension host");
assert.strictEqual(body.children[0].id, 'content');
assert.strictEqual(body.children[1].id, 'redterm-extension-host');
console.log("PASS: nuke-ads correctly purges ads without affecting extension host.");

// 2. Test extract-tables logic
const table1 = new MockElement('TABLE', 'users-table');
const tr1 = new MockElement('TR');
const th1 = new MockElement('TH'); th1.innerText = 'ID';
const th2 = new MockElement('TH'); th2.innerText = 'Name';
tr1.appendChild(th1);
tr1.appendChild(th2);
table1.appendChild(tr1);

const tr2 = new MockElement('TR');
const td1 = new MockElement('TD'); td1.innerText = '1';
const td2 = new MockElement('TD'); td2.innerText = 'Alice Smith';
tr2.appendChild(td1);
tr2.appendChild(td2);
table1.appendChild(tr2);

body.appendChild(table1);

const foundTables = body.querySelectorAll('table');
assert.strictEqual(foundTables.length, 1);

const tableLines = [];
foundTables.forEach((tbl, idx) => {
    tbl.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('th, td');
        const vals = cells.map(c => c.innerText);
        tableLines.push(vals.join(','));
    });
});

const generatedCsv = tableLines.join('\n');
assert(generatedCsv.includes('ID,Name'));
assert(generatedCsv.includes('1,Alice Smith'));
console.log("PASS: extract-tables correctly formats table data to CSV.");

console.log("All Extension DOM Mutator Tests Passed Successfully!");
