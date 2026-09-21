# RedTerminal Operational & Contribution Protocols

RedTerminal operates under strict systems-level C protocols. We do not accept arbitrary feature bloat, memory-unsafe operations, or thread-blocking logic. This repository is maintained for high-performance process scheduling and OS simulation research.

If you intend to submit a Pull Request, you must adhere strictly to the following institutional directives.

## 1. Architectural Standards
All C code submitted to RedTerminal must meet our baseline systems metrics:
* **Thread Safety & Concurrency:** All background scheduler and logger operations must be strictly protected via POSIX mutexes. Race conditions or deadlocks will result in instant PR rejection.
* **Memory Safety & PCB Integrity:** Memory leaks, dangling pointers, and segmentation faults are strictly prohibited. Prove your memory stability via Valgrind or AddressSanitizer (ASan) logs before submission.
* **POSIX Compliance:** Do not rely on OS-specific or non-standard wrappers. Stick strictly to the C11 standard and POSIX thread (`pthread`) APIs to maintain cross-environment determinism.

## 2. Pull Request (PR) Governance
Before initiating a merge request, ensure your PR adheres to this exact structure:
1. **[METRIC] Benchmark Data:** You must provide before/after execution telemetry (e.g., CPU scheduling cycles, thread context-switch latency, memory footprint).
2. **[LOGIC] State Transition:** Explicitly document the Process Control Block (PCB) state transitions your code alters (e.g., RUNNING to STOPPED).
3. **[ISOLATION] Threat Model:** Prove that your modifications do not introduce buffer overflows or unauthorized memory access within the simulator's execution stack.

*Note: PRs failing to provide empirical telemetry or passing Valgrind checks will be closed immediately without review.*

## 3. Vulnerability Disclosure
**DO NOT** open public issues for buffer overflows, race conditions, or critical segmentation vulnerabilities. Public disclosure of system-level threats compromises the integrity of the simulator.
* All security reports must be routed internally.
* Contact the Lead Architect directly for secure transmission protocols.

## 4. Code of Conduct
We evaluate C implementations, not intentions. Your submissions will be scrutinized ruthlessly based on pointer arithmetic accuracy, algorithmic efficiency, and memory management. Keep discussions clinical, objective, and exclusively focused on systems architecture.