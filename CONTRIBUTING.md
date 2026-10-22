# RedTerminal Operational & Contribution Protocols

RedTerminal operates under strict systems-level C and WebAssembly (WASM) protocols. This repository is maintained as a high-performance, zero-dependency execution engine utilizing a Go backend, HTMX, and C/WASM processing modules. We do not accept arbitrary feature bloat, heavy JavaScript frameworks, or memory-unsafe operations.

If you intend to submit a Pull Request, you must adhere strictly to the following institutional directives.

## 1. Architectural Standards
All submissions must meet our baseline systems and latency metrics:
- **Memory Safety & WASM Boundary:** Memory leaks, dangling pointers, and unauthorized heap access are strictly prohibited. You must correctly manage memory allocations (`_malloc` and `_free`) across the JavaScript-WASM bridge. 
- **Zero-Dependency Core:** All computational modules (log filters, cryptography, validators) must be written in pure C. Third-party C libraries are not permitted.
- **Minimalist Stack:** The backend is strictly standard-library Go. The frontend is strictly Vanilla JS and HTMX. PRs introducing `package.json`, `node_modules`, or heavy backend frameworks will be instantly rejected.

## 2. Pull Request (PR) Governance
Before initiating a merge request, ensure your PR adheres to this exact structure:
1. **[METRIC] Benchmark Data:** You must provide before/after execution telemetry. For WASM modules, provide processing latency (in milliseconds) against stress-test datasets (e.g., 50MB+ payloads).
2. **[MEMORY] Allocation Trace:** Explicitly document the heap allocation footprint your C code requires and prove that memory is systematically freed post-execution.
3. **[ISOLATION] Threat Model:** Prove that your modifications do not introduce buffer overflows, out-of-bounds array access, or infinite loops within the WASM sandbox.

*Note: PRs failing to provide empirical telemetry or memory safety validation will be closed immediately without review.*

## 3. Vulnerability Disclosure
**DO NOT** open public issues for buffer overflows, memory leaks, or WASM bridge exploits. Public disclosure of system-level threats compromises the integrity of the engine.
- All security reports must be routed internally.
- Contact the Lead Architect directly for secure transmission protocols.

## 4. Code of Conduct
We evaluate raw implementations, not intentions. Your submissions will be scrutinized ruthlessly based on pointer arithmetic accuracy, algorithmic efficiency, and memory management. Keep discussions clinical, objective, and exclusively focused on systems architecture.