const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

async function runTests() {
    console.log("Running Zero-Trust Secret Scanner JS unit tests...");

    const appJsCode = fs.readFileSync('public/app.js', 'utf8');

    const printedMessages = [];
    const sandbox = {
        console,
        window: {
            addEventListener: () => {}
        },
        document: {
            getElementById: () => null,
            createElement: () => ({ style: {} }),
            addEventListener: () => {},
            documentElement: {
                outerHTML: "<html><body><script>const apiKey = 'AKIAIOSFODNN7EXAMPLE';</script></body></html>"
            }
        },
        termPrint: (msg, type) => {
            printedMessages.push({ msg, type: type || 'normal' });
        },
        Module: {},
        performance: {
            now: () => Date.now()
        },
        setTimeout: (fn) => fn()
    };

    vm.createContext(sandbox);
    vm.runInContext(appJsCode, sandbox);

    // Override termPrint inside sandbox so we capture calls from renderScanReport and executeCommand
    sandbox.termPrint = (msg, type) => {
        printedMessages.push({ msg, type: type || 'normal' });
    };

    const callWasmScanSecrets = vm.runInContext('callWasmScanSecrets', sandbox);
    const renderScanReport = vm.runInContext('renderScanReport', sandbox);
    const executeCommand = vm.runInContext('executeCommand', sandbox);

    assert.strictEqual(typeof callWasmScanSecrets, 'function', 'callWasmScanSecrets must be defined');
    assert.strictEqual(typeof renderScanReport, 'function', 'renderScanReport must be defined');

    // 1. Test clean text
    const cleanReport = callWasmScanSecrets("This is completely normal text with no credentials.");
    assert(cleanReport.includes('[CLEAN]'), 'Clean text must report 0 vulnerabilities');
    console.log("PASS: Clean text produces [CLEAN] report.");

    // 2. Test AWS Key detection
    const awsReport = callWasmScanSecrets("export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");
    assert(awsReport.includes('[!] ZERO-TRUST SCANNER'), 'AWS key must trigger scanner');
    assert(awsReport.includes('AWS Access Key ID'), 'Must identify AWS Access Key ID');
    assert(awsReport.includes('AKIAIOSFODNN7EXAMPLE'), 'Must match AKIA key');
    assert(awsReport.includes('CRITICAL'), 'AWS key must be marked CRITICAL');
    console.log("PASS: AWS Access Key ID detected with CRITICAL severity.");

    // 3. Test Stripe Secret Key detection (dynamically formed to prevent false-positive GitHub push protection blocks)
    const mockStripeKey = ['sk_', 'live_', '0123456789abcdefghijklmnopqrstuvwxyz'].join('');
    const stripeReport = callWasmScanSecrets(`stripe_sk = '${mockStripeKey}';`);
    assert(stripeReport.includes('Stripe Live Secret Key'), 'Must identify Stripe Live Secret Key');
    assert(stripeReport.includes('sk_live_'), 'Must match sk_live prefix');
    console.log("PASS: Stripe Live Secret Key detected.");

    // 4. Test Generic High-Entropy Secret
    const highEntropyReport = callWasmScanSecrets("api_secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';");
    assert(highEntropyReport.includes('High-Entropy Secret'), 'Must identify high-entropy secret');
    console.log("PASS: Generic high-entropy secret detected.");

    // 5. Test red text rendering in terminal UI
    printedMessages.length = 0;
    renderScanReport(awsReport);

    const errorLines = printedMessages.filter(p => p.type === 'error');
    assert(errorLines.length > 0, 'Detected vulnerabilities must be printed with style="error" (red text)');
    const hasVulnLine = errorLines.some(l => l.msg.includes('AWS Access Key ID'));
    assert(hasVulnLine, 'Error lines must include specific vulnerability details in red');
    console.log("PASS: Vulnerabilities printed in red text ('error' style) directly to terminal UI.");

    // 6. Test 'scan' command execution via terminal
    printedMessages.length = 0;
    await executeCommand("scan aws_key=AKIAIOSFODNN7EXAMPLE");
    const scanErrorLines = printedMessages.filter(p => p.type === 'error');
    assert(scanErrorLines.length > 0, "'scan' command must output detected secrets in red text");
    assert(scanErrorLines.some(l => l.msg.includes('AKIAIOSFODNN7EXAMPLE')), "'scan' output must contain the matched secret");
    console.log("PASS: Terminal command 'scan <text>' successfully identified secret and printed in red.");

    // 7. Test 'scan' without arguments in DOM context (scans document.documentElement.outerHTML)
    printedMessages.length = 0;
    await executeCommand("scan");
    const domScanErrors = printedMessages.filter(p => p.type === 'error');
    assert(domScanErrors.length > 0, "'scan' with no arguments in DOM context must audit document.documentElement.outerHTML");
    console.log("PASS: Terminal command 'scan' audited DOM and flagged embedded secrets.");

    console.log("All Zero-Trust Secret Scanner JS unit tests passed successfully!");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
