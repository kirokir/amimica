import { PoseRenderer } from './renderer.js';
import { PoseMapper } from './mapper.js';
import { Smoother } from './smoother.js';
import { ActionRecognizer } from './action-recognizer.js';
import { HandLandmarker, FilesetResolver, PoseLandmarker, ObjectDetector, ImageSegmenter } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs";

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
        this.animationStarted = false;
        
        this.models = {
            pose: { ready: false, loading: false, instance: null },
            hands: { ready: false, loading: false, instance: null },
            face: { ready: false, loading: false },
            objects: { ready: false, loading: false, instance: null },
            segmentation: { ready: false, loading: false, instance: null },
            ocr: { ready: false, loading: false, instance: null },
        };
        
        this.lastExpression = 'neutral';
        this.lastHandResults = null;
        this.lastObjectDetections = null;
        this.lastSegmentationResult = null;
        this.lastOcrResult = null;
        this.lastVideoTime = -1;
        this.isOcrRunning = false;

        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordedActions = [];
        this.isRecording = false;
        this.recordingStartTime = 0;

        this.init();
    }

    async init() {
        this.setupUI();
        await this.setupCamera();
        
        if (this.cameraReady) {
            document.getElementById('loading-message').style.display = 'none';
            this.loadEnabledModels();
            this.displaySystemInfo(); // Now this function exists
            this.startAnimation();
        }
    }

    // **NEW FUNCTION**: Displays system and browser info in the footer.
    displaySystemInfo() {
        const infoEl = document.getElementById('system-info');
        if (!infoEl) return;

        const browserInfo = navigator.userAgent || "N/A";
        const platform = navigator.platform || "N/A";
        const connection = navigator.connection || {};
        const networkInfo = connection.effectiveType ? `${connection.effectiveType} (${connection.downlink} Mbps)` : "N/A";

        infoEl.innerHTML = `
            <span>OS: ${platform}</span> | 
            <span>Network: ${networkInfo}</span> | 
            <span>Browser: ${browserInfo.substring(0, 100)}...</span>
        `;
    }

    loadSettings() {
        const defaults = {
            characterMode: 'blocky', resolution: '640x360', smoothing: 0.3, 
            fpsCap: 30, confidence: 0.5, mirror: true, ik: false,
            recordBackground: true, expression: false, bodyModeEnabled: false,
            handTrackingEnabled: false, selectedCameraId: '',
            objectDetectionEnabled: false, segmentationEnabled: false, ocrEnabled: false
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
            'expression-toggle': 'expression', 'object-detection-toggle': 'objectDetectionEnabled',
            'segmentation-toggle': 'segmentationEnabled', 'ocr-toggle': 'ocrEnabled', 
            'camera-select': 'selectedCameraId', 'character-mode-select': 'characterMode', 
            'resolution-select': 'resolution', 'smoothing-slider': 'smoothing', 
            'fps-slider': 'fpsCap', 'confidence-slider': 'confidence', 
            'mirror-toggle': 'mirror', 'ik-toggle': 'ik', 
            'record-background-toggle': 'recordBackground'
        };
        
        for (const [id, key] of Object.entries(controls)) {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`UI element with id '${id}' not found.`);
                continue;
            }
            const isCheckbox = el.type === 'checkbox';
            el[isCheckbox ? 'checked' : 'value'] = this.settings[key];
            
            el.addEventListener('change', e => {
                const value = isCheckbox ? e.target.checked : e.target.value;
                this.settings[key] = value;
                this.saveSettings();
                
                if (isCheckbox || key === 'resolution' || key === 'selectedCameraId') {
                    window.location.reload();
                } else if (key === 'smoothing') {
                    this.smoother.setAlpha(this.settings.smoothing);
                }
                
                if (id.includes('slider')) {
                    const valueEl = document.getElementById(id.replace('-slider', '-value'));
                    if (valueEl) valueEl.textContent = parseFloat(value).toFixed(1);
                }
            });

            if (id.includes('slider')) {
                const valueEl = document.getElementById(id.replace('-slider', '-value'));
                if(valueEl) valueEl.textContent = this.settings[key];
            }
        }
        
        document.getElementById('calibrate-btn').addEventListener('click', () => this.smoother.reset());
        document.getElementById('refresh-btn').addEventListener('click', () => window.location.reload(true));
        document.getElementById('record-btn').addEventListener('click', () => { if (this.isRecording) this.stopRecording(); else this.startRecording(); });
        document.getElementById('fullscreen-btn').addEventListener('click', () => this.toggleFullScreen());
        document.getElementById('ocr-btn').addEventListener('click', () => this.detectText());
        
        this.updateAllStatusIndicators();
    }
    
    updateStatus(modelKey, status, message) {
        const el = document.getElementById(`${modelKey}-status`);
        if (!el) return;
        el.textContent = `(${message})`;
        el.className = `status-indicator status-${status}`;
    }

    updateAllStatusIndicators() {
        this.updateStatus('body', this.models.pose.loading ? 'loading' : (this.models.pose.ready ? 'ready' : 'not-loaded'), this.models.pose.loading ? 'Loading...' : (this.models.pose.ready ? 'Ready' : 'Not Loaded'));
        this.updateStatus('hand', this.models.hands.loading ? 'loading' : (this.models.hands.ready ? 'ready' : 'not-loaded'), this.models.hands.loading ? 'Loading...' : (this.models.hands.ready ? 'Ready' : 'Not Loaded'));
        this.updateStatus('expression', this.models.face.loading ? 'loading' : (this.models.face.ready ? 'ready' : 'not-loaded'), this.models.face.loading ? 'Loading...' : (this.models.face.ready ? 'Ready' : 'Not Loaded'));
        this.updateStatus('object', this.models.objects.loading ? 'loading' : (this.models.objects.ready ? 'ready' : 'not-loaded'), this.models.objects.loading ? 'Loading...' : (this.models.objects.ready ? 'Ready' : 'Not Loaded'));
        this.updateStatus('segmentation', this.models.segmentation.loading ? 'loading' : (this.models.segmentation.ready ? 'ready' : 'not-loaded'), this.models.segmentation.loading ? 'Loading...' : (this.models.segmentation.ready ? 'Ready' : 'Not Loaded'));
        this.updateStatus('ocr', this.models.ocr.loading ? 'loading' : (this.models.ocr.ready ? 'ready' : 'not-loaded'), this.models.ocr.loading ? 'Loading...' : (this.models.ocr.ready ? 'Ready' : 'Not Loaded'));
        
        const ocrStatusTextEl = document.getElementById('ocr-status-text');
        if(ocrStatusTextEl) {
            let status = this.models.ocr.loading ? 'Loading...' : (this.models.ocr.ready ? 'Ready' : 'Not Loaded');
            ocrStatusTextEl.textContent = `Status: ${status}`;
        }
    }

    loadEnabledModels() {
        if (this.settings.bodyModeEnabled && !this.models.pose.instance && !this.models.pose.loading) this.loadPoseLandmarker();
        if (this.settings.handTrackingEnabled && !this.models.hands.instance && !this.models.hands.loading) this.loadHandLandmarker();
        if (this.settings.expression && !this.models.face.ready && !this.models.face.loading) this.loadFaceAPI();
        if (this.settings.objectDetectionEnabled && !this.models.objects.instance && !this.models.objects.loading) this.loadObjectDetector();
        if (this.settings.segmentationEnabled && !this.models.segmentation.instance && !this.models.segmentation.loading) this.loadImageSegmenter();
        if (this.settings.ocrEnabled && !this.models.ocr.instance && !this.models.ocr.loading) this.setupOcr();
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
        try {
            const cameraSelect = document.getElementById('camera-select');
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
                this.saveSettings();
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
        this.models.pose.loading = true; this.updateStatus('body', 'loading', 'Loading...');
        try {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
            this.models.pose.instance = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`, delegate: "CPU" },
                runningMode: "VIDEO", numPoses: 1
            });
            this.models.pose.ready = true; this.updateStatus('body', 'ready', 'Ready');
        } catch(error) { 
            console.error('Failed to load pose models.', error); this.updateStatus('body', 'error', 'Error');
        } finally { this.models.pose.loading = false; }
    }

    async loadHandLandmarker() {
        this.models.hands.loading = true; this.updateStatus('hand', 'loading', 'Loading...');
        try {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
            this.models.hands.instance = await HandLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "CPU" },
                runningMode: "VIDEO", numHands: 2
            });
            this.models.hands.ready = true; this.updateStatus('hand', 'ready', 'Ready');
        } catch (error) { console.error("Hand Landmarker failed to load:", error); this.updateStatus('hand', 'error', 'Error'); } 
        finally { this.models.hands.loading = false; }
    }

    async loadObjectDetector() {
        this.models.objects.loading = true; this.updateStatus('object', 'loading', 'Loading...');
        try {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
            this.models.objects.instance = await ObjectDetector.createFromOptions(vision, {
                baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite', delegate: 'CPU' },
                runningMode: 'VIDEO', maxResults: 5
            });
            this.models.objects.ready = true; this.updateStatus('object', 'ready', 'Ready');
        } catch (error) { console.error("Object Detector failed to load:", error); this.updateStatus('object', 'error', 'Error'); } 
        finally { this.models.objects.loading = false; }
    }
    
    async loadImageSegmenter() {
        this.models.segmentation.loading = true; this.updateStatus('segmentation', 'loading', 'Loading...');
        try {
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
            this.models.segmentation.instance = await ImageSegmenter.createFromOptions(vision, {
                baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite', delegate: 'CPU' },
                runningMode: 'VIDEO', outputCategoryMask: true,
            });
            this.models.segmentation.ready = true; this.updateStatus('segmentation', 'ready', 'Ready');
        } catch(error) { console.error("Image Segmenter failed to load:", error); this.updateStatus('segmentation', 'error', 'Error'); } 
        finally { this.models.segmentation.loading = false; }
    }

    async setupOcr() {
        if (this.models.ocr.instance || this.models.ocr.loading) return;
        this.models.ocr.loading = true; this.updateAllStatusIndicators();
        try {
            this.tesseractWorker = await Tesseract.createWorker('eng');
            this.models.ocr.instance = this.tesseractWorker;
            this.models.ocr.ready = true;
        } catch (error) {
            console.error("Tesseract.js worker failed to create:", error);
            this.models.ocr.ready = false;
        } finally { 
            this.models.ocr.loading = false; 
            this.updateAllStatusIndicators();
        }
    }

    async loadFaceAPI() {
        this.models.face.loading = true; this.updateStatus('expression', 'loading', 'Loading...');
        try {
            await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            await faceapi.nets.faceExpressionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
            this.models.face.ready = true;
            this.updateStatus('expression', 'ready', 'Ready');
        } catch (error) { console.error('face-api.js models failed to load:', error); this.updateStatus('expression', 'error', 'Error'); } 
        finally { this.models.face.loading = false; }
    }
    
    startAnimation() {
        if (this.animationStarted) return;
        this.animationStarted = true;
        let lastFpsTime = performance.now();
        let frameCount = 0;
        const animate = (now) => {
            if (this.cameraReady && this.video.readyState >= 3 && this.video.currentTime !== this.lastVideoTime) {
                const startTimeMs = performance.now();
                
                if (this.settings.bodyModeEnabled && this.models.pose.ready) {
                    const poseResults = this.models.pose.instance.detectForVideo(this.video, startTimeMs);
                    if (poseResults.landmarks && poseResults.landmarks.length > 0) {
                        let points = this.mapper.landmarksToPoints(poseResults.landmarks[0], this.canvas.width, this.canvas.height, this.settings.mirror);
                        const smoothedPoints = this.smoother.smooth(points);
                        this.pose = this.settings.ik ? this.mapper.applyIK(smoothedPoints) : smoothedPoints;
                    }
                } else { this.pose = null; }

                if (this.settings.handTrackingEnabled && this.models.hands.ready) {
                    this.lastHandResults = this.models.hands.instance.detectForVideo(this.video, startTimeMs);
                } else { this.lastHandResults = null; }

                if (this.settings.objectDetectionEnabled && this.models.objects.ready) {
                    this.lastObjectDetections = this.models.objects.instance.detectForVideo(this.video, startTimeMs);
                } else { this.lastObjectDetections = null; }
                
                if (this.settings.segmentationEnabled && this.models.segmentation.ready) {
                    this.models.segmentation.instance.segmentForVideo(this.video, startTimeMs, (result) => {
                        this.lastSegmentationResult = result;
                    });
                } else { this.lastSegmentationResult = null; }

                if (this.settings.expression && this.models.face.ready) this.detectExpression();
                
                this.updateDataAndRecording();
                this.lastVideoTime = this.video.currentTime;
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

    async detectExpression() {
        if (!this.settings.expression || !this.models.face.ready) { this.lastExpression = '--'; return; };
        const now = performance.now();
        if (now - (this.lastFaceDetectionTime || 0) < 1000) return;
        this.lastFaceDetectionTime = now;
        try {
            const detections = await faceapi.detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
            this.lastExpression = detections ? Object.keys(detections.expressions).reduce((a, b) => detections.expressions[a] > detections.expressions[b] ? a : b) : 'none';
        } catch (error) { this.lastExpression = 'error'; }
    }

    async detectText() {
        if (!this.settings.ocrEnabled || !this.models.ocr.ready || this.isOcrRunning) {
            if (!this.models.ocr.ready) alert("OCR model is not loaded yet. Please enable it in Config and wait for it to be Ready.");
            return;
        }
        
        this.isOcrRunning = true;
        const ocrStatus = document.getElementById('ocr-status-text');
        ocrStatus.textContent = 'Status: Scanning...';
        
        try {
            const { data } = await this.tesseractWorker.recognize(this.canvas);
            this.lastOcrResult = data;
            ocrStatus.textContent = `Status: Done (${data.confidence.toFixed(1)}% confidence)`;
        } catch (error) {
            console.error("OCR recognition failed:", error);
            this.lastOcrResult = null;
            ocrStatus.textContent = 'Status: Error';
        } finally {
            this.isOcrRunning = false;
        }
    }

    updateDataAndRecording() {
        const actionName = this.pose ? this.actionRecognizer.recognize(this.pose) : "unknown";
        document.getElementById('action-display').textContent = `Action: ${this.settings.bodyModeEnabled ? actionName : '--'}`;
        document.getElementById('expression-display').textContent = `Expression: ${this.settings.expression ? this.lastExpression : '--'}`;
        const objectNames = this.lastObjectDetections?.detections.map(d => d.categories[0].categoryName).join(', ') || '--';
        document.getElementById('objects-display').textContent = `Objects: ${this.settings.objectDetectionEnabled ? objectNames : '--'}`;
        const ocrText = this.lastOcrResult?.text.trim().substring(0, 20) || '--';
        document.getElementById('ocr-display').textContent = `OCR: ${ocrText}`;

        if (this.isRecording) {
            const frameData = {
                timestamp: Math.round(performance.now() - this.recordingStartTime),
                action: this.settings.bodyModeEnabled ? actionName : null,
                expression: this.settings.expression ? this.lastExpression : null,
                pose: this.settings.bodyModeEnabled && this.pose ? this.pose.map(p => p ? {x: Math.round(p.x), y: Math.round(p.y)} : null) : null,
                hands: this.settings.handTrackingEnabled && this.lastHandResults ? this.lastHandResults.landmarks : null,
                objects: this.settings.objectDetectionEnabled && this.lastObjectDetections ? this.lastObjectDetections.detections.map(d => ({ label: d.categories[0].categoryName, score: d.categories[0].score, box: d.boundingBox })) : null,
            };
            if (this.lastOcrResult) {
                frameData.ocr = this.lastOcrResult.words.map(w => ({ text: w.text, confidence: w.confidence, bbox: w.bbox }));
                this.lastOcrResult = null;
            }
            this.recordedActions.push(frameData);
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if ((!this.isRecording || this.settings.recordBackground) && this.cameraReady) {
            this.ctx.save();
            if (this.settings.mirror) { this.ctx.scale(-1, 1); this.ctx.translate(-this.canvas.width, 0); }
            this.ctx.globalAlpha = 0.3;
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
        
        this.ctx.globalAlpha = 1.0;
        if (this.settings.segmentationEnabled && this.lastSegmentationResult) {
            this.renderer.drawImageSegmentation(this.lastSegmentationResult, this.settings.mirror);
        }
        if (this.settings.bodyModeEnabled && this.pose) {
            switch (this.settings.characterMode) {
                case 'skeleton': this.renderer.drawSkeleton(this.pose); break;
                case 'filled': this.renderer.drawFilledCharacter(this.pose); break;
                case 'blocky': this.renderer.drawBlockyCharacter(this.pose); break;
            }
        }
        if (this.settings.handTrackingEnabled && this.lastHandResults) {
            this.renderer.drawHandLandmarks(this.lastHandResults.landmarks, this.settings.mirror);
        }
        if (this.settings.objectDetectionEnabled && this.lastObjectDetections) {
            this.renderer.drawObjectDetections(this.lastObjectDetections.detections, this.settings.mirror);
        }
        if (this.lastOcrResult) {
            this.renderer.drawOcrResults(this.lastOcrResult, this.settings.mirror);
        }
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        const retryBtn = document.getElementById('retry-camera-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        if (errorDiv) {
            errorDiv.querySelector('p').textContent = message;
            errorDiv.style.display = 'flex';
        }
        if (retryBtn) retryBtn.style.display = 'none'; // Hide retry button, show hard refresh
        if (refreshBtn) refreshBtn.style.display = 'block';
        
        document.getElementById('loading-message').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => new MimicaApp());
