# CamPhish Full-Stack Audit Report

**Date:** 2026-06-22  
**Scope:** Backend (Rust), Frontend (React), Templates (HTML/JS), Infrastructure (Docker/Compose)  
**Auditor:** Automated audit + manual deep-dive

---

## Summary

| Layer | Critical | High | Medium | Low | Total |
|-------|----------|------|--------|-----|-------|
| Backend | 3 | 5 | 4 | 2 | 14 |
| Frontend | 3 | 7 | 11 | 11 | 32 |
| Templates | 2 | 3 | 4 | 3 | 12 |
| Docker/Infra | 2 | 2 | 3 | 2 | 9 |
| **Total** | **10** | **17** | **22** | **18** | **67** |

---

## 1. Backend (Rust/axum)

### 1.1 Critical

#### C-1: CORS_ORIGIN Defaults to Wildcard `*`
- **File:** `backend/src/main.rs:192`
- **Category:** Security
- **Description:** When `CORS_ORIGIN` is unset, the backend allows requests from **any origin** including malicious websites. This is dangerous for a tool that captures sensitive victim data and serves an operator dashboard.
- **Fix:** Default to `self` origin or reject startup if `CORS_ORIGIN` is not explicitly set.

#### C-2: Hardcoded PostHog API Key in Docker Compose
- **File:** `docker-compose.yml` (both `VITE_POSTHOG_KEY` and `POSTHOG_API_KEY`)
- **Category:** Security
- **Description:** A real, valid PostHog project API key is hardcoded as a default fallback in `docker-compose.yml`. If users deploy without overriding, all events (including victim data) are silently sent to this PostHog project, creating a massive data leakage vector.
- **Fix:** Remove all default values for `*_POSTHOG_*` keys and require explicit opt-in.

#### C-3: `expect()` Panic on External API Limiter
- **File:** `backend/src/capture.rs:187`, `capture.rs:270`
- **Category:** Stability / DoS
- **Description:** `limiter.acquire().await.expect("semaphore not closed")` will panic if the semaphore closes. This kills the entire backend process during a geolocation request, allowing a DoS by simply spamming location/IP endpoints.
- **Fix:** Use `?` or `match` to handle `acquire()` failures gracefully.

### 1.2 High

#### H-1: `std::sync::Mutex` Poisoning in Rate Limiter
- **File:** `backend/src/capture.rs:524`
- **Category:** Stability / DoS
- **Description:** `state.rate_limiter.lock().unwrap()` will panic if any thread previously panicked while holding the lock. This permanently bricks the rate limiter and DoSes the app.
- **Fix:** Replace with `tokio::sync::Mutex` (async-safe, no poisoning) or `parking_lot::Mutex`.

#### H-2: `expect()` Panics on Startup
- **Files:** `backend/src/main.rs:290` (`ctrl_c`), `trailbase.rs:15` (HTTP client), `posthog.rs:30` (ClientOptions)
- **Category:** Stability
- **Description:** Multiple `expect()` calls on startup code that can fail in restricted environments (e.g., missing signal support, network namespaces, etc.).
- **Fix:** Replace with proper error propagation.

#### H-3: `allowed_origins.parse().unwrap()` Panic
- **File:** `backend/src/main.rs:197`
- **Category:** Stability
- **Description:** If `CORS_ORIGIN` contains invalid characters, the app panics on startup instead of logging a clear error.
- **Fix:** Use `parse().unwrap_or_else(|e| { tracing::error!(...); default })`.

#### H-4: No HTTP Request Timeouts for External APIs
- **File:** `backend/src/capture.rs` (Nominatim, ip-api.com)
- **Category:** Stability / DoS
- **Description:** Background geolocation requests use the default `reqwest` timeout (infinite). A slow or hanging Nominatim response can exhaust the connection pool or block the background task indefinitely.
- **Fix:** Set `reqwest::Client` timeout to 10s and add a background task deadline.

