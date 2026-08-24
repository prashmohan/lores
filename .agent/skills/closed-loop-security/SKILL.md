---
name: closed-loop-security
description: Autonomous 5-stage loop to scan, parse, patch, and verify security vulnerabilities on the local web service.
---

# Closed-Loop Security Remediation Protocol

Follow this 5-stage closed loop sequentially:

## Stage 1: Configure & Pre-Flight
- Inspect the codebase to detect the active framework, ports, and API endpoints.
- Ensure the local scan target configuration (`stackhawk.yml`) is valid.

## Stage 2: Scan
- Run the security scanner command against the local running service (e.g., `hawk scan stackhawk.yml` or the configured local scanner).
- Capture all CLI outputs and structured report logs.

## Stage 3: Parse Findings
- Parse all High and Critical findings.
- Isolate the endpoint, HTTP method, root cause (e.g., SQLi, XSS, broken auth, missing headers), and corresponding source files.

## Stage 4: Patch Code
- Apply surgical code remediations directly in the source tree to fix vulnerabilities.
- Preserve existing business logic and public API contracts.

## Stage 5: Verify
- Re-run the scan or execute targeted test payloads against patched routes.
- Confirm resolution and output a final Markdown report table detailing: Finding, Target Path, File Modified, and Verification Status.
