# CamPhish — Lessons Learned (Bug Log)

## Critical Bugs Found & Fixed

### 1. Game Crash on START (face-runner)
- **Symptom**: Game froze when clicking PLAY button
- **Root cause**: Variable name collision — `combo` was both a number (game state = 0) and incorrectly used as DOM element (`combo.style.opacity=0`). TypeError crashed silently.
- **Fix**: All DOM elements use `el` prefix (`elScore`, `elCombo`, `elMenu`). Game state vars use plain names (`score`, `combo`, `speed`).
- **Lesson**: NEVER use the same variable name for DOM elements and game state.

### 2. Docker Build Failure (debian:bookworm-slim)
- **Symptom**: `apt-get update` fails inside Docker container
- **Root cause**: Docker Desktop can't reach `deb.debian.org` (network issue specific to Docker Desktop on macOS)
- **Fix**: Switched to Alpine Linux (`apk add` works, different mirror)
- **Lesson**: Use Alpine for Docker images when apt-get is unreliable.

### 3. Rust Version Incompatibility
- **Symptom**: `cargo build` fails with "edition 2024 not supported"
- **Root cause**: Rust 1.80 doesn't support edition 2024 (required by sqlx 0.8)
- **Fix**: Use Rust 1.96 in Dockerfile (`FROM rust:1.96-alpine`)
- **Lesson**: Check edition requirements of dependencies before pinning Rust version.

### 4. TrailBase Migration Conflict
- **Symptom**: TrailBase skips our schema migration, tables never created
- **Root cause**: Our `V1__camphish.sql` conflicted with TrailBase's built-in `V1__initial` migration
- **Fix**: Renamed to `V7__camphish.sql` (V1-V6 are TrailBase built-ins)
- **Lesson**: Check for reserved migration version numbers in third-party systems.

### 5. SQL Syntax Error (missing parenthesis)
- **Symptom**: TrailBase fails with "near ',': syntax error"
- **Root cause**: `DEFAULT (lower(hex(randomblob(16)))` — missing closing paren
- **Fix**: `DEFAULT (lower(hex(randomblob(16))))` with double closing paren
- **Lesson**: Count parentheses carefully in SQL DEFAULT expressions.

### 6. SQL Syntax Error (missing comma)
- **Symptom**: TrailBase fails with "near 'name': syntax error"
- **Root cause**: `DEFAULT (lower(hex(randomblob(16))))` followed by next column without comma
- **Fix**: Added trailing comma: `DEFAULT (lower(hex(randomblob(16)))),`
- **Lesson**: Every column definition in CREATE TABLE must end with a comma (except the last).

### 7. Word Hunt — Cell Listeners Lost
- **Symptom**: Word selection doesn't work after grid re-renders
- **Root cause**: Event listeners attached ONCE outside renderGrid(), but grid HTML is regenerated on new game
- **Fix**: Attach listeners INSIDE renderGrid() so they survive re-renders
- **Lesson**: When dynamically generating HTML, attach event listeners in the same function that creates the elements.

### 8. Color Match — Pads Not Clickable
- **Symptom**: Pads don't respond to clicks
- **Root cause**: Click handlers set up in `DOMContentLoaded` which fires before script at bottom of body
- **Fix**: Set up handlers immediately (script is at bottom, DOM is ready)
- **Lesson**: If script is at end of body, DOM is already loaded — don't wait for DOMContentLoaded.

### 9. Dress-Up — Hidden Start Button
- **Symptom**: User can't start the game
- **Root cause**: Start button had `class="hidden"` (display:none)
- **Fix**: Removed hidden class, game auto-starts on page load
- **Lesson**: Don't hide the primary action button. Auto-start if possible.

### 10. Festival — Infinite Spinner
- **Symptom**: Page shows spinner forever, nothing happens
- **Root cause**: Template was just a loading screen with no interactivity
- **Fix**: Rewrote as interactive gift-opening experience with canvas fireworks
- **Lesson**: Every template must have user interaction, not just a loading screen.

### 11. Sports Predictor — Result Hidden
- **Symptom**: Prediction result never shows
- **Root cause**: Result div stayed `display:none` even after prediction
- **Fix**: Properly toggle `classList.add('active')` and disable submit button
- **Lesson**: Verify CSS class toggling actually changes visibility.

### 12. App Going Down / DB Dead
- **Symptom**: App crashes, DB disappears, data lost
- **Root cause**: `docker compose down -v` deletes persistent volumes including DB
- **Fix**: NEVER use `-v` flag. Use `docker compose down` (without -v) to preserve data.
- **Lesson**: The `-v` flag is destructive. Only use when intentionally wiping all data.

### 13. Fingerprint INSERT Column Mismatch
- **Symptom**: Fingerprint capture fails silently
- **Root cause**: INSERT had 21 column bindings but schema had 32 columns
- **Fix**: Aligned INSERT statement to full schema with all 32 columns
- **Lesson**: Keep INSERT statements in sync with schema changes.

### 14. Dashboard Tailwind Dynamic Classes
- **Symptom**: Stat card colors don't apply
- **Root cause**: Tailwind JIT can't process dynamic class strings like `bg-${color}-500/40`
- **Fix**: Use static classes (`text-cyan-400`) instead of dynamic template strings
- **Lesson**: Tailwind purges unused classes. Dynamic strings are invisible to the compiler.

### 15. Graceful Shutdown — Instant Exit
- **Symptom**: App exits immediately after starting
- **Root cause**: Graceful shutdown future completed instantly (`async { log; }`)
- **Fix**: Wait for `tokio::signal::ctrl_c()` instead
- **Lesson**: Graceful shutdown futures must actually WAIT for a signal, not just log and return.

## Architecture Decisions
1. SQLite over Postgres: zero-config, WAL mode sufficient
2. Alpine over Debian: smaller image, apt-get broken in Docker Desktop
3. Rust 1.96: required for sqlx 0.8 edition 2024
4. TrailBase V7: V1-V6 reserved by TrailBase
5. recon.js shared: all templates get same recon features
6. Credential capture: social login templates send to /api/capture/credentials
7. el prefix convention: prevent DOM/state variable collisions
