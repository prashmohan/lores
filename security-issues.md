# Security Audit Findings & Vulnerability Assessment Report

## Executive Summary

A comprehensive full-stack security audit of the **Lores** codebase was conducted covering multi-tenant isolation, authentication and session lifecycles, role-based access control (RBAC), input validation, exception handling, and edge deployment configurations. 

This assessment identified 16 security findings spanning Critical, High, Medium, and Low severities. The top 10 prioritized findings are cataloged in the structured findings table below, followed by detailed summaries for additional findings.

---

## Prioritized Findings (Top 10)

| ID | Severity | Issue | File Path | Line Number(s) | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | High | Insecure Default `JWT_SECRET` Without Production Validation | [backend/app/config.py](backend/app/config.py) | 11, 37-54 | Implement a Pydantic `@model_validator(mode="after")` in `Settings` that raises a fatal `ValueError` if `ENVIRONMENT == "production"` and `JWT_SECRET` matches the default placeholder or is shorter than 32 characters. |
| 2 | High | Sensitive JWT Session Token Transmitted in URL Query Parameter During OAuth Redirect | [backend/app/api/v1/auth.py](backend/app/api/v1/auth.py) | 124-128 | Transmit session tokens using secure `HttpOnly`, `SameSite=Lax`, `Secure` cookies or URL fragment identifiers (`#token=...`), and sanitize the redirect path against backslashes and protocol injection. |
| 3 | High | Unthrottled Passwordless OTP Request Endpoint Enabling Email Flooding & CPU Starvation | [backend/app/api/v1/auth.py](backend/app/api/v1/auth.py) | 153-169 | Add IP-based and destination email rate limits (e.g. max 3 requests per 15 minutes), and enforce an in-database cooldown requiring at least 60 seconds between OTP generation requests for the same email address. |
| 4 | Medium | Excessive 30-Day JWT Token Lifetime Without Server-Side Revocation Mechanism | [backend/app/config.py](backend/app/config.py) | 13-15 | Shorten access token lifespan (15–60 minutes) with refresh token rotation, and maintain a `token_version` column on the `User` model to immediately invalidate existing JWTs upon logout or password reset. |
| 5 | Medium | Insecure Persistent Storage of JWT Access Tokens in Browser `localStorage` | [frontend/src/lib/api.ts](frontend/src/lib/api.ts) | 47-69 | Migrate session token management to `HttpOnly`, `Secure`, `SameSite=Lax` cookies, removing client-side JavaScript access to persistent authentication credentials. |
| 6 | Medium | Untrusted Reverse Proxy Client IP Header Forwarding Allowing IP Spoofing | [frontend/nginx.conf](frontend/nginx.conf) | 32-33 | Replace `$http_cf_connecting_ip` with trusted proxy variables `$proxy_add_x_forwarded_for` and `$remote_addr`, or configure explicit Cloudflare IP range trust blocks with `real_ip_header`. |
| 7 | Medium | Incomplete Privacy Boundary Redaction for Living Individuals Under `viewer` Role | [backend/app/api/v1/people.py](backend/app/api/v1/people.py) | 30-39 | Extend privacy redaction logic to mask `biography` (e.g. `"[Redacted for privacy]"`) and filter or redact lore notes of living individuals when accessed by `viewer` roles. |
| 8 | Medium | Missing Multi-Tenant `workspace_id` Filter on `LoreNote` Cleanup in `purge_trash` | [backend/app/services/lore_service.py](backend/app/services/lore_service.py) | 428-433 | Explicitly add `LoreNote.workspace_id == workspace_id` to the `select(LoreNote)` filter clause in `lore_service.purge_trash()`. |
| 9 | Medium | Indiscriminate Relationship and Union Reactivation During Person Trash Restoration | [backend/app/services/lore_service.py](backend/app/services/lore_service.py) | 304-328 | Inspect partner deletion status during person restoration and only reactivate joint unions if the other partner is active (`is_deleted == False`). |
| 10 | Medium | Unrestricted Destructive UI Triggers and Unredacted Change Log Exposure for Viewer Roles | [frontend/src/App.tsx](frontend/src/App.tsx) | 870-888 | Guard trash modal action triggers with `!isViewer` checks and sanitize living person change diffs before displaying audit logs in `ActivityFeedModal` to viewer roles. |

---

## Additional Findings Summary

### ID 11 — Raw SQL DDL String Formatting in Database Auto-Migration
- **Severity**: Low
- **File Path**: [backend/app/db/init_db.py](backend/app/db/init_db.py)
- **Line Number(s)**: 51-53
- **Description**: The database startup auto-migration constructs dynamic DDL statements using Python string interpolation (`f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}{default_clause}"`). While table and column names originate from internal SQLAlchemy metadata, string-formatted DDL bypasses SQL parameterization and compiler validation.
- **Recommendation**: Utilize dialect-specific identifier quoting (`preparer.quote()`) or migrate database schema versioning and evolutionary migrations entirely to Alembic migration scripts.

---

### ID 12 — Missing Field Constraints, Length Limits, and Enum Validation in Pydantic Schemas
- **Severity**: Low
- **File Path**: [backend/app/schemas/person.py](backend/app/schemas/person.py)
- **Line Number(s)**: 8-41
- **Description**: Request schemas (`PersonBase`, `PersonCreate`, `PersonUpdate`) lack explicit string length boundaries (`min_length`, `max_length`), enum validation for fields such as `gender` or date qualifiers, and URI scheme format checks on `avatar_url`.
- **Recommendation**: Annotate schema fields with Pydantic v2 `Field(min_length=1, max_length=255)`, enforce string literals or `Enum` types for constrained fields (`Literal["male", "female", "other", "unknown"]`), and add URL validation (`HttpUrl` or regex pattern).

---

### ID 13 — Absence of Global Exception Handlers for Database Errors and Internal Exceptions
- **Severity**: Low
- **File Path**: [backend/app/main.py](backend/app/main.py)
- **Line Number(s)**: 44-70
- **Description**: The FastAPI application does not register global exception handlers for SQLAlchemy operational/integrity errors or generic unhandled exceptions. Uncaught runtime exceptions risk exposing internal table layouts, query parameters, or framework stack traces.
- **Recommendation**: Register centralized exception handlers in `app/main.py` (`@app.exception_handler(SQLAlchemyError)` and `@app.exception_handler(Exception)`) to log full stack traces internally to application logs while returning standardized JSON error payloads (`{"error": "Internal server error", "code": 500}`) to clients.

---

### ID 14 — Unbounded Synchronous Memory Allocation During Large GEDCOM / JSON Imports
- **Severity**: Low
- **File Path**: [backend/app/api/v1/data_exchange.py](backend/app/api/v1/data_exchange.py)
- **Line Number(s)**: 82-89
- **Description**: GEDCOM and JSON imports read full file payloads into memory (up to `MAX_UPLOAD_SIZE = 25MB`) and execute entity parsing synchronously within the request-response thread. A succession of large concurrent imports can induce high memory consumption and worker event loop blocking.
- **Recommendation**: Implement chunked streaming or offload parsing of large files to background workers (e.g. Celery / background worker tasks) with maximum entity count ceilings (e.g. 10,000 entities per import batch).

---

### ID 15 — Raw Backend Error Detail and Runtime Exception Propagation in Frontend DOM
- **Severity**: Low
- **File Path**: [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
- **Line Number(s)**: 90-111
- **Description**: The frontend HTTP client parses arbitrary error responses and extracts nested exception messages or stringified error details directly for presentation in UI error banners and toast notifications.
- **Recommendation**: Sanitize client-facing error messages to friendly, human-readable strings and conditionally restrict raw API error dumps and stack traces to local development mode (`import.meta.env.DEV`).

---

### ID 16 — Content Security Policy Allows `'unsafe-inline'` Styles
- **Severity**: Low
- **File Path**: [frontend/nginx.conf](frontend/nginx.conf)
- **Line Number(s)**: 16
- **Description**: The reverse proxy Content-Security-Policy (CSP) header includes `'unsafe-inline'` within the `style-src` directive. While necessary for some runtime CSS-in-JS solutions, it weakens protection against style injection attacks.
- **Recommendation**: Evaluate implementing cryptographic nonce-based or hash-based CSP directives for style assets in production deployment environments.
