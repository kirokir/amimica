/**
 * MIMICA - Pose Detection Web Worker
 * Fallback worker for pose detection (not used in current implementation)
 * Main thread handles pose detection directly for simplicity
 */

// Web Worker for pose detection - currently unused but provided for future enhancement
// The main thread handles MediaPipe directly for better compatibility

self.onmessage = function(e) {
    const { imageData, settings } = e.data;
    
    // This would handle pose detection in a worker thread
    // Currently, we use main thread for MediaPipe compatibility
    // Future enhancement could move MediaPipe processing here
    
    console.log('PoseWorker: Received imageData, but using main thread processing');
    
    // Echo back that we're using main thread
    self.postMessage({
        type: 'fallback',
        message: 'Using main thread pose detection for compatibility'
    });
};