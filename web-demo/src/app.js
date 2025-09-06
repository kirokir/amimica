/**
 * MIMICA - Main Application Logic
 */
import { PoseRenderer } from './renderer.js';
import { PoseMapper } from './mapper.js';
import { Smoother } from './smoother.js';
import { ActionRecognizer } from './action-recognizer.js';

class MimicaApp {
    constructor() {
        // Core elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Modules
        this.renderer = new PoseRenderer(this.ctx);
        this.mapper = new PoseMapper();
        this.smoother = new Smoother();
        this.actionRecognizer = new ActionRecognizer();
        
        // State & Readiness Flags
        this.pose = null;
        this.lastPoseTime = 0;
        this.isDetecting = false;
        this.settings = this.loadSettings();
        this.cameraReady = false;
        this.mediaPipeReady = false;
        this.faceApiReady = false;
        
        // Expression State
        this.lastExpression = 'neutral';
        this.lastFaceDetectionTime = 0;

        // Recording State
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordedActions = [];
        this.isRecording = false;
        this.recordingStartTime = 0;

        this.init();
    }

    async init() {
        this.setupUI();
        await Promise.all([
            this.loadMediaPipe(),
            this.loadFaceAPI(),
            this.setupCamera()
        ]);
        this.startAnimation();
    }

    loadSettings() {
        const defaults = {
            characterMode: 'blocky', resolution: '640x360', smoothing: 0.3, 
            fpsCap: 15, confidence: 0.5, mirror: true, ik: false,
            recordBackground: true, expression: false
        };
        try {
            const saved = JSON.parse(localStorage.getItem('mimica-settings')) || {};
            if (typeof saved.skeleton !== 'undefined') {
                saved.characterMode = saved.skeleton ? 'skeleton' : 'filled';
                delete saved.skeleton;
            }
            return { ...defaults, ...saved };
        } catch { return defaults; }
    }

    saveSettings() { try { localStorage.setItem('mimica-settings', JSON.stringify(this.settings)); } catch (e) { console.warn('Could not save settings:', e); } }

    setupUI() {
        const controls = {
            'character-mode-select': 'characterMode', 'resolution-select': 'resolution', 
            'smoothing-slider': 'smoothing', 'fps-slider': 'fpsCap',
            'confidence-slider': 'confidence', 'mirror-toggle': 'mirror', 
            'ik-toggle': 'ik', 'record-background-toggle': 'recordBackground',
            'expression-toggle': 'expression' // Add expression toggle to UI mapping
        };
        for (const [id, key] of Object.entries(controls)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const isCheckbox = el.type === 'checkbox';
            el[isCheckbox ? 'checked' : 'value'] = this.settings[key];
            el.addEventListener(isCheckbox ? 'change' : 'input', e => {
                const value = isCheckbox ? e.target.checked : (id.includes('slider') ? parseFloat(e.target.value) : e.target.value);
                this.settings[key] = value;
                if (id.includes('slider')) {
                    const valueEl = document.getElementById(id.replace('-slider', '-value'));
                    if (valueEl) valueEl.textContent = value.toFixed(1);
                }
                if (key === 'smoothing') this.smoother.setAlpha(this.settings.smoothing);
                if (key === 'resolution') this.setupCamera();
                this.saveSettings();
            });
            if (id.includes('slider')) {
                const valueEl = document.getElementById(id.replace('-slider', '-value'));
                if (valueEl) valueEl.textContent = this.settings[key].toFixed(1);
            }
        }
        document.getElementById('calibrate-btn').addEventListener('click', () => this.smoother.reset());
        document.getElementById('retry-camera').addEventListener('click', () => this.setupCamera());
        document.getElementById('record-btn').addEventListener('click', () => {
            if (this.isRecording) { this.stopRecording(); } else { this.startRecording(); }
        });
    }

    async loadFaceAPI() {
        this.faceApiReady = false;
        try {
            // face-api.js is loaded via script tag in index.html
            // We just need to load its models.
            await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            await faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            await faceapi.nets.faceExpressionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            this.faceApiReady = true;
            console.log('face-api.js models loaded successfully.');
        } catch (error) {
            console.error('Failed to load face-api.js models:', error);
            this.showError('Could not load expression recognition models.');
        }
    }
    
    async detectExpression() {
        if (!this.faceApiReady || !this.settings.expression || this.isRecording) return; // Disable during recording to prioritize performance
        
        const now = performance.now();
        if (now - this.lastFaceDetectionTime < 500) return; // Run check every 500ms
        this.lastFaceDetectionTime = now;

        const detections = await faceapi.detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        if (detections && detections.expressions) {
            const expressions = detections.expressions;
            const primaryExpression = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
            this.lastExpression = primaryExpression;
        }
    }

