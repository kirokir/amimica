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
    
    landmarksToPoints(landmarks, width, height, mirror = true) {
        return landmarks.map(landmark => {
            if (!landmark) return null;
            let x = landmark.x * width;
            let y = landmark.y * height;
            if (mirror) {
                x = width - x;
            }
            return { x, y };
        });
    }
    
    applyIK(points) {
        if (!points || points.length < 33) return points;
        
        const result = [...points];
        
        const leftArm = this.solveIK(points[this.joints.leftShoulder], points[this.joints.leftElbow], points[this.joints.leftWrist]);
        if (leftArm) {
            result[this.joints.leftElbow] = leftArm.elbow;
            result[this.joints.leftWrist] = leftArm.wrist;
        }

        const rightArm = this.solveIK(points[this.joints.rightShoulder], points[this.joints.rightElbow], points[this.joints.rightWrist]);
        if (rightArm) {
            result[this.joints.rightElbow] = rightArm.elbow;
            result[this.joints.rightWrist] = rightArm.wrist;
        }
        
        return result;
    }

    solveIK(p1, p2, p3) {
        if (!p1 || !p2 || !p3) return null;

        const l1 = this.distance(p1, p2);
        const l2 = this.distance(p2, p3);
        
        let target = { ...p3 };
        let dist = this.distance(p1, target);
        
        if (dist > l1 + l2) {
            const dir = this.normalize(this.subtract(target, p1));
            target = this.add(p1, this.multiply(dir, l1 + l2));
            dist = l1 + l2;
        }

        // Handle case where distance is zero to avoid division by zero in acos
        if (dist < 0.001) {
            return { elbow: this.add(p1, {x: l1, y: 0}), wrist: target };
        }
        
        const cosAngle1 = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
        const angle1 = Math.acos(Math.max(-1, Math.min(1, cosAngle1))); // Clamp value to avoid NaN
        const angle2 = Math.atan2(target.y - p1.y, target.x - p1.x);

        const newElbow = {
            x: p1.x + l1 * Math.cos(angle2 - angle1),
            y: p1.y + l1 * Math.sin(angle2 - angle1)
        };

        return { elbow: newElbow, wrist: target };
    }

    distance(p1, p2) {
        if (!p1 || !p2) return 0;
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    subtract(p1, p2) { return { x: p1.x - p2.x, y: p1.y - p2.y }; }
    add(p1, p2) { return { x: p1.x + p2.x, y: p1.y + p2.y }; }
    multiply(p, scalar) { return { x: p.x * scalar, y: p.y * scalar }; }

    normalize(p) {
        const mag = Math.sqrt(p.x * p.x + p.y * p.y);
        if (mag === 0) return { x: 0, y: 0 };
        return { x: p.x / mag, y: p.y / mag };
    }
    
    static lerp(a, b, t) { return a + (b - a) * t; }

    static lerpPoint(p1, p2, t) {
        if (!p1) return p2 ? { ...p2 } : null;
        if (!p2) return p1 ? { ...p1 } : null;
        return {
            x: PoseMapper.lerp(p1.x, p2.x, t),
            y: PoseMapper.lerp(p1.y, p2.y, t)
        };
    }
}