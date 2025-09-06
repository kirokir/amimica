/**
 * MIMICA - Pose Rendering Helper
 * Handles drawing skeletons, filled characters, and animated blocky characters.
 */

export class PoseRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        
        // Connections for the skeleton mode
        this.connections = [
            [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
            [11, 12], [11, 13], [12, 14], [13, 15], [14, 16], [15, 17], [16, 18],
            [15, 19], [15, 21], [16, 20], [16, 22], [11, 23], [12, 24], [23, 24],
            [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [27, 31],
            [28, 32], [29, 31], [30, 32]
        ];
        
        // Colors for all character modes
        this.colors = {
            joints: '#00ff88', bones: '#ffffff', face: '#ffaa00', torso: '#00aaff',
            leftArm: '#ff6600', rightArm: '#ff0066', leftLeg: '#66ff00', rightLeg: '#0066ff',
            characterStroke: '#1a1a1a'
        };
    }

    /**
     * NEW: Draws a rounded rectangle (capsule) between two points.
     * This is the core of our new character's limbs.
     */
    drawCapsule(p1, p2, thickness, color) {
        if (!p1 || !p2) return;
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = this.colors.characterStroke;
        this.ctx.lineWidth = 2;

        const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        
        this.ctx.save();
        this.ctx.translate(p1.x, p1.y);
        this.ctx.rotate(angle);
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, -thickness / 2);
        this.ctx.lineTo(dist, -thickness / 2);
        this.ctx.arc(dist, 0, thickness / 2, -Math.PI / 2, Math.PI / 2);
        this.ctx.lineTo(0, thickness / 2);
        this.ctx.arc(0, 0, thickness / 2, Math.PI / 2, -Math.PI / 2);
        this.ctx.closePath();
        
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    /**
     * NEW: Draws the animated "Blocky" character.
     */
    drawBlockyCharacter(points) {
        if (!points || points.length < 33) return;

        // Define body parts using landmark indices
        const p = points;
        const joints = {
            leftShoulder: p[11], rightShoulder: p[12], leftElbow: p[13], rightElbow: p[14],
            leftWrist: p[15], rightWrist: p[16], leftHip: p[23], rightHip: p[24],
            leftKnee: p[25], rightKnee: p[26], leftAnkle: p[27], rightAnkle: p[28],
            leftEar: p[7], rightEar: p[8]
        };

        const shoulderWidth = this.distance(joints.leftShoulder, joints.rightShoulder);
        const limbThickness = shoulderWidth / 4;

        // Draw Limbs (drawn first to be underneath the torso)
        this.drawCapsule(joints.leftShoulder, joints.leftElbow, limbThickness, this.colors.leftArm);
        this.drawCapsule(joints.leftElbow, joints.leftWrist, limbThickness, this.colors.leftArm);
        this.drawCapsule(joints.rightShoulder, joints.rightElbow, limbThickness, this.colors.rightArm);
        this.drawCapsule(joints.rightElbow, joints.rightWrist, limbThickness, this.colors.rightArm);
        this.drawCapsule(joints.leftHip, joints.leftKnee, limbThickness, this.colors.leftLeg);
        this.drawCapsule(joints.leftKnee, joints.leftAnkle, limbThickness, this.colors.leftLeg);
        this.drawCapsule(joints.rightHip, joints.rightKnee, limbThickness, this.colors.rightLeg);
        this.drawCapsule(joints.rightKnee, joints.rightAnkle, limbThickness, this.colors.rightLeg);
        
        // Draw Torso
        if (joints.leftShoulder && joints.rightShoulder && joints.rightHip && joints.leftHip) {
            this.ctx.fillStyle = this.colors.torso;
            this.ctx.strokeStyle = this.colors.characterStroke;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(joints.leftShoulder.x, joints.leftShoulder.y);
            this.ctx.lineTo(joints.rightShoulder.x, joints.rightShoulder.y);
            this.ctx.lineTo(joints.rightHip.x, joints.rightHip.y);
            this.ctx.lineTo(joints.leftHip.x, joints.leftHip.y);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        // Draw Head
        if (joints.leftShoulder && joints.rightShoulder) {
            const shoulderCenter = {
                x: (joints.leftShoulder.x + joints.rightShoulder.x) / 2,
                y: (joints.leftShoulder.y + joints.rightShoulder.y) / 2
            };
            const headRadius = this.distance(joints.leftEar, joints.rightEar) / 2 + 10;
            const neckLength = shoulderWidth / 2;
            const headCenter = {
                x: shoulderCenter.x,
                y: shoulderCenter.y - neckLength
            };
            
            this.ctx.fillStyle = this.colors.face;
            this.ctx.beginPath();
            this.ctx.arc(headCenter.x, headCenter.y, headRadius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    // --- Existing Drawing Functions ---

    drawSkeleton(points) {
        if (!points || points.length < 33) return;
        this.ctx.strokeStyle = this.colors.bones;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.connections.forEach(([start, end]) => {
            if (points[start] && points[end]) {
                this.ctx.beginPath();
                this.ctx.moveTo(points[start].x, points[start].y);
                this.ctx.lineTo(points[end].x, points[end].y);
                this.ctx.stroke();
            }
        });
        this.ctx.fillStyle = this.colors.joints;
        points.forEach(point => {
            if (point) {
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        });
    }
    
    drawFilledCharacter(points) {
        // This function remains unchanged
        if (!points || points.length < 33) return;
        this.ctx.strokeStyle = this.colors.bones;
        this.ctx.lineWidth = 1;
        if (points[0] && points[9] && points[10]) {
            const headCenter = { x: (points[9].x + points[10].x) / 2, y: points[0].y - 10 };
            const headRadius = this.distance(points[7], points[8]) / 2 + 5;
            this.drawJoint(headCenter, headRadius, this.colors.face);
            this.ctx.stroke();
        }
        if (points[11] && points[12] && points[23] && points[24]) {
            this.ctx.fillStyle = this.colors.torso;
            this.ctx.beginPath();
            this.ctx.moveTo(points[11].x, points[11].y);
            this.ctx.lineTo(points[12].x, points[12].y);
            this.ctx.lineTo(points[24].x, points[24].y);
            this.ctx.lineTo(points[23].x, points[23].y);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }
        this.drawLimb([points[11], points[13], points[15]], this.colors.leftArm, 12);
        this.drawLimb([points[12], points[14], points[16]], this.colors.rightArm, 12);
        this.drawLimb([points[23], points[25], points[27]], this.colors.leftLeg, 15);
        this.drawLimb([points[24], points[26], points[28]], this.colors.rightLeg, 15);
    }
    
    drawLimb(points, color, thickness) {
        if (!points.every(p => p)) return;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = thickness;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.stroke();
    }
    
    drawJoint(point, radius, color) {
        if (!point) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    distance(p1, p2) {
        if (!p1 || !p2) return 0;
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }
}