    onPoseResults(results) {
        this.isDetecting = false;
        const inferenceTime = performance.now() - this.lastPoseTime;
        document.getElementById('inference-time').textContent = `Inference: ${inferenceTime.toFixed(0)}ms`;
        if (results.poseLandmarks) {
            let points = this.mapper.landmarksToPoints(results.poseLandmarks, this.canvas.width, this.canvas.height, this.settings.mirror);
            points = points.map((p, i) => (p && results.poseLandmarks[i].visibility < this.settings.confidence) ? this.smoother.getPrevious(i) : p);
            const smoothedPoints = this.smoother.smooth(points);
            this.pose = this.settings.ik ? this.mapper.applyIK(smoothedPoints) : smoothedPoints;
            
            if (this.pose) {
                const actionName = this.actionRecognizer.recognize(this.pose);
                document.getElementById('action-display').textContent = `Action: ${actionName}`;
                
                if (this.isRecording) {
                    this.recordedActions.push({
                        timestamp: Math.round(performance.now() - this.recordingStartTime),
                        action: actionName,
                        expression: this.settings.expression ? this.lastExpression : null,
                        pose: this.pose.map(p => p ? {x: Math.round(p.x), y: Math.round(p.y)} : null)
                    });
                }
            }
        }
    }
    
    render() {
        if (this.isRecording && !this.settings.recordBackground) {
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (!this.isRecording || this.settings.recordBackground) {
            this.ctx.save();
            if (this.settings.mirror) {
                this.ctx.scale(-1, 1);
                this.ctx.translate(-this.canvas.width, 0);
            }
            this.ctx.globalAlpha = 0.3;
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
        
        // Update expression display
        document.getElementById('expression-display').textContent = `Expression: ${this.settings.expression ? this.lastExpression : '--'}`;

        this.ctx.globalAlpha = 1.0;
        if (this.pose) {
            switch (this.settings.characterMode) {
                case 'skeleton': this.renderer.drawSkeleton(this.pose); break;
                case 'filled': this.renderer.drawFilledCharacter(this.pose); break;
                case 'blocky': this.renderer.drawBlockyCharacter(this.pose); break;
            }
        }
    }

    startAnimation() {
        let frameCount = 0; let lastFpsTime = performance.now();
        const animate = (now) => {
            this.detectPose();
            this.detectExpression(); // Run expression detection in the loop
            this.render();
            frameCount++;
            if (now - lastFpsTime >= 1000) {
                document.getElementById('fps-counter').textContent = `FPS: ${frameCount}`;
                frameCount = 0; lastFpsTime = now;
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    // All other methods (startRecording, stopRecording, loadMediaPipe, setupCamera, detectPose, showError) remain unchanged.
    // I am including them here for completeness.

    startRecording() {
        if (!this.canvas) return;
        this.isRecording = true;
        this.recordingStartTime = performance.now();
        this.recordedChunks = [];
        this.recordedActions = [];
        document.getElementById('download-area').style.display = 'none';
        const stream = this.canvas.captureStream(30);
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
        this.mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) this.recordedChunks.push(event.data); };
        this.mediaRecorder.onstop = () => {
            const videoBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
            document.getElementById('download-link-video').href = URL.createObjectURL(videoBlob);
            const jsonData = {
                metadata: { date: new Date().toISOString(), durationMs: performance.now() - this.recordingStartTime, sourceResolution: `${this.canvas.width}x${this.canvas.height}` },
                frames: this.recordedActions
            };
            const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            document.getElementById('download-link-json').href = URL.createObjectURL(jsonBlob);
            document.getElementById('download-area').style.display = 'flex';
        };
        this.mediaRecorder.start();
        const recordBtn = document.getElementById('record-btn');
        recordBtn.textContent = 'Stop Recording';
        recordBtn.classList.add('recording');
        document.getElementById('recording-indicator').style.display = 'inline';
    }

    stopRecording() {
        if (this.mediaRecorder) this.mediaRecorder.stop();
        this.isRecording = false;
        const recordBtn = document.getElementById('record-btn');
        recordBtn.textContent = 'Start Recording';
        recordBtn.classList.remove('recording');
        document.getElementById('recording-indicator').style.display = 'none';
    }

    async loadMediaPipe() {
        this.mediaPipeReady = false;
        document.getElementById('loading-message').style.display = 'flex';
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
            await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
            this.poseDetection = new window.Pose({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}` });
            this.poseDetection.setOptions({ modelComplexity: 0, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            this.poseDetection.onResults(r => this.onPoseResults(r));
            await this.poseDetection.initialize();
            this.mediaPipeReady = true;
        } catch (error) { this.showError('Failed to load pose detection models.'); }
    }

    async setupCamera() {
        this.cameraReady = false;
        document.getElementById('error-message').style.display = 'none';
        document.getElementById('loading-message').style.display = 'flex';
        try {
            if (this.video.srcObject) { this.video.srcObject.getTracks().forEach(track => track.stop()); }
            const [width, height] = this.settings.resolution.split('x').map(Number);
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' } });
            this.video.srcObject = stream;
            this.video.play();
            await new Promise(resolve => {
                this.video.onplaying = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    this.cameraReady = true;
                    resolve();
                };
            });
            document.getElementById('loading-message').style.display = 'none';
        } catch (error) { this.showError('Camera access denied. Please allow camera access in your browser settings and refresh.'); }
    }

    async detectPose() {
        if (!this.mediaPipeReady || !this.cameraReady || this.isDetecting || !this.video.videoWidth) { return; }
        const now = performance.now();
        if (now - this.lastPoseTime < 1000 / this.settings.fpsCap) { return; }
        this.isDetecting = true;
        this.lastPoseTime = now;
        try { await this.poseDetection.send({ image: this.video }); } catch (error) { console.error("MediaPipe send failed:", error); this.isDetecting = false; }
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.querySelector('p').textContent = message;
        errorDiv.style.display = 'flex';
        document.getElementById('loading-message').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => new MimicaApp());
