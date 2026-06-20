# CamPhish Red Team Playbook

## Core Vision
CamPhish captures personal data (IP addresses, GPS coordinates, biometric data via camera) for authorized cybersecurity research and penetration testing.

## Capture Capabilities

### 1. IP Address
- **Method**: HTTP headers (X-Forwarded-For, X-Real-IP)
- **No permission needed**: Automatic on page load
- **Stored**: ip_logs table with timestamp

### 2. GPS Location
- **Method**: navigator.geolocation.getCurrentPosition()
- **Permission required**: Browser prompt ("This site wants to know your location")
- **Pretext**: "Regional leaderboard", "Nearby players", "Local multiplayer"
- **Stored**: locations table with lat, lon, accuracy, altitude, heading, speed
- **Auto re-request**: If previously granted, silently re-acquires (no prompt)

### 3. Camera Biometrics
- **Method**: navigator.mediaDevices.getUserMedia() → canvas.toDataURL()
- **Permission required**: Browser prompt ("This site wants to use your camera")
- **Pretext**: "Face control", "Face verification", "Virtual mirror", "QR scan", "Aura scan"
- **Stored**: PNG files in /data/captures/ + captures table
- **Capture interval**: 2-3 seconds during active session
- **Auto re-request**: If previously granted, silently re-acquires (no prompt)

### 4. Device Fingerprint (25+ vectors)
- Canvas fingerprint (unique rendering hash)
- WebGL vendor + renderer + version
- Audio context (sample rate, max channels)
- Font enumeration (28 test fonts)
- Battery API (level, charging, charging/discharging time)
- WebRTC local IP (bypasses NAT/VPN)
- Screen resolution, color depth, pixel ratio
- Timezone, timezone offset, language, languages
- Hardware concurrency, device memory
- Max touch points, cookie enabled, DNT
- Media devices (camera/mic count)
- Sensors (gyroscope, accelerometer)
- Speech synthesis voices
- Network info (type, downlink, RTT, save-data)
- **No permission needed**: Automatic via recon.js

### 5. Gender Detection
- **Method**: Social media favicon timing analysis
- **Female indicators**: Pinterest, Instagram, Tumblr, Etsy, SHEIN
- **Male indicators**: Reddit, Steam, LinkedIn, ESPN, OpenSea
- **Neutral**: YouTube, Facebook, Twitter
- **Accuracy**: ~70% (timing-based heuristic)
- **No permission needed**: Automatic via recon.js

### 6. Cookie/Storage Grabbing
- **document.cookie**: All first-party cookies
- **localStorage**: All keys/values (truncated >2KB)
- **sessionStorage**: All per-tab keys/values
- **IndexedDB**: Database name enumeration
- **No permission needed**: Automatic via recon.js

### 7. Browser History Detection
- **Method**: Favicon timing attack (<10ms = cached = visited)
- **12 sites**: Facebook, Instagram, TikTok, Snapchat, YouTube, Netflix, Amazon, eBay, Binance, Coinbase, GitHub, StackOverflow
- **5 categories**: social, video, shopping, crypto, dev
- **No permission needed**: Automatic via recon.js

### 8. Credential Capture
- **Method**: Social login templates capture username + password fields
- **Templates**: Instagram, Facebook, TikTok, Snapchat, Gmail
- **Stored**: credentials table with IP + timestamp
- **Pretext**: Login form → "Face verification" → credentials sent before verification

## Template Selection Guide

### By Target Demographic
| Demographic | Best Template | Camera Pretext |
|-------------|--------------|----------------|
| 16-35 female | beauty-quiz | "Virtual Mirror try-on" |
| 16-35 female | dress-up | "Style Studio" (no camera needed) |
| 16-35 female | horoscope | "Aura Scan" |
| 16-35 female | instagram | "Face Verification" |
| 16-35 female | snapchat | "Snap Camera Login" |
| 16-24 mixed | tiktok | "Face Login" |
| 18-45 male | sports-predictor | "Fan Identity Verification" |
| 18-45 male | face-runner | "Face Control" (optional) |
| All ages | bubble-pop | "Face Control" (optional) |
| All ages | pet-catch | "Face Control" (optional) |
| All ages | color-match | "Face Control" (optional) |
| 20-40 puzzle | word-hunt | "Face Control" (optional) |
| Universal | whatsapp | "QR Code Scan" |
| Universal | gmail | "Identity Verification" |
| Universal | facebook | "Face Recognition" |
| Festival | festival | "Camera greeting" |

### By Engagement Duration
| Template | Avg Engagement | Captures per session |
|----------|---------------|---------------------|
| face-runner | 2-10 min | 60-300 |
| bubble-pop | 1-5 min | 30-150 |
| pet-catch | 1-5 min | 30-150 |
| color-match | 1-3 min | 20-90 |
| word-hunt | 1 min (60s timer) | 20-30 |
| dress-up | 30s-2 min | 10-60 |
| instagram | 5-10s | 2-5 |
| gmail | 5-10s | 2-5 |
| festival | 10-30s | 3-10 |

## 10 Red Team Enhancement Ideas (Future)

1. **Clipboard Hijacker**: Overwrite clipboard with phishing link when target copies text
2. **WebRTC Network Topology**: Enumerate all local IPs, identify router model, detect VPN
3. **Persistent Service Worker**: Survive tab close, re-engage with notifications
4. **QR Code Cross-Device**: Desktop user scans QR → phone compromised (better camera)
5. **Battery Status Profiling**: Low battery = shorter template, charging = at home
6. **Ambient Light Sensor**: Dark room = nighttime, bright = outdoors
7. **Bluetooth Enumeration**: Detect smartwatch/earbuds = wealth indicator
8. **Referrer Exploitation**: Dynamic template switching based on social media referrer
9. **Progressive Permission Escalation**: Notification → Location → Camera (trust building)
10. **Cross-Device Session Linking**: Phone + desktop unified via canvas fingerprint

## Operational Security
- Use Cloudflare Tunnel (no account needed, no logs tied to you)
- Use VPS for production (don't run from home IP)
- Enable Cloudflare Orange Cloud (hides VPS IP)
- Rotate session names per target
- Clean data after each engagement
- URL shorteners to hide trycloudflare.com domain
- All links are HTTPS (green padlock)
