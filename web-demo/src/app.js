/**
 * MIMICA - Main Application Logic with AI Backend Integration
 */
import { PoseRenderer } from './renderer.js';
import { PoseMapper } from './mapper.js';
import { Smoother } from './smoother.js';
import { ActionRecognizer } from './action-recognizer.js';

// **NOTE**: These are now loaded from the global 'window' object
// provided by mediapipe-loader.js to solve CSP issues.
const { HandLandmarker, FilesetResolver, PoseLandmarker } = window.MediaPipeTasks;

class MimicaApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.renderer = new PoseRenderer(this.ctx);
        this.mapper = new PoseMapper();
        this.smoother = new Smoother();
        this.actionRecognizer = new ActionRecognizer();
        
        this.pose = null;
        this.settings = this.loadSettings();
        
        this.cameraReady = false;
        this.poseLandmarkerReady = false;
        this.faceApiReady = false;
        this.handLandmarkerReady = false;
        this.animationStarted = false;
        
        this.lastExpression = 'neutral';
        this.lastHandResults = null;
        this.lastVideoTime = -1;

        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordedActions = [];
        this.isRecording = false;
        this.recordingStartTime = 0;

        // AI Backend Integration
        this.websocket = null;
        this.isAIEnabled = false;
        this.isBackendConnected = false;
        this.backendUrl = this.getBackendUrl();
        this.lastBackendProcessTime = 0;
        this.backendProcessInterval = 100; // 10 FPS for backend processing
        this.aiObjects = [];
        this.aiAction = "idle";
        this.connectionRetryCount = 0;
        this.maxRetries = 5;

        this.init();
    }

    getBackendUrl() {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'ws://localhost:8000/ws/process';
        } else {
            return 'wss://mimica-backend.onrender.com/ws/process';
        }
    }

    async init() {
        this.setupUI();
        await this.setupCamera();
        
        if (this.cameraReady) {
            await Promise.all([
                this.loadPoseLandmarker(),
                this.loadFaceAPI(),
                this.loadHandLandmarker(),
                this.populateCameraList()
            ]);
        }
    }

    checkAllReady() {
        if (this.cameraReady && this.poseLandmarkerReady && this.faceApiReady && this.handLandmarkerReady && !this.animationStarted) {
            this.animationStarted = true;
            document.getElementById('loading-message').style.display = 'none';
            this.startAnimation();
        }
    }

    loadSettings() {
        const defaults = {
            characterMode: 'blocky', resolution: '640x360', smoothing: 0.3, 
            fpsCap: 30, confidence: 0.5, mirror: true, ik: false,
            recordBackground: true, expression: false, bodyModeEnabled: true,
            handTrackingEnabled: false, selectedCameraId: '', aiVisionEnabled: false
        };
        try {
            const saved = JSON.parse(localStorage.getItem('mimica-settings')) || {};
            return { ...defaults, ...saved };
        } catch { return defaults; }
    }

    saveSettings() { try { localStorage.setItem('mimica-settings', JSON.stringify(this.settings)); } catch (e) { console.warn('Could not save settings:', e); } }

    setupUI() {
        const controls = {
            'body-mode-toggle': 'bodyModeEnabled', 'hand-tracking-toggle': 'handTrackingEnabled',
            'expression-toggle': 'expression', 'camera-select': 'selectedCameraId',
            'character-mode-select': 'characterMode', 'resolution-select': 'resolution', 
            'smoothing-slider': 'smoothing', 'fps-slider': 'fpsCap',
            'confidence-slider': 'confidence', 'mirror-toggle': 'mirror', 
            'ik-toggle': 'ik', 'record-background-toggle': 'recordBackground',
            'ai-vision-toggle': 'aiVisionEnabled'
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
                if (key === 'resolution' || key === 'selectedCameraId') this.setupCamera();
                if (key === 'aiVisionEnabled') this.toggleAIVision(value);
                this.saveSettings();
            });
            if (id.includes('slider')) {
                const valueEl = document.getElementById(id.replace('-slider', '-value'));
                if (valueEl) valueEl.textContent = this.settings[key].toFixed(1);
            }
        }
        
        document.getElementById('calibrate-btn').addEventListener('click', () => this.smoother.reset());
        document.getElementById('retry-camera').addEventListener('click', () => this.init());
        document.getElementById('record-btn').addEventListener('click', () => {
            if (this.isRecording) { this.stopRecording(); } else { this.startRecording(); }
        });
        document.getElementById('fullscreen-btn').addEventListener('click', () => this.toggleFullScreen());
        
        // Initialize AI Vision status
        this.updateAIVisionStatus();
        
        // Auto-connect if previously enabled
        if (this.settings.aiVisionEnabled) {
            setTimeout(() => this.toggleAIVision(true), 1000);
        }
    }

    async toggleAIVision(enabled) {
        this.isAIEnabled = enabled;
        this.settings.aiVisionEnabled = enabled;
        this.saveSettings();
        
        if (enabled) {
            await this.connectToBackend();
        } else {
            this.disconnectFromBackend();
        }
        
        this.updateAIVisionStatus();
    }

    async connectToBackend() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            console.log(`Connecting to AI backend: ${this.backendUrl}`);
            this.updateAIVisionStatus('connecting');
            
            this.websocket = new WebSocket(this.backendUrl);
            
            this.websocket.onopen = () => {
                console.log('Connected to AI backend');
                this.isBackendConnected = true;
                this.connectionRetryCount = 0;
                this.updateAIVisionStatus('connected');
                this.showStatus('AI Vision connected successfully', 'success');
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const result = JSON.parse(event.data);
                    this.handleBackendResponse(result);
                } catch (error) {
                    console.error('Error parsing backend response:', error);
                }
            };
            
            this.websocket.onclose = (event) => {
                console.log('Disconnected from AI backend', event.code, event.reason);
                this.isBackendConnected = false;
                this.updateAIVisionStatus('disconnected');
                
                // Attempt reconnection if AI is still enabled
                if (this.isAIEnabled && this.connectionRetryCount < this.maxRetries) {
                    this.connectionRetryCount++;
                    console.log(`Attempting reconnection ${this.connectionRetryCount}/${this.maxRetries}`);
                    setTimeout(() => this.connectToBackend(), 2000 * this.connectionRetryCount);
                } else if (this.connectionRetryCount >= this.maxRetries) {
                    this.showStatus('AI Vision connection failed - max retries exceeded', 'error');
                    this.isAIEnabled = false;
                    this.settings.aiVisionEnabled = false;
                    document.getElementById('ai-vision-toggle').checked = false;
                    this.saveSettings();
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isBackendConnected = false;
                this.updateAIVisionStatus('error');
            };
            
        } catch (error) {
            console.error('Failed to connect to backend:', error);
            this.updateAIVisionStatus('error');
            this.showStatus('Failed to connect to AI backend: ' + error.message, 'error');
        }
    }

    disconnectFromBackend() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.isBackendConnected = false;
        this.aiObjects = [];
        this.aiAction = "idle";
        this.updateAIVisionStatus('disconnected');
    }

    handleBackendResponse(result) {
        try {
            if (result.objects) {
                this.aiObjects = result.objects;
            }
            
            if (result.segmented_action) {
                this.aiAction = result.segmented_action;
            }
            
            if (result.error) {
                console.warn('Backend processing error:', result.error);
            }
            
        } catch (error) {
            console.error('Error handling backend response:', error);
        }
    }

    captureFrameForBackend() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        
        // Capture the current video frame
        tempCtx.save();
        if (this.settings.mirror) {
            tempCtx.scale(-1, 1);
            tempCtx.translate(-tempCanvas.width, 0);
        }
        tempCtx.drawImage(this.video, 0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.restore();
        
        return tempCanvas.toDataURL('image/jpeg', 0.7);
    }

    async sendFrameToBackend() {
        if (!this.isBackendConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            const frameData = this.captureFrameForBackend();
            
            // Prepare pose data
            const poseData = this.pose ? this.pose.map(point => 
                point ? { x: Math.round(point.x), y: Math.round(point.y) } : { x: 0, y: 0 }
            ) : [];
            
            // Prepare hands data
            const handsData = this.lastHandResults && this.lastHandResults.landmarks ? 
                this.lastHandResults.landmarks.map(hand => 
                    hand.map(landmark => ({ x: landmark.x, y: landmark.y, z: landmark.z }))
                ) : [[], []];
            
            const message = {
                frame: frameData,
                pose: poseData,
                hands: handsData,
                expression: this.lastExpression || 'neutral'
            };
            
            this.websocket.send(JSON.stringify(message));
            
        } catch (error) {
            console.error('Error sending frame to backend:', error);
        }
    }

    updateAIVisionStatus(status = null) {
        const statusElement = document.getElementById('ai-status');
        if (!statusElement) return;
        
        let displayStatus = status;
        let className = '';
        
        if (!displayStatus) {
            if (this.isBackendConnected) {
                displayStatus = 'connected';
            } else if (this.isAIEnabled) {
                displayStatus = 'connecting';
            } else {
                displayStatus = 'disabled';
            }
        }
        
        switch (displayStatus) {
            case 'connected':
                statusElement.textContent = 'AI Vision: Connected';
                className = 'status-connected';
                break;
            case 'connecting':
                statusElement.textContent = 'AI Vision: Connecting...';
                className = 'status-connecting';
                break;
            case 'disconnected':
                statusElement.textContent = 'AI Vision: Disconnected';
                className = 'status-disconnected';
                break;
            case 'error':
                statusElement.textContent = 'AI Vision: Error';
                className = 'status-error';
                break;
            default:
                statusElement.textContent = 'AI Vision: Disabled';
                className = 'status-disabled';
        }
        
        statusElement.className = `status ${className}`;
    }

    showStatus(message, type = 'info') {
        // Create or update status notification
        let statusDiv = document.getElementById('status-notification');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'status-notification';
            statusDiv.style.cssText = `
                position: fixed; top: 10px; right: 10px; z-index: 1000;
                padding: 10px 15px; border-radius: 5px; color: white;
                font-weight: bold; max-width: 300px; word-wrap: break-word;
            `;
            document.body.appendChild(statusDiv);
        }
        
        statusDiv.textContent = message;
        statusDiv.className = `status-${type}`;
        
        // Style based on type
        switch (type) {
            case 'success':
                statusDiv.style.backgroundColor = '#4CAF50';
                break;
            case 'error':
                statusDiv.style.backgroundColor = '#F44336';
                break;
            case 'warning':
                statusDiv.style.backgroundColor = '#FF9800';
                break;
            default:
                statusDiv.style.backgroundColor = '#2196F3';
        }
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (statusDiv && statusDiv.parentNode) {
                statusDiv.style.opacity = '0';
                setTimeout(() => {
                    if (statusDiv && statusDiv.parentNode) {
                        statusDiv.parentNode.removeChild(statusDiv);
                    }
                }, 300);
            }
        }, 3000);
    }

    async setupCamera() {
        this.cameraReady = false;
        document.getElementById('error-message').style.display = 'none';
        document.getElementById('loading-message').style.display = 'flex';
        try {
            if (this.video.srcObject) { this.video.srcObject.getTracks().forEach(track => track.stop()); }
            const [width, height] = this.settings.resolution.split('x').map(Number);
            const constraints = { video: { width: { ideal: width }, height: { ideal: height } } };
            if (this.settings.selectedCameraId) {
                constraints.video.deviceId = { exact: this.settings.selectedCameraId };
            }
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (!stream || !stream.active) throw new Error("Acquired media stream is not active.");
            this.video.srcObject = stream;
            
            await new Promise((resolve, reject) => {
                this.video.onloadeddata = () => {
                    this.video.play();
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    this.cameraReady = true;
                    resolve();
                };
                setTimeout(() => reject(new Error("Video playback timed out")), 5000);
            });
        } catch (error) { 
            console.error("Camera setup failed:", error);
            this.showError('Camera access denied. Please allow camera access and refresh.'); 
        }
    }
    
    async populateCameraList() {
        const cameraSelect = document.getElementById('camera-select');
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            cameraSelect.innerHTML = '';
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.length + 1}`;
                cameraSelect.appendChild(option);
            });
            if (this.settings.selectedCameraId && videoDevices.some(d => d.deviceId === this.settings.selectedCameraId)) {
                cameraSelect.value = this.settings.selectedCameraId;
            } else if (videoDevices.length > 0) {
                this.settings.selectedCameraId = videoDevices[0].deviceId;
                cameraSelect.value = videoDevices[0].deviceId;
            }
        } catch (error) { console.error("Could not enumerate camera devices:", error); }
    }

    async toggleFullScreen() {
        const container = document.getElementById('video-container');
        try {
            if (!document.fullscreenElement) {
                await container.requestFullscreen();
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock('landscape-primary').catch(() => {});
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
            }
        } catch (err) {
            console.error(`Fullscreen Error: ${err.message} (${err.name})`);
            alert("Fullscreen mode is not supported by your browser or was denied.");
        }
    }

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
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
            const videoBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const videoLink = document.getElementById('download-link-video');
            videoLink.href = URL.createObjectURL(videoBlob);
            videoLink.download = `mimica-recording-${timestamp}.webm`;
            const jsonData = {
                metadata: { date: new Date().toISOString(), durationMs: performance.now() - this.recordingStartTime, sourceResolution: `${this.canvas.width}x${this.canvas.height}` },
                frames: this.recordedActions
            };
            const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            const jsonLink = document.getElementById('download-link-json');
            jsonLink.href = URL.createObjectURL(jsonBlob);
            jsonLink.download = `mimica-data-${timestamp}.json`;
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

    async loadPoseLandmarker() {
        this.poseLandmarkerReady = false;
        try {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
            this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numPoses: 1
            });
            this.poseLandmarkerReady = true;
            this.checkAllReady();
        } catch(error) { this.showError('Failed to load pose detection models.'); }
    }

    async loadHandLandmarker() {
        this.handLandmarkerReady = false;
        try {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
            this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            });
            this.handLandmarkerReady = true;
            this.checkAllReady();
        } catch (error) { 
            console.error("Failed to load Hand Landmarker:", error);
            this.handLandmarkerReady = true;
            this.checkAllReady();
        }
    }

    async loadFaceAPI() {
        this.faceApiReady = false;
        try {
            await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            await faceapi.nets.faceExpressionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            this.faceApiReady = true;
            this.checkAllReady();
        } catch (error) { 
            console.error('Failed to load face-api.js models:', error);
            this.faceApiReady = true;
            this.checkAllReady();
        }
    }
    
    async detectExpression() {
        if (!this.faceApiReady || !this.settings.expression) {
            this.lastExpression = 'disabled';
            return;
        };
        const now = performance.now();
        if (now - (this.lastFaceDetectionTime || 0) < 500) return;
        this.lastFaceDetectionTime = now;
        try {
            const detections = await faceapi.detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
            if (detections && detections.expressions) {
                this.lastExpression = Object.keys(detections.expressions).reduce((a, b) => detections.expressions[a] > detections.expressions[b] ? a : b);
            }
        } catch (error) {
            console.warn("Face detection failed:", error);
            this.lastExpression = 'error';
        }
    }

    startAnimation() {
        let lastFpsTime = performance.now();
        let frameCount = 0;
        const animate = (now) => {
            if (this.cameraReady && this.video.readyState >= 3 && this.video.currentTime !== this.lastVideoTime) {
                const startTimeMs = performance.now();
                
                if (this.settings.bodyModeEnabled && this.poseLandmarkerReady) {
                    const poseResults = this.poseLandmarker.detectForVideo(this.video, startTimeMs);
                    document.getElementById('inference-time').textContent = `Pose: ${(performance.now() - startTimeMs).toFixed(0)}ms`;
                    if (poseResults.landmarks && poseResults.landmarks.length > 0) {
                        let points = this.mapper.landmarksToPoints(poseResults.landmarks[0], this.canvas.width, this.canvas.height, this.settings.mirror);
                        const smoothedPoints = this.smoother.smooth(points);
                        this.pose = this.settings.ik ? this.mapper.applyIK(smoothedPoints) : smoothedPoints;
                    }
                } else { this.pose = null; }

                if (this.settings.handTrackingEnabled && this.handLandmarkerReady) {
                    this.lastHandResults = this.handLandmarker.detectForVideo(this.video, startTimeMs);
                } else { this.lastHandResults = null; }

                this.detectExpression();
                this.updateDataAndRecording();
                this.lastVideoTime = this.video.currentTime;

                // Send frame to AI backend if enabled and connected
                if (this.isAIEnabled && this.isBackendConnected && 
                    (now - this.lastBackendProcessTime) >= this.backendProcessInterval) {
                    this.sendFrameToBackend();
                    this.lastBackendProcessTime = now;
                }
            }

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

    updateDataAndRecording() {
        // Use AI action if available, otherwise local action recognition
        const localAction = this.pose ? this.actionRecognizer.recognize(this.pose) : "unknown";
        const displayAction = this.isAIEnabled && this.isBackendConnected && this.aiAction !== "idle" ? 
            this.aiAction : localAction;
        
        document.getElementById('action-display').textContent = `Action: ${this.settings.bodyModeEnabled ? displayAction : '--'}`;
        document.getElementById('expression-display').textContent = `Expression: ${this.settings.expression ? this.lastExpression : '--'}`;

        // Show AI objects count if available
        const aiObjectsElement = document.getElementById('ai-objects-display');
        if (aiObjectsElement) {
            if (this.isAIEnabled && this.isBackendConnected && this.aiObjects.length > 0) {
                const objectLabels = this.aiObjects.map(obj => obj.label).join(', ');
                aiObjectsElement.textContent = `Objects: ${objectLabels}`;
            } else {
                aiObjectsElement.textContent = 'Objects: --';
            }
        }

        if (this.isRecording) {
            this.recordedActions.push({
                timestamp: Math.round(performance.now() - this.recordingStartTime),
                action: this.settings.bodyModeEnabled ? displayAction : null,
                expression: this.settings.expression ? this.lastExpression : null,
                pose: this.settings.bodyModeEnabled && this.pose ? this.pose.map(p => p ? {x: Math.round(p.x), y: Math.round(p.y)} : null) : null,
                hands: this.settings.handTrackingEnabled && this.lastHandResults ? this.lastHandResults.landmarks.map(hand => hand.map(p => ({x: p.x, y: p.y, z: p.z}))) : null,
                aiObjects: this.isAIEnabled ? this.aiObjects : null,
                aiAction: this.isAIEnabled ? this.aiAction : null
            });
        }
    }

    drawAIObjects() {
        if (!this.isAIEnabled || !this.isBackendConnected || !this.aiObjects.length) {
            return;
        }

        this.ctx.save();
        this.ctx.strokeStyle = '#00FF00';
        this.ctx.fillStyle = '#00FF00';
        this.ctx.lineWidth = 2;
        this.ctx.font = '14px Arial';

        for (const obj of this.aiObjects) {
            if (!obj.box || obj.box.length !== 4) continue;

            const [x, y, width, height] = obj.box;
            
            // Draw bounding box
            this.ctx.strokeRect(x, y, width, height);
            
            // Draw label
            const label = `${obj.label} ${obj.confidence ? Math.round(obj.confidence * 100) + '%' : ''}`;
            const labelWidth = this.ctx.measureText(label).width;
            
            // Label background
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            this.ctx.fillRect(x, y - 20, labelWidth + 8, 18);
            
            // Label text
            this.ctx.fillStyle = '#000000';
            this.ctx.fillText(label, x + 4, y - 6);
        }

        this.ctx.restore();
    }

    render() {
        if (this.isRecording && !this.settings.recordBackground) {
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if ((!this.isRecording || this.settings.recordBackground) && this.cameraReady) {
            this.ctx.save();
            if (this.settings.mirror) {
                this.ctx.scale(-1, 1);
                this.ctx.translate(-this.canvas.width, 0);
            }
            this.ctx.globalAlpha = 0.3;
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
        
        this.ctx.globalAlpha =