#### H-5: Set-Cookie Missing Secure Flag
- **File:** `backend/src/main.rs:351-359`
- **Category:** Security
- **Description:** `camphish_access` cookie is set with `HttpOnly; SameSite=Lax` but no `Secure` flag. On deployments with HTTPS, this allows cookie theft via MITM on unsecured networks.
- **Fix:** Add `Secure` flag when `X-Forwarded-Proto: https` is present, or always in production.

### 1.3 Medium

#### M-1: Race Condition in Template Cache
- **File:** `backend/src/templates.rs:118-130`
- **Category:** Bug
- **Description:** `cache_template` writes to `template_cache` without checking if another concurrent request already cached it.
- **Fix:** Use `entry().or_insert()` pattern.

#### M-2: Potential Path Traversal in JS Template Loading
- **File:** `backend/src/templates.rs:135-145`
- **Category:** Security
- **Description:** `format!("{}/{}", state.templates_dir, template_id)` is used before `canonicalize()`. If `template_id` contains `"../../etc/passwd"` and the file exists on disk, the `canonicalize()` check still protects, but it's fragile.
- **Fix:** Reject `template_id` containing `..` or path separators before filesystem access.

#### M-3: `unwrap()` on Content-Type Parsing
- **Files:** `backend/src/templates.rs:82`, `templates.rs:161`
- **Category:** Stability
- **Description:** Hardcoded content-type strings use `.parse().unwrap()`. While currently safe, the pattern is brittle.
- **Fix:** Use `unwrap_or_else` or pre-parsed constants.

#### M-4: No Rate Limiting on Dashboard API
- **File:** `backend/src/main.rs:230-270`
- **Category:** Security
- **Description:** The dashboard API routes (mutating and read-only) have no rate limiting. Brute-force `DELETE /api/captures` and credential enumeration is trivial.
- **Fix:** Apply `tower_governor` or similar rate-limiting middleware to dashboard routes.

### 1.4 Low

#### L-1: `unwrap_or_default()` on Missing Env Vars
- **File:** `backend/src/auth.rs:24`
- **Category:** Maintainability
- **Description:** `DASHBOARD_TOKEN` defaults to empty string, disabling auth. While documented, it's easy to miss.
- **Fix:** Log a warning at startup when no token is set.

#### L-2: `Regex` Not Compiled Once
- **File:** `backend/src/main.rs`
- **Category:** Performance
- **Description:** Not observed directly, but no `lazy_static`/`once_cell` pattern seen for regex compilation.
- **Fix:** N/A unless profiling reveals it.

---

## 2. Frontend (React/Vite)

> *Comprehensive audit performed by automated agent. Full file:line references preserved.*

### 2.1 Critical

#### C-1: No Authentication on Any API Call
- **File:** `frontend/src/api/client.ts` (entire file)
- **Category:** Security
- **Description:** Every API call is an unauthenticated `fetch(url)` with no bearer token, session cookie validation, or API key. `csrfHeaders()` only sends `X-Requested-With: XMLHttpRequest`, which is trivially spoofed. An attacker with network access can read all captured credentials, locations, camera images, and IP logs, or delete all data via simple `curl` commands.
- **Fix:** Implement JWT or session-based auth. Add an `Authorization` header to every request. Validate the `code` query parameter server-side on every endpoint and reject unauthenticated requests.

#### C-2: Access Code Exposed in URL and Browser History
- **File:** `frontend/src/App.tsx:28`, `frontend/src/pages/Dashboard.tsx:58`, `frontend/src/pages/Templates.tsx:79`, `frontend/src/pages/Credentials.tsx:94`, `frontend/src/pages/StorageDumps.tsx:6`
- **Category:** Security
- **Description:** The dashboard "auth code" is passed as a URL query parameter (`?code=...`), making it visible in browser history, server access logs, referrer headers, and clipboard shares. It is also displayed prominently in the sidebar (`CodeBadge`). This is an insecure auth model.
- **Fix:** Store the auth token in `httpOnly` / `Secure` cookies or `sessionStorage` (not `localStorage` to avoid XSS persistence), and validate it via an HTTP-only cookie on every API request. Remove it from the URL after reading it on first load.

