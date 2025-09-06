/**
 * MIMICA - Pose Mapping Utilities
 * Handles coordinate transformations, IK calculations, and pose math
 */

export class PoseMapper {
    constructor() {
        // MediaPipe pose landmark indices for important joints
        this.joints = {
            nose: 0,
            leftEye: 1, rightEye: 2,
            leftEar: 3, rightEar: 4,
            leftShoulder: 11, rightShoulder: 12,
            leftElbow: 13, rightElbow: 14,
            leftWrist: 15, rightWrist: 16,
            leftHip: 23, rightHip: 24,
            leftKnee: 25, rightKnee: 26,
            leftAnkle: 27, rightAnkle: 28
        };
    }
    
    /**
     * Convert normalized MediaPipe landmarks to pixel coordinates
     * @param {Array} landmarks - MediaPipe pose landmarks (normalized 0-1)
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height  
     * @param {boolean} mirror - Whether to mirror the coordinates
     * @returns {Array} Array of {x, y} pixel coordinates
     */
    landmarksToPoints(landmarks, width, height, mirror = true) {
        return landmarks.map(landmark => {
            if (!landmark) return null;
            
            let x = landmark.x * width;
            let y = landmark.y * height;
            
            // Apply mirroring for natural selfie view
            if (mirror) {
                x = width - x;
            }
            
            return { x, y };
        });
    }
    
    /**
     * Apply 2-bone Inverse Kinematics to arm joints
     * Uses closed-form solution for shoulder-elbow-wrist chain
     * @param {Array} points - Array of joint positions
     * @returns {Array} Points with IK applied to arms
     */
    applyIK(points) {
        if (!points || points.length < 33) return points;
        
        const result = [...points];
        
        // Apply IK to left arm (shoulder -> elbow -> wrist)
        const leftArm = this.solveIK(
            points[this.joints.leftShoulder],
            points[this.joints.leftElbow], 
            points[this.joints.leftWrist]