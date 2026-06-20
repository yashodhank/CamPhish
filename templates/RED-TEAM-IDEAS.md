# CamPhish v2 — Red Team Enhancement Ideas

## 10 Red Team Enhancement Ideas

### 1. **Clipboard Hijacker Payload**
When target copies text from the page (e.g., a "promo code"), overwrite clipboard with phishing link.
- Target shares promo code → pastes phishing URL instead
- Viral spread through copy-paste behavior
- Works on mobile (clipboard API) and desktop

### 2. **WebRTC IP Leak + Network Topology Mapping**
Use STUN requests to enumerate all local network IPs (not just the gateway).
- Map internal network: 192.168.x.x, 10.x.x.x, 172.16.x.x
- Identify router model via default gateway fingerprint
- Detect corporate VPN (multiple interface IPs)
- Useful for internal phishing pivot planning

### 3. **Persistent Service Worker**
Register a service worker that survives page close.
- Re-engages target with notifications ("New game level available!")
- Background sync API for delayed data exfiltration
- Survives tab close — persists across sessions
- Service worker can cache phishing page for offline access

### 4. **Clipboard + QR Code Combo**
Generate a QR code on the page that the target scans with their phone.
- QR contains phishing link → target scans → opens on phone (better camera access)
- Cross-device pivot: desktop user scans QR → phone compromised
- Phone cameras are more personal → higher quality captures

### 5. **Battery Status API Exploitation**
Use battery level/charging state for behavioral profiling.
- Low battery + not charging → shorter engagement template
- Full battery + charging → long game session
- Charging state predicts location (home/office vs mobile)
- Cross-reference with time of day for lifestyle profiling

### 6. **Ambient Light Sensor Recon**
Use Ambient Light Sensor API to detect target environment.
- Dark room → nighttime → at home → longer engagement
- Bright light → outdoors → mobile → quick template
- Detect screen brightness changes for engagement tracking
- Profile work hours (office lights on/off patterns)

### 7. **Bluetooth Device Enumeration**
Use Web Bluetooth API (requires permission) to scan nearby devices.
- Detect smartwatch, earbuds, fitness tracker → wealth indicator
- Device names reveal personal info ("John's AirPods")
- Bluetooth presence = physical proximity confirmation
- Cross-reference device count with location for environment profiling

### 8. **Social Media Referrer Exploitation**
Analyze `document.referrer` to identify which platform the target came from.
- Facebook referrer → show Facebook-style template
- WhatsApp referrer → show shareable game template
- Instagram referrer → show visual/fashion template
- Twitter referrer → show text/word game template
- Dynamically switch template based on referrer for maximum relevance

### 9. **Progressive Permission Escalation**
Start with no-permission engagement, escalate gradually.
- Round 1: No permissions needed (game works)
- Round 2: "Save your score" → requests notification permission
- Round 3: "Nearby leaderboard" → requests location
- Round 4: "Face-controlled mode" → requests camera
- Each step builds trust, reducing permission denial rate

### 10. **Cross-Device Session Linking**
When target opens link on phone, detect if they have the desktop version open.
- Use same canvas fingerprint to link sessions
- Phone session = better camera, desktop session = longer engagement
- If both detected: use phone for camera capture, desktop for engagement
- Unified timeline in dashboard showing both devices