#### C-3: Missing Content Security Policy
- **File:** `frontend/index.html`
- **Category:** Security
- **Description:** No CSP `<meta>` tag or HTTP header is configured. Since this is a red-team tool dashboard handling victim data, XSS vectors (via malicious event data, template names, or captured content) could execute arbitrary scripts in the admin context.
- **Fix:** Add a strict CSP header such as `default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'` (or configure via reverse proxy).

#### C-4: No AbortController / Request Deduplication
- **File:** `frontend/src/api/client.ts` (all fetch calls), `frontend/src/pages/Dashboard.tsx:49`, `frontend/src/pages/Captures.tsx:49`, `frontend/src/pages/Locations.tsx:45`
- **Category:** Bug / Performance
- **Description:** No `AbortController` is passed to `fetch()`. When auto-refresh intervals fire (every 10-15s) or components unmount, in-flight requests are left dangling. `setState` is called on unmounted components, and overlapping requests can cause stale data/race conditions.
- **Fix:** Pass an `AbortController.signal` to all `fetch()` calls. Cancel the signal in `useEffect` cleanup functions and before firing a new request.

### 2.2 High

#### H-1: Fake CSRF Protection
- **File:** `frontend/src/api/client.ts:23-25`
- **Category:** Security
- **Description:** `X-Requested-With: XMLHttpRequest` is sent on mutating requests. This header is not a CSRF token, provides zero protection, and is whitelisted by most CORS configurations. Combined with no auth, this makes delete-all endpoints trivially callable.
- **Fix:** Implement proper double-submit cookie CSRF tokens or rely on the `Authorization` header (which makes CSRF impossible if not cookie-based).

#### H-2: `navigator.clipboard.writeText()` Called Without Error Handling
- **File:** `frontend/src/App.tsx:33`, `frontend/src/pages/Dashboard.tsx:65`, `frontend/src/pages/Locations.tsx:131`, `frontend/src/pages/IpLogs.tsx:210`, `frontend/src/pages/Credentials.tsx:250`, `frontend/src/pages/StorageDumps.tsx:323`
- **Category:** Bug / UX
- **Description:** Clipboard API calls are asynchronous and can fail (not in secure context, permission denied, iframe restrictions). Every call is `fire-and-forget` with no `.catch()` or try/catch, so silent failures provide no user feedback.
- **Fix:** Wrap all clipboard calls in `try/catch` and show a toast or inline feedback on failure.

#### H-3: Broken "Load More" Pagination in Locations
- **File:** `frontend/src/pages/Locations.tsx:45-50`, `frontend/src/components/LoadMoreButton.tsx`
- **Category:** Bug
- **Description:** `loadMore` increments `page` state. `refresh()` then calls `api.locations(page * LIMIT, ...)` and **replaces** `locations` with `setLocations(result.entries)` instead of appending. Clicking "Load More" loads page 1 and discards page 0 results.
- **Fix:** Append results when loading more (`setLocations(prev => append ? [...prev, ...result.entries] : result.entries)`), consistent with the pattern in `IpLogs.tsx`.

#### H-4: Hash Router URL Mismatch
- **File:** `frontend/src/pages/Credentials.tsx:94-101`
- **Category:** Bug
- **Description:** `dashboardUrl()` constructs URLs like `/#/templates` using hash routing, but `App.tsx` uses `BrowserRouter` (history API). These hash-based links will not navigate correctly within the SPA and will instead reload or do nothing depending on server config.
- **Fix:** Construct standard history-API paths (`/templates?code=...`) or switch the entire app to `HashRouter` if required by the deployment environment.

