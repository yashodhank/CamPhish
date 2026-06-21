# CamPhish User Guide

**Audience:** Penetration Testers, Security Researchers, End Users

> ⚠️ **This document describes the legacy v3 PHP-based architecture (Apache + PHP + Heroku).**
> The current version (v2.1) is a Rust (axum) + React (Vite/TypeScript/TailwindCSS) stack with Docker.
> For the current user workflow, see the [Red Team Playbook](./RED-TEAM-PLAYBOOK.md) or check the [README](../README.md).

---

## Table of Contents

1. [What is CamPhish?](#what-is-camphish)
2. [How It Works](#how-it-works)
3. [Installation](#installation)
4. [Running a Session](#running-a-session)
5. [Choosing a Template](#choosing-a-template)
6. [Understanding the Dashboard](#understanding-the-dashboard)
7. [Managing Captured Data](#managing-captured-data)
8. [Best Practices](#best-practices)
9. [FAQ](#faq)

---

## What is CamPhish?

CamPhish is a social engineering tool that captures camera snapshots and GPS location from a target's device by sending them a link. When the target opens the link, they see a legitimate-looking page (festival greeting, YouTube video, or meeting invitation) while their browser is prompted for camera and location permissions.

**What it captures:**
- Front/back camera snapshots (periodic)
- GPS coordinates with Google Maps link
- IP address and browser User-Agent

**What it does NOT do:**
- Install malware
- Access files on the device
- Record audio or video
- Run in the background after tab is closed

---

## How It Works

### The Target's Experience

1. Target receives a link (via SMS, email, social media, etc.)
2. Target clicks the link
3. A loading page appears: "Loading, please wait..."
4. Browser prompts: "This site wants to know your location" → Allow/Block
5. Browser prompts: "This site wants to use your camera" → Allow/Block
6. Target sees the template page (festival greeting, YouTube video, meeting)
7. If camera was allowed, periodic snapshots are taken silently
8. Target closes the tab — session ends

### What the Operator Sees

1. Start CamPhish → get a phishing link
2. Send link to target
3. Dashboard updates in real-time:
   - IP address appears when target opens link
   - GPS coordinates appear when location is allowed
   - Camera snapshots appear as they're captured
4. All data saved to `./data/` directory

---

## Installation

### Prerequisites

- **Docker** (Docker Desktop on Mac/Windows, Docker Engine on Linux)
- **git** (to clone the repository)

### Quick Install

```bash
# Clone
git clone https://github.com/yashodhank/CamPhish
cd CamPhish

# Configure
cp .env.example .env

# Edit .env — at minimum, choose your tunnel:
# TUNNEL=cloudflared   (recommended, no account needed)
# TUNNEL=ngrok         (requires free ngrok account)

# Build (first time only)
docker compose build

# Start
./camphish up
```

### Installing pack CLI (Optional)

```bash
# macOS
brew install buildpacks/tap/pack

# Linux
(curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.40.6/pack-v0.40.6-linux.tgz" | sudo tar -C /usr/local/bin/ --no-same-owner -xzv pack)
```

With pack CLI, you can build OCI images without Dockerfile:
```bash
./camphish build
```

---

## Running a Session

### Step 1: Configure

Edit `.env` to set your preferences:

```bash
# Tunnel choice
TUNNEL=cloudflared          # No account needed, reliable

# Template choice
DEFAULT_TEMPLATE=1          # 1=Festival, 2=YouTube, 3=Meeting
FESTIVAL_NAME=Diwali        # If using Festival template
YOUTUBE_VIDEO_ID=dQw4w9WgXcQ  # If using YouTube template

# Session name (organizes captures)
SESSION_NAME=target-1
```

### Step 2: Start

```bash
./camphish up
```

Output:
```
Starting local deployment (tunnel: cloudflared)...
Waiting for services...
Phishing link: https://some-name.trycloudflare.com
Dashboard: http://localhost:8080
```

### Step 3: Send Link

Copy the phishing link and send it to your target via any channel.

### Step 4: Monitor

Open `http://localhost:8080` in your browser to view the dashboard.

### Step 5: Stop

```bash
./camphish down
```

---

## Choosing a Template

CamPhish includes three templates designed to encourage camera permission:

### Template 1: Festival Wishing

**File:** `festivalwishes.html`
**Best for:** Cultural/religious occasions, birthdays, celebrations

The target sees a festive greeting page with animations. The camera permission is requested under the guise of "taking a celebration selfie."

**Configuration:**
```bash
DEFAULT_TEMPLATE=1
FESTIVAL_NAME=Diwali    # Any festival name
```

### Template 2: Live YouTube TV

**File:** `LiveYTTV.html`
**Best for:** Tech-savvy targets, video content consumers

The target sees what appears to be a YouTube live stream. Camera permission is framed as "join the live chat with video."

**Configuration:**
```bash
DEFAULT_TEMPLATE=2
YOUTUBE_VIDEO_ID=dQw4w9WgXcQ    # Any YouTube video ID
```

### Template 3: Online Meeting

**File:** `OnlineMeeting.html`
**Best for:** Corporate/professional targets

The target sees a fake online meeting interface (Zoom/Meet style). Camera permission is expected as part of "joining the meeting."

**Configuration:**
```bash
DEFAULT_TEMPLATE=3
```

### Template Comparison

| Feature | Festival | YouTube | Meeting |
|---------|----------|---------|---------|
| Realism | Medium | High | High |
| Camera expectation | Low | Medium | High |
| Location expectation | Low | Low | Medium |
| Customization | Festival name | Video ID | None |
| Best target type | General | Tech-savvy | Professional |

---

## Understanding the Dashboard

### Access

```
http://localhost:8080
```

### Layout

```
┌────────────────────────────────────────────┐
│  CamPhish Dashboard    Session: target-1  │
│  [Refresh]                                 │
├────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Captures │ │ Locations│ │ IP Logs  │  │
│  │    12    │ │    3     │ │    5     │  │
│  └──────────┘ └──────────┘ └──────────┘  │
├────────────────────────────────────────────┤
│  Camera Captures                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ [img]   │ │ [img]   │ │ [img]   │ ... │
│  │ cam...  │ │ cam...  │ │ cam...  │     │
│  │ 45 KB   │ │ 52 KB   │ │ 38 KB   │     │
│  └─────────┘ └─────────┘ └─────────┘     │
├────────────────────────────────────────────┤
│  GPS Locations                             │
│  37.7749, -122.4194 → Google Maps         │
│  Accuracy: 10 meters                       │
├────────────────────────────────────────────┤
│  IP Log                                    │
│  203.0.113.42 - Mozilla/5.0 ...           │
│  198.51.100.7 - Chrome/120 ...            │
└────────────────────────────────────────────┘
```

### Features

- **Stats bar** — at-a-glance counts of captures, locations, IP logs
- **Capture gallery** — click any thumbnail to open full-size lightbox view
- **GPS viewer** — coordinates with clickable Google Maps links
- **IP log** — scrollable list of all IPs and User-Agents
- **Refresh button** — reloads dashboard to show new data

### Real-Time Updates

The dashboard does NOT auto-refresh. Click the **Refresh** button or reload the page to see new captures.

---

## Managing Captured Data

### Data Locations

All captured data is stored in `./data/`:

```
data/
├── captures/
│   ├── cam20062026123456.png
│   ├── cam20062026123458.png
│   └── ...
├── locations/
│   ├── location_20062026123456.txt
│   ├── current_location.txt
│   └── saved.locations.txt
├── logs/
│   ├── ip.txt
│   ├── saved.ip.txt
│   └── ...
└── config/
    └── session.env
```

### Viewing Captures

**Via Dashboard:** Open `http://localhost:8080`, click thumbnails.

**Via File System:**
```bash
open data/captures/          # macOS
xdg-open data/captures/      # Linux
start data/captures/         # Windows
```

### Viewing Locations

**Via Dashboard:** GPS coordinates with Google Maps links.

**Via File System:**
```bash
cat data/locations/location_*.txt
```

Output:
```
Latitude: 37.7749
Longitude: -122.4194
Accuracy: 10 meters
Google Maps: https://www.google.com/maps/place/37.7749,-122.4194
Date: 20062026123456
```

### Exporting Data

```bash
# Export all captures as a zip
zip -r session-captures.zip data/captures/

# Export all locations
cp data/locations/saved.locations.txt ./session-locations.txt

# Export IP log
cp data/logs/saved.ip.txt ./session-ips.txt
```

### Cleaning Up

```bash
# Remove all captured data
./camphish clean

# Remove only captures (keep locations and logs)
rm data/captures/*

# Remove everything from a specific session
rm -rf data/
```

---

## Best Practices

### Operational Security

1. **Use Cloudflare Tunnel** (`TUNNEL=cloudflared`) — no account needed, no logs tied to you
2. **Use a VPS** for production — don't run from home IP
3. **Enable Cloudflare Orange Cloud** — hides your VPS IP from target
4. **Rotate session names** — don't reuse `SESSION_NAME` across targets
5. **Clean data after each session** — `./camphish clean`

### Template Selection

1. **Match template to target** — Festival for personal, Meeting for professional
2. **Customize festival name** — use a festival the target actually celebrates
3. **Use relevant YouTube video** — pick a video the target would watch
4. **Test the link yourself first** — verify the page looks convincing

### Link Delivery

1. **URL shorteners** — use bit.ly or TinyURL to hide the trycloudflare.com domain
2. **Contextual message** — "Check out this Diwali greeting!" not just a raw link
3. **HTTPS only** — all CamPhish links are HTTPS (green padlock in browser)
4. **Mobile-first** — most targets open links on phones (front camera access)

### Data Handling

1. **Archive immediately** — export data after each session
2. **Encrypt at rest** — store exported data in encrypted volume
3. **Delete after use** — don't keep captures longer than needed
4. **Never share captures** — even anonymized, images can be reverse-searched

---

## FAQ

### Q: Does this work on iPhones?
**A:** Yes, but Safari requires explicit user gesture for camera access. The template page must have a "Start Camera" button that the user clicks. Current templates work best on Chrome/Firefox.

### Q: Does the target know they're being recorded?
**A:** The browser shows a camera indicator (green dot on iOS, red dot on Android, camera icon in browser tab). The target must click "Allow" on the permission prompt.

### Q: How many snapshots are taken?
**A:** The template JavaScript captures periodically (every few seconds) while the page is open. There's no fixed limit — it continues until the target closes the tab.

### Q: Can I use my own domain?
**A:** Yes. Set `DEPLOY_MODE=self-hosted` and configure `DOMAIN` and `SUBDOMAIN` in `.env`. Requires a VPS with Docker.

### Q: What if the target denies camera permission?
**A:** The template page still displays normally. IP and location (if allowed) are still captured. Only camera snapshots are missed.

### Q: What if the target denies location permission?
**A:** The page still loads and redirects to the template. IP is still captured. Only GPS data is missed.

### Q: Is this legal?
**A:** CamPhish is a penetration testing tool. Use only on devices you own or have explicit written authorization to test. Unauthorized use may violate computer fraud laws in your jurisdiction.

### Q: Can I run multiple sessions simultaneously?
**A:** Yes. Run separate instances with different `SESSION_NAME` and `DASHBOARD_PORT`:
```bash
SESSION_NAME=target1 DASHBOARD_PORT=8081 ./camphish up
SESSION_NAME=target2 DASHBOARD_PORT=8082 ./camphish up
```

### Q: How do I change the template mid-session?
**A:** Edit `.env`, change `DEFAULT_TEMPLATE`, then restart:
```bash
./camphish restart
```

### Q: The tunnel link stopped working. What do I do?
**A:** Cloudflare Tunnel links expire when the container stops. Restart to get a new link:
```bash
./camphish restart
./camphish link
```

### Q: Can I use this without Docker?
**A:** The original bash script (`camphish.sh`) still works without Docker. However, v3.0 features (dashboard, persistent storage, multi-mode deployment) require Docker.
