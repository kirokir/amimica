/**
 * MIMICA - Main Application Logic
 */
import { PoseRenderer } from './renderer.js';
import { PoseMapper } from './mapper.js';
import { Smoother } from './smoother.js';

class MimicaApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.renderer = new PoseRenderer(this.ctx);
        this.mapper = new PoseMapper();
        this.smoother = new Smoother();
        this.pose = null;
        this.lastPoseTime = 0;
        this.isDetecting = false;
        this.settings = this.loadSettings();
        this.init();
    }

    async init() {
        this.setupUI();
        await this.loadMediaPipe();
        await this.setupCamera();
        this.startAnimation();
    }

    loadSettings() {
        const defaults = { resolution: '320x240', smoothing: 0.3, fpsCap: 15, confidence: 0.5, skeleton: true, mirror: true, ik: false };
        try {
            return { ...defaults, ...JSON.parse(localStorage.getItem('mimica-settings')) };
        } catch { return defaults; }
    }

    saveSettings() { try { localStorage.setItem('mimica-settings', JSON.stringify(this.settings)); } catch (e) { console.warn('Could not save settings:', e); } }

    setupUI() {
        const controls = {
            'resolution-select': 'resolution', 'smoothing-slider': 'smoothing', 'fps-slider': 'fpsCap',
            'confidence-slider': 'confidence', 'skeleton-toggle': 'skeleton', 'mirror-toggle': 'mirror', 'ik-toggle': 'ik'
        };
        for (const [id, key] of Object.entries(controls)) {
            const el = document.getElementById(id);
            const isCheckbox = el.type === 'checkbox';
            el[isCheckbox ? 'checked' : 'value'] = this.settings[key];
            el.addEventListener(isCheckbox ? 'change' : 'input', e => {
                const value = isCheckbox ? e.target.checked : (id.includes('slider') ? parseFloat(e.target.value) : e.target.value);
                this.settings[key] = value;
                if (id.includes('slider')) document.getElementById(id.replace('-slider', '-value')).textContent = value;
                if (key === 'smoothing') this.smoother.setAlpha(this.settings.smoothing);
                if (key === 'resolution') this.setupCamera();
                this.saveSettings();
            });
            if (id.includes('slider')) document.getElementById(id.replace('-slider', '-value')).textContent = this.settings[key];
        }
        document.getElementById('calibrate-btn').addEventListener('click', () => this.smoother.reset());
        document.getElementById('retry-camera').addEventListener('click', () => this.setupCamera());
    }

    async loadMediaPipe() {
        document.getElementById('loading-message').style.display = 'flex';
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
            await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
            this.poseDetection = new window.Pose({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}` });
            this.poseDetection.setOptions({ modelComplexity: 0, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            this.poseDetection.onResults(r => this.onPoseResults(r));
        } catch (error) { this.showError('Failed to load pose detection models.'); }
    }

    async setupCamera() {
        document.getElementById('error-message').style.display = 'none';
        document.getElementById('loading-message').style.display = 'flex';
        try {
            if (this.video.srcObject) { this.video.srcObject.getTracks().forEach(track => track.stop()); }
            const [width, height] = this.settings.resolution.split('x').map(Number);
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' } });
            this.video.srcObject = stream;
            
            // Explicitly play the video now that it has a stream
            this.video.play();

            // Wait for the 'playing' event to ensure frames are available
            await new Promise(resolve => {
                this.video.onplaying = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
            });
            
            document.getElementById('loading-message').style.display = 'none';
        } catch (error) { this.showError('Camera access denied. Please allow camera access in your browser settings and refresh.'); }
    }

    onPoseResults(results) {
        this.isDetecting = false;
        const inferenceTime = performance.now() - this.lastPoseTime;
        document.getElementById('inference-time').textContent = `Inference: ${inferenceTime.toFixed(0)}ms`;
        if (results.poseLandmarks) {
            let points = this.mapper.landmarksToPoints(results.poseLandmarks, this.canvas.width, this.canvas.height, this.settings.mirror);
            points = points.map((p, i) => (results.poseLandmarks[i].visibility < this.settings.confidence) ? this.smoother.getPrevious(i) : p);
            const smoothedPoints = this.smoother.smooth(points);
            this.pose = this.settings.ik ? this.mapper.applyIK(smoothedPoints) : smoothedPoints;
        }
    }

    async detectPose() {
        const now = performance.now();
        if (!this.poseDetection || this.isDetecting || !this.video.videoWidth || (now - this.lastPoseTime < 1000 / this.settings.fpsCap)) { return; }
        this.isDetecting = true;
        this.lastPoseTime = now;
        try { await this.poseDetection.send({ image: this.video }); } catch (error) { console.error("MediaPipe send failed:", error); this.isDetecting = false; }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        if (this.settings.mirror) {
            this.ctx.scale(-1, 1);
            this.ctx.translate(-this.canvas.width, 0);
        }
        this.ctx.globalAlpha = 0.3;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        this.ctx.globalAlpha = 1.0;
        if (this.pose) {
            if (this.settings.skeleton) { this.renderer.drawSkeleton(this.pose); }
            else { this.renderer.drawFilledCharacter(this.pose); }
        }
    }

    startAnimation() {
        let frameCount = 0; let lastFpsTime = 0;
        const animate = (now) => {
            this.detectPose();
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
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.querySelector('p').textContent = message;
        errorDiv.style.display = 'flex';
        document.getElementById('loading-message').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => new MimicaApp());