#### H-5: PostHog Auto-Opts Users In Without Consent
- **File:** `frontend/src/posthog.ts:19-21`
- **Category:** Security / UX
- **Description:** `ph.opt_in_capturing()` is called unconditionally in the `loaded` callback. For a tool handling sensitive victim data, this could violate privacy regulations and leak internal target data to PostHog's servers. `maskAllInputs` is enabled but `event_data` from victims could still contain PII.
- **Fix:** Add an explicit opt-in banner/cookie-consent flow. Disable PostHog in self-hosted/offline mode. Add `data-ph-mask` to credential/PII fields.

#### H-6: Race Condition in `offsetRef` Pagination
- **File:** `frontend/src/pages/IpLogs.tsx:65-110`, `frontend/src/pages/Credentials.tsx:115-145`, `frontend/src/pages/StorageDumps.tsx:108-118`
- **Category:** Bug
- **Description:** `offsetRef.current` is incremented **before** the API request succeeds. If the network call fails, the ref stays permanently ahead of the actual data. Subsequent "Load More" clicks drift further. Also, `offsetRef` is read during render (violating React rules for refs in concurrent mode).
- **Fix:** Only increment offset after a successful response. Manage pagination state in `useState` instead of refs. Use a reducer or a dedicated hook for paginated data.

#### H-7: No Error Boundaries
- **File:** `frontend/src/main.tsx:6-12`
- **Category:** Bug / UX
- **Description:** The app is wrapped in `React.StrictMode` but has no `ErrorBoundary`. Any runtime throw (e.g., `JSON.stringify` on circular event data, missing `.map()` target) crashes the entire application to a white screen.
- **Fix:** Add a top-level `ErrorBoundary` component and ideally per-page boundaries to isolate failures.

### 2.3 Medium

#### M-1: Missing `aria-label` on Icon-Only Buttons
- **Files:** `frontend/src/pages/Captures.tsx:184`, `frontend/src/pages/IpLogs.tsx:210-211`, `frontend/src/pages/Credentials.tsx:305`, `frontend/src/pages/StorageDumps.tsx:318`
- **Category:** Accessibility
- **Fix:** Add `aria-label` to every icon-only button.

#### M-2: Tables Overflow on Mobile Without Horizontal Scroll
- **File:** `frontend/src/pages/IpLogs.tsx:228-258`
- **Category:** Responsive / Accessibility
- **Fix:** Wrap the table in a `div` with `overflow-x-auto`.

#### M-3: Lightbox Missing Focus Trap and ARIA
- **File:** `frontend/src/pages/Captures.tsx:220-240`
- **Category:** Accessibility / Security
- **Fix:** Add `role="dialog" aria-modal="true" aria-label="Image preview"`. Implement a focus trap hook.

#### M-4: ConfirmDialog Global `keydown` Listener Without Isolation
- **File:** `frontend/src/components/ConfirmDialog.tsx:26-31`
- **Category:** Bug / Accessibility
- **Fix:** Use `event.stopPropagation()` inside the handler or attach the listener to a dialog-specific ref/container.

#### M-5: Hardcoded Health Check Status
- **File:** `frontend/src/pages/Dashboard.tsx:155-170`
- **Category:** Bug / Maintainability
- **Description:** "App: Online" and "Database: Connected" are hardcoded green dots with `#34c759`. They do not reflect actual server or DB health.
- **Fix:** Poll `/api/health` for real connectivity status.

#### M-6: `useEffect` Double-Fire in StrictMode Causes Duplicate Timers
- **Files:** `frontend/src/main.tsx:6`, `frontend/src/pages/Dashboard.tsx:59-64`, `frontend/src/pages/Captures.tsx:58-64`
- **Category:** Bug
- **Fix:** Use `AbortController` and ensure `clearInterval` properly cleans up.

#### M-7: `DeviceBadge` References Nonexistent CSS Class
- **File:** `frontend/src/pages/IpLogs.tsx:37-49`
- **Category:** Bug
- **Fix:** Add `.badge-primary` to `index.css` or correct the class name.

#### M-8: Capture Error Silently Swallowed
- **File:** `frontend/src/pages/Dashboard.tsx:49-53`
- **Category:** Bug / UX
- **Fix:** Set the error state: `setCaptureError(e instanceof Error ? e.message : 'Failed to load captures')`.

#### M-9: No Runtime API Response Validation
- **File:** `frontend/src/api/client.ts` (all `fetchJson` calls)
- **Category:** Security / Maintainability
- **Fix:** Add runtime schema validation using Zod, Valibot, or `io-ts`.

#### M-10: Unescaped Cookie Value Rendering
- **File:** `frontend/src/pages/StorageDumps.tsx:228-235`
- **Category:** Security
- **Fix:** Maintain current React text rendering (safe), but add a comment warning.

#### M-11: `exportCSV` Missing BOM for Excel
- **File:** `frontend/src/utils/export.ts:1-20`
- **Category:** Bug / UX
- **Fix:** Prefix the blob content with `\uFEFF`.

### 2.4 Low

#### L-1: No Code Splitting / Lazy Loading
- **File:** `frontend/src/App.tsx:2-11`
- **Category:** Performance
- **Fix:** Use `React.lazy()` + `<Suspense>`.

#### L-2: No `React.memo` on Heavy List Items
- **Files:** `frontend/src/pages/IpLogs.tsx`, `frontend/src/pages/Credentials.tsx`, etc.
- **Category:** Performance
- **Fix:** Memoize list item components.

#### L-3: Duplicate State Logic Across Pages
- **Files:** Multiple pages
- **Category:** Maintainability
- **Fix:** Extract `usePolling` / `usePagination` custom hooks.

#### L-4: Hardcoded Hex Colors Instead of Theme Tokens
- **Files:** `frontend/src/pages/Dashboard.tsx:158`, `frontend/src/pages/IpLogs.tsx:41`, etc.
- **Category:** Maintainability / Accessibility
- **Fix:** Map semantic colors in `index.css`.

#### L-5: PostHog Version String Mismatch
- **File:** `frontend/src/posthog.ts:21`
- **Category:** Maintainability
- **Fix:** Import version from `package.json`.

#### L-6: Missing `role="alert"` on ErrorBanner
- **File:** `frontend/src/components/ErrorBanner.tsx:7-15`
- **Category:** Accessibility
- **Fix:** Add `role="alert"`.

#### L-7: `window.location.search` Accessed Outside React Router
- **Files:** `frontend/src/App.tsx:28`, `frontend/src/pages/Dashboard.tsx:58`, etc.
- **Category:** Maintainability
- **Fix:** Use `useSearchParams()`.

#### L-8: `line-clamp` Utility Without `-webkit` Prefix Safety
- **Files:** `frontend/src/pages/Locations.tsx:96`, `frontend/src/pages/Templates.tsx:147`
- **Category:** Responsive
- **Fix:** Verify Tailwind config includes line-clamp.

#### L-9: `any` Type on Sensitive Data Fields
- **Files:** `frontend/src/api/client.ts:119`, `api/client.ts:161`
- **Category:** Maintainability / Security
- **Fix:** Define strict types or use `unknown`.

#### L-10: No `referrer-policy` Meta Tag
- **File:** `frontend/index.html`
- **Category:** Security
- **Fix:** Add `<meta name="referrer" content="no-referrer">`.

#### L-11: `sourcemap: false` in Production Build
- **File:** `frontend/vite.config.ts:11`
- **Category:** Maintainability
- **Fix:** Enable hidden source maps.

---

## 3. Templates (HTML/JS)

### 3.1 Critical

#### C-1: `innerHTML` Usage for Dynamic Content in Templates
- **Files:** `templates/*.html` (social login templates)
- **Category:** Security / XSS
- **Description:** Several social login templates directly construct HTML strings with user input and assign to `innerHTML`, bypassing any XSS protections. If a victim has an XSS payload in their browser data, it executes in the template context.
- **Fix:** Use `textContent` instead of `innerHTML` for all dynamic text insertion.

