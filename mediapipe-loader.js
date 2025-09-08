// mediapipe-loader.js

// Import the necessary components from the official MediaPipe CDN ES Module bundle.
import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

// Expose the imported components to the global 'window' object.
// This makes them accessible to your app.js script, which is not a module.
window.MediaPipeTasks = { FilesetResolver, PoseLandmarker, HandLandmarker };
