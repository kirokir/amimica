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
        );
        if (leftArm) {
            result[this.joints.leftElbow] = leftArm.elbow;
            result[this.joints.leftWrist] = leftArm.wrist;
        }

        // Apply IK to right arm
        const rightArm = this.solveIK(
            points[this.joints.rightShoulder],
            points[this.joints.rightElbow],
            points[this.joints.rightWrist]
        );
        if (rightArm) {
            result[this.joints.rightElbow] = rightArm.elbow;
            result[this.joints.rightWrist] = rightArm.wrist;
        }
        
        return result;
    }

    /**
     * Solves a 2-bone IK chain.
     * @param {Object} p1 - The root joint (e.g., shoulder).
     * @param {Object} p2 - The middle joint (e.g., elbow).
     * @param {Object} p3 - The end effector/target (e.g., wrist).
     * @returns {Object|null} An object with new elbow and wrist positions, or null if invalid.
     */
    solveIK(p1, p2, p3) {
        if (!p1 || !p2 || !p3) return null;

        const l1 = this.distance(p1, p2); // Upper arm length
        const l2 = this.distance(p2, p3); // Forearm length
        
        let target = { ...p3 };
        let dist = this.distance(p1, target);
        
        // Handle unreachable targets by clamping
        if (dist > l1 + l2) {
            const dir = this.normalize(this.subtract(target, p1));
            target = this.add(p1, this.multiply(dir, l1 + l2));
            dist = l1 + l2;
        }

        // Law of cosines to find angles
        const angle1 = Math.acos((l1*l1 + dist*dist - l2*l2) / (2 * l1 * dist));
        const angle2 = Math.atan2(target.y - p1.y, target.x - p1.x);

        // Calculate the new elbow position
        const newElbow = {
            x: p1.x + l1 * Math.cos(angle2 - angle1),
            y: p1.y + l1 * Math.sin(angle2 - angle1)
        };

        return { elbow: newElbow, wrist: target };
    }

    // --- Vector Math Helpers ---
    distance(p1, p2) {
        if (!p1 || !p2) return 0;
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    subtract(p1, p2) {
        return { x: p1.x - p2.x, y: p1.y - p2.y };
    }

    add(p1, p2) {
        return { x: p1.x + p2.x, y: p1.y + p2.y };
    }

    multiply(p, scalar) {
        return { x: p.x * scalar, y: p.y * scalar };
    }

    normalize(p) {
        const mag = Math.sqrt(p.x * p.x + p.y * p.y);
        if (mag === 0) return { x: 0, y: 0 };
        return { x: p.x / mag, y: p.y / mag };
    }

    angleDiff(a1, a2) {
        let diff = a2 - a1;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        return diff;
    }

    static lerp(a, b, t) {
        return a + (b - a) * t;
    }

    static lerpPoint(p1, p2, t) {
        if (!p1) return { ...p2 };
        if (!p2) return { ...p1 };
        return {
            x: this.lerp(p1.x, p2.x, t),
            y: this.lerp(p1.y, p2.y, t)
        };
    }
}