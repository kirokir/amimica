// segmentation-worker.js
import { ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs";

let imageSegmenter;
let isInitialized = false;

// Initialize the ImageSegmenter
async function initialize() {
    try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
        imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
                delegate: 'GPU' // Workers can handle GPU tasks safely off the main thread
            },
            runningMode: 'IMAGE', // Use IMAGE mode for single-frame processing in a worker
            outputCategoryMask: true,
        });
        isInitialized = true;
        self.postMessage({ type: 'INITIALIZED' });
        console.log("Segmentation worker initialized successfully.");
    } catch (error) {
        console.error("Segmentation worker failed to initialize:", error);
        self.postMessage({ type: 'ERROR', error: error.message });
    }
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
    if (event.data.type === 'INITIALIZE') {
        await initialize();
    } else if (event.data.type === 'SEGMENT' && isInitialized) {
        if (!event.data.imageData) return;
        
        // ImageSegmenter expects an object with .data and dimensions
        const image = {
            data: event.data.imageData.data,
            width: event.data.imageData.width,
            height: event.data.imageData.height,
        };
        
        imageSegmenter.segment(image, (result) => {
             // Send the result back to the main thread
            self.postMessage({ type: 'RESULT', result });
        });
    }
};
