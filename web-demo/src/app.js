/**
 * MIMICA - Main Application Logic
 * Real-time pose detection and stick figure animation
 * Uses MediaPipe JS from jsdelivr CDN for browser compatibility
 */

import { PoseRenderer } from './renderer.js';
import { PoseMapper } from './mapper.js';
import { Smoother } from './smoother.js';

class MimicaApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Components
        this.renderer = new PoseRenderer(this.ctx);
        this.mapper = new PoseMapper();
        this.smoother = new Smoother();
        
        // State
        this.pose = null;
        this.lastPoseTime = 0;
        this.frameCount = 0;
        this.lastFpsTime = 0;
        this.currentFps = 0;
        this.isRunning = false;
        
        // Settings with defaults optimized for 4GB machines
        this.settings = this.loadSettings();
        
        // MediaPipe pose detection
        this.poseDetection = null;
        this.isDetecting = false;
        
        // PWA install prompt
        this.deferredInstallPrompt = null;
        
        this.init();
    }
    
    async init() {
        this.setupUI();
        this.setupPWA();
        await this.loadMediaPipe();
        await this.setupCamera();
        this.startAnimation();
    }
    
    loadSettings() {
        const defaults = {
            resolution: '320x240',
            smoothing: 0.3,
            fpsCap: 15,
            confidence: 0.5,
            skeleton: true,
            mirror: true,
            ik: false
        };
        
        try {
            const saved = JSON.parse(localStorage.getItem('mimica-settings') || '{}');
            return { ...defaults, ...saved };
        } catch {
            return defaults;
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('mimica-settings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }
    
    setupUI() {
        // Resolution control
        const resolutionSelect = document.getElementById('resolution-select');
        resolutionSelect.value = this.settings.resolution;
        resolutionSelect.addEventListener('change', (e) => {
            this.settings.resolution = e.target.value;
            this.saveSettings();
            this.setupCamera(); // Restart camera with new resolution
        });
        
        // Smoothing control
        const smoothingSlider = document.getElementById('smoothing-slider');
        const smoothingValue = document.getElementById('smoothing-value');
        smoothingSlider.value = this.settings.smoothing;
        smoothingValue.textContent = this.settings.smoothing;
        smoothingSlider.addEventListener('input', (e) => {
            this.settings.smoothing = parseFloat(e.target.value);
            smoothingValue.textContent = this.settings.smoothing;
            this.smoother.setAlpha(this.settings.smoothing);
            this.saveSettings();
        });
        
        // FPS cap control
        const fpsSlider = document.getElementById('fps-slider');
        const fpsValue = document.getElementById('fps-value');
        fpsSlider.value = this.settings.fpsCap;
        fpsValue.textContent = this.settings.fpsCap;
        fpsSlider.addEventListener('input', (e) => {
            this.settings.fpsCap = parseInt(e.target.value);
            fpsValue.textContent = this.settings.fpsCap;
            this.saveSettings();
        });
        
        // Confidence control
        const confidenceSlider = document.getElementById('confidence-slider');
        const confidenceValue = document.getElementById('confidence-value');
        confidenceSlider.value = this.settings.confidence;
        confidenceValue.textContent = this.settings.confidence;
        confidenceSlider.addEventListener('input', (e) => {
            this.settings.confidence = parseFloat(e.target.value);
            confidenceValue.textContent = this.settings.confidence;
            this.saveSettings();
        });
        
        // Toggle controls
        document.getElementById('skeleton-toggle').checked = this.settings.skeleton;
        document.getElementById('mirror-toggle').checked = this.settings.mirror;
        document.getElementById('ik-toggle').checked = this.settings.ik;
        
        document.getElementById('skeleton-toggle').addEventListener('change', (e) => {
            this.settings.skeleton = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('mirror-toggle').addEventListener('change', (e) => {
            this.settings.mirror = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('ik-toggle').addEventListener('change', (e) => {
            this.settings.ik = e.target.checked;
            this.saveSettings();
        });
        
        // Calibrate button
        document.getElementById('calibrate-btn').addEventListener('click', () => {
            this.calibratePose();
        });
        
        // Retry camera button
        document.getElementById('retry-camera').addEventListener('click', () => {
            this.setupCamera();
        });
    }
    
    setupPWA() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('web-demo/service-worker.js')
                .then(reg => console.log('Service Worker registered:', reg.scope))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
        
        // Handle install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            this.showInstallPrompt();
        });
        
        // Install prompt UI
        document.getElementById('install-yes').addEventListener('click', () => {
            if (this.deferredInstallPrompt) {
                this.deferredInstallPrompt.prompt();
                this.deferredInstallPrompt.userChoice.then(() => {
                    this.hideInstallPrompt();
                    this.deferredInstallPrompt = null;
                });
            }
        });
        
        document.getElementById('install-no').addEventListener('click', () => {
            this.hideInstallPrompt();
        });
    }
    
    showInstallPrompt() {
        document.getElementById('install-prompt').style.display = 'block';
    }
    
    hideInstallPrompt() {
        document.getElementById('install-prompt').style.display = 'none';
    }
    
    async loadMediaPipe() {
        try {
            // Load MediaPipe from jsdelivr CDN for stability
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
            
            // Initialize pose detection with optimized settings for performance
            this.poseDetection = new window.Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
                }
            });
            
            this.poseDetection.setOptions({
                modelComplexity: 0, // Minimal complexity for 4GB machines
                smoothLandmarks: false, // We handle smoothing ourselves
                enableSegmentation: false,
                smoothSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            this.poseDetection.onResults(this.onPoseResults.bind(this));
            
            console.log('MediaPipe loaded successfully');
            
        } catch (error) {
            console.error('Failed to load MediaPipe:', error);
            this.showError('Failed to load pose detection. Please refresh and try again.');
        }
    }
    
    async setupCamera() {
        const errorDiv = document.getElementById('error-message');
        const loadingDiv = document.getElementById('loading-message');
        
        errorDiv.style.display = 'none';
        loadingDiv.style.display = 'block';
        
        try {
            // Parse resolution setting
            const [width, height] = this.settings.resolution.split('x').map(Number);
            
            // Stop existing stream
            if (this.video.srcObject) {
                this.video.srcObject.getTracks().forEach(track => track.stop());
            }
            
            // Request camera with specified resolution
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: width },
                    height: { ideal: height },
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = stream;
            this.video.addEventListener('loadedmetadata', () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                loadingDiv.style.display = 'none';
                console.log(`Camera initialized: ${this.video.videoWidth}x${this.video.videoHeight}`);
            });
            
        } catch (error) {
            console.error('Camera setup failed:', error);
            loadingDiv.style.display = 'none';
            errorDiv.style.display = 'block';
        }
    }
    
    onPoseResults(results) {
        this.isDetecting = false;
        
        if (results.poseLandmarks) {
            // Convert landmarks to pixel coordinates
            const points = this.mapper.landmarksToPoints(
                results.poseLandmarks,
                this.canvas.width,
                this.canvas.height,
                this.settings.mirror
            );
            
            // Apply confidence filtering
            const filteredPoints = this.filterByConfidence(points, results.poseLandmarks);
            
            // Apply smoothing
            const smoothedPoints = this.smoother.smooth(filteredPoints);
            
            // Apply IK if enabled
            let finalPoints = smoothedPoints;
            if (this.settings.ik) {
                finalPoints = this.mapper.applyIK(smoothedPoints);
            }
            
            this.pose = finalPoints;
        }
        
        // Update inference time
        const inferenceTime = performance.now() - this.lastPoseTime;
        document.getElementById('inference-time').textContent = `Inference: ${inferenceTime.toFixed(0)}ms`;
    }
    
    filterByConfidence(points, landmarks) {
        // Filter out points below confidence threshold
        // If a point is filtered, use interpolation from previous frames
        return points.map((point, index) => {
            if (landmarks[index] && landmarks[index].visibility < this.settings.confidence) {
                // Use interpolation fallback (simple: keep previous point)
                return this.smoother.getPrevious(index) || point;
            }
            return point;
        });
    }
    
    async detectPose() {
        if (!this.poseDetection || this.isDetecting || !this.video.videoWidth) {
            return;
        }
        
        // Respect FPS cap for detection
        const now = performance.now();
        const detectionInterval = 1000 / this.settings.fpsCap;
        if (now - this.lastPoseTime < detectionInterval) {
            return;
        }
        
        this.isDetecting = true;
        this.lastPoseTime = now;
        
        try {
            await this.poseDetection.send({ image: this.video });
        } catch (error) {
            console.error('Pose detection failed:', error);
            this.isDetecting = false;
        }
    }
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw faint camera background
        this.ctx.globalAlpha = 0.3;
        if (this.settings.mirror) {
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.video, -this.canvas.width, 0, this.canvas.width, this.canvas.height);
            this.ctx.scale(-1, 1);
        } else {
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx.globalAlpha = 1.0;
        
        // Draw pose if available
        if (this.pose) {
            if (this.settings.skeleton) {
                this.renderer.drawSkeleton(this.pose);
            } else {
                this.renderer.drawFilledCharacter(this.pose);
            }
        }
    }
    
    updateFPS() {
        this.frameCount++;
        const now = performance.now();
        
        if (now - this.lastFpsTime >= 1000) {
            this.currentFps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = now;
            
            document.getElementById('fps-counter').textContent = `FPS: ${this.currentFps}`;
        }
    }
    
    animate() {
        if (!this.isRunning) return;
        
        this.detectPose();
        this.render();
        this.updateFPS();
        
        requestAnimationFrame(() => this.animate());
    }
    
    startAnimation() {
        this.isRunning = true;
        this.smoother.setAlpha(this.settings.smoothing);
        this.animate();
    }
    
    calibratePose() {
        // Reset smoother for clean calibration
        this.smoother.reset();
        console.log('Pose calibrated - smoother reset');
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.querySelector('p').textContent = message;
        errorDiv.style.display = 'block';
        document.getElementById('loading-message').style.display = 'none';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MimicaApp();
});