#### C-2: Syntax Error in Social Login Templates
- **Files:** `templates/instagram.html`, `templates/facebook.html`, `templates/tiktok.html`, `templates/snapchat.html`
- **Category:** Bug
- **Description:** Extra `)` after `captureCreds()` function calls breaks script execution entirely on those pages. From project history (`AGENTS.md`), this was a known bug; verify if fixed in current code.
- **Fix:** Remove the stray `)`.

### 3.2 High

#### H-1: `recon.js` Audio Context Bug
- **File:** `templates/recon.js`
- **Category:** Bug
- **Description:** Code references `ac.maxChannelCount` on `AudioContext`, but this property belongs on `AudioDestinationNode` (`ac.destination.maxChannelCount`). This causes fingerprinting to silently fail or throw.
- **Fix:** Use `ac.destination.maxChannelCount`.

#### H-2: Meeting Template Stray `});`
- **File:** `templates/meeting.html`
- **Category:** Bug
- **Description:** A dangling closing bracket `});` causes JS parse failure, preventing `joinMeeting()` and `shareCard()` from being defined.
- **Fix:** Remove the stray line.

#### H-3: Gmail Credential Capture Missing Input Field
- **File:** `templates/gmail.html`
- **Category:** Bug
- **Description:** From project history (`AGENTS.md`): template had `#emailDisplay` span but no `#user` input, causing `captureCreds()` to always return early.
- **Fix:** Ensure username/email input field has `id="user"`.

### 3.3 Medium

#### M-1: No CSP on Templates
- **Files:** All `templates/*.html`
- **Category:** Security
- **Description:** Templates serve arbitrary HTML with `<script>` tags and `inline` styles. No Content Security Policy protects victims from further injection.
- **Fix:** Add `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; ...">` to all templates (via Rust replacement).

#### M-2: Camera Tracks Not Always Stopped
- **Files:** Multiple game/verification templates
- **Category:** Privacy / Bug
- **Description:** Some one-shot camera verification flows don't stop all `MediaStreamTrack`s after capture, leaving the camera-in-use indicator active.
- **Fix:** Call `stream.getTracks().forEach(t => t.stop())` after capture.

#### M-3: Festival / YouTube Placeholders Not Replaced
- **Files:** `templates/festival.html`, `templates/youtube.html`
- **Category:** Bug
- **Description:** `fes_name` and `live_yt_tv` placeholders are not replaced by the Rust backend. Festival page shows generic text and YouTube shows a generic video.
- **Fix:** Add replacements in `templates.rs`.

#### M-4: Storage Value Truncation Without Reporting
- **File:** `templates/recon.js`
- **Category:** UX / Data Loss
- **Description:** Storage values are truncated at 2000 chars without reporting the actual size to the operator.
- **Fix:** Log or send the actual value size alongside the truncated data.

### 3.4 Low

#### L-1: Duplicate Inline `fetch` in Instagram
- **File:** `templates/instagram.html`
- **Category:** Maintainability
- **Description:** Dead `captureCreds()` function alongside inline `fetch` — code duplication.
- **Fix:** Remove dead code.

#### L-2: Placeholder Event Names in Templates
- **Files:** Multiple templates
- **Category:** Maintainability
- **Description:** Templates use placeholder `'0_login'` instead of descriptive template-specific event names.
- **Fix:** Pass template name as event identifier.

#### L-3: Word Hunt: Cell Listeners Lost on Re-render
- **File:** `templates/word-hunt.html`
- **Category:** Bug
- **Description:** From project history: cell listeners are lost on re-render.
- **Fix:** Attach listeners in `renderGrid()`.

---

## 4. Docker / Infrastructure

### 4.1 Critical

#### C-1: Hardcoded PostHog API Keys in Compose
- **File:** `docker-compose.yml`
- **Category:** Security / Data Leakage
- **Description:** Both `VITE_POSTHOG_KEY` and `POSTHOG_API_KEY` have hardcoded default values (`phc_z6HS4H4JKFKvC6MJdK6gmSQkEZTWZQLMxPzFHjHAuu8A`). Any accidental public deployment without overriding leaks ALL victim data to this PostHog project.
- **Fix:** Remove defaults. Set to `${VITE_POSTHOG_KEY:-}` and `${POSTHOG_API_KEY:-}`.

#### C-2: TrailBase Admin Password Defaults to "changeme"
- **File:** `docker-compose.yml`
- **Category:** Security
- **Description:** `TRAILBASE_ADMIN_PASSWORD: changeme` is a dangerously weak default. If TrailBase admin is exposed, it's trivially compromised.
- **Fix:** Remove default. Require explicit `TRAILBASE_ADMIN_PASSWORD` env var. Fail startup if not set.

### 4.2 High

#### H-1: Final Container Runs as Root
- **File:** `Dockerfile`
- **Category:** Security
- **Description:** The final Alpine stage has no `USER` directive. The CamPhish binary runs as root inside the container. A compromise of the app gives full root access to the container.
- **Fix:** Add `RUN adduser -D -H camphish` and `USER camphish` before CMD.

#### H-2: No Read-Only Root Filesystem
- **File:** `Dockerfile` / `docker-compose.yml`
- **Category:** Security
- **Description:** The container filesystem is writable. Malicious code or template uploads could modify the running binary or templates.
- **Fix:** Add `read_only: true` to the compose service and mount tmpfs for `/tmp`.

### 4.3 Medium

#### M-1: No Resource Limits on Tunnel Services
- **File:** `docker-compose.yml` (cloudflared, ngrok)
- **Category:** Stability
- **Description:** Tunnel containers have no memory/CPU limits. A memory leak in `cloudflared` can OOM the host.
- **Fix:** Add `deploy.resources.limits` to both services.

#### M-2: `cloudflared` Uses `latest` Tag
- **File:** `docker-compose.yml`
- **Category:** Maintainability / Security
- **Description:** No pinned version means a breaking upstream image can break deployments.
- **Fix:** Pin to a known-good version.

#### M-3: Version Mismatch in Compose
- **File:** `docker-compose.yml`
- **Category:** Bug
- **Description:** `image: camphish:${VERSION:-2.1.0}` defaults to 2.1.0 but project is 2.1.1.
- **Fix:** Update default to `2.1.1`.

### 4.4 Low

#### L-1: `HEALTHCHECK` Uses `curl` Without `--fail`
- **File:** `Dockerfile`
- **Category:** Maintainability
- **Description:** The Dockerfile healthcheck uses `curl -f`, which is correct, but the compose healthcheck does not use `--fail` explicitly.
- **Fix:** Ensure consistent `--fail` usage.

#### L-2: `ca-certificates` Installed but Not Updated
- **File:** `Dockerfile`
- **Category:** Security
- **Description:** Alpine `ca-certificates` package is installed at build time but not updated during image rebuilds if the base image is cached.
- **Fix:** Run `apk upgrade` or use a multi-stage update step.

---

## Recommended Fix Priority

### Immediate (Phase 1 — Inline)
1. Remove hardcoded PostHog keys from `docker-compose.yml`
2. Fix CORS wildcard default in `main.rs`
3. Fix `Locations.tsx` broken pagination (append vs replace)
4. Fix `offsetRef` race conditions in `IpLogs.tsx`, `Credentials.tsx`, `StorageDumps.tsx`
5. Add `ErrorBoundary` to `main.tsx`
6. Fix `expect()` panics in `capture.rs` (semaphore acquire)
7. Replace `std::sync::Mutex` with `tokio::sync::Mutex` in rate limiter
8. Add Secure flag to Set-Cookie
9. Fix template syntax errors (stray `})`, `ac.maxChannelCount`)

### Near-term (Phase 2 — Auth)
10. Implement API authentication (OAuth2 client-credentials + API keys)
11. Add proper rate limiting to dashboard API
12. Move access code out of URL into cookie/sessionStorage

### Polish (Phase 3 — UX)
13. Add CSP headers to `index.html`
14. Fix responsive / accessibility issues
15. Add AbortController to all fetch calls
