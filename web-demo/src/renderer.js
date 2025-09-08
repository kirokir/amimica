/**
 * MIMICA - Pose Rendering Helper
 */
export class PoseRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        
        this.POSE_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], [11, 12], [11, 13], [12, 14], [13, 15], [14, 16], [15, 17], [16, 18], [15, 19], [15, 21], [16, 20], [16, 22], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [27, 31], [28, 32], [29, 31], [30, 32]];
        this.HAND_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

        this.colors = {
            joints: '#00ff88', bones: '#ffffff', face: '#ffaa00', torso: '#00aaff',
            leftArm: '#ff6600', rightArm: '#ff0066', leftLeg: '#66ff00', rightLeg: '#0066ff',
            characterStroke: '#1a1a1a', hand: '#ff55aa', objectBox: '#00aaff'
        };
        
        this.segmentationColors = [
            [0, 0, 0, 0],           // 0: background (transparent)
            [128, 64, 128, 128],    // 1: aeroplane
            [244, 35, 232, 128],    // 2: bicycle
            [70, 70, 70, 128],      // 3: bird
            [102, 102, 156, 128],   // 4: boat
            [190, 153, 153, 128],   // 5: bottle
            [153, 153, 153, 128],   // 6: bus
            [250, 170, 30, 128],    // 7: car
            [220, 220, 0, 128],     // 8: cat
            [107, 142, 35, 128],    // 9: chair
            [152, 251, 152, 128],   // 10: cow
            [70, 130, 180, 128],    // 11: dining table
            [220, 20, 60, 128],     // 12: dog
            [255, 0, 0, 128],       // 13: horse
            [0, 0, 142, 128],       // 14: motorbike
            [0, 0, 70, 128],        // 15: person
            [0, 60, 100, 128],      // 16: potted plant
            [0, 80, 100, 128],      // 17: sheep
            [0, 0, 230, 128],       // 18: sofa
            [119, 11, 32, 128],     // 19: train
            [0, 0, 142, 128]        // 20: tv
        ];
    }

    drawObjectDetections(detections, mirror) {
        if (!detections || detections.length === 0) return;
        const canvasWidth = this.ctx.canvas.width;

        detections.forEach(detection => {
            const bbox = detection.boundingBox;
            const x = mirror ? canvasWidth - bbox.originX - bbox.width : bbox.originX;
            const y = bbox.originY;
            const label = `${detection.categories[0].categoryName} (${Math.round(detection.categories[0].score * 100)}%)`;

            this.ctx.strokeStyle = this.colors.objectBox;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, bbox.width, bbox.height);

            this.ctx.fillStyle = this.colors.objectBox;
            this.ctx.font = '14px sans-serif';
            this.ctx.fillText(label, x, y > 10 ? y - 5 : 20);
        });
    }

    drawImageSegmentation(segmentationResult, mirror) {
        if (!segmentationResult || !segmentationResult.categoryMask) return;
        
        const { categoryMask, width, height } = segmentationResult;
        const imageData = this.ctx.createImageData(width, height);
        const pixelData = imageData.data;
        const maskData = categoryMask.getAsUint8Array();

        for (let i = 0; i < maskData.length; i++) {
            const maskValue = maskData[i];
            const color = this.segmentationColors[maskValue] || [0, 0, 0, 0];
            const pixelIndex = i * 4;
            pixelData[pixelIndex] = color[0];
            pixelData[pixelIndex + 1] = color[1];
            pixelData[pixelIndex + 2] = color[2];
            pixelData[pixelIndex + 3] = color[3];
        }
        
        createImageBitmap(imageData).then(bitmap => {
            this.ctx.save();
            if (mirror) {
                this.ctx.scale(-1, 1);
                this.ctx.translate(-width, 0);
            }
            this.ctx.drawImage(bitmap, 0, 0, width, height);
            this.ctx.restore();
        });
    }

    drawHandLandmarks(handLandmarks, mirror) {
        if (!handLandmarks || handLandmarks.length === 0) return;
        const canvasWidth = this.ctx.canvas.width;
        const canvasHeight = this.ctx.canvas.height;
        for (const landmarks of handLandmarks) {
            const points = landmarks.map(landmark => ({
                x: mirror ? canvasWidth - landmark.x * canvasWidth : landmark.x * canvasWidth,
                y: landmark.y * canvasHeight
            }));
            this.ctx.strokeStyle = this.colors.hand;
            this.ctx.lineWidth = 2;
            this.HAND_CONNECTIONS.forEach(([start, end]) => {
                if (points[start] && points[end]) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(points[start].x, points[start].y);
                    this.ctx.lineTo(points[end].x, points[end].y);
                    this.ctx.stroke();
                }
            });
            this.ctx.fillStyle = this.colors.joints;
            points.forEach(point => {
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                this.ctx.fill();
            });
        }
    }
    
    drawSkeleton(points) {
        if (!points || points.length < 33) return;
        this.ctx.strokeStyle = this.colors.bones;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.POSE_CONNECTIONS.forEach(([start, end]) => {
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
        if (!points || points.length < 33) return;
        this.ctx.strokeStyle = this.colors.bones;
        this.ctx.lineWidth = 1;
        if (points[0] && points[7] && points[8]) {
            const headCenter = { x: (points[7].x + points[8].x) / 2, y: points[0].y };
            const headRadius = this.distance(points[7], points[8]) / 1.5;
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
    
    drawBlockyCharacter(points) {
        if (!points || points.length < 33) return;
        const p = points;
        const joints = {
            leftShoulder: p[11], rightShoulder: p[12], leftElbow: p[13], rightElbow: p[14],
            leftWrist: p[15], rightWrist: p[16], leftHip: p[23], rightHip: p[24],
            leftKnee: p[25], rightKnee: p[26], leftAnkle: p[27], rightAnkle: p[28],
            leftEar: p[7], rightEar: p[8]
        };
        const shoulderWidth = this.distance(joints.leftShoulder, joints.rightShoulder);
        const limbThickness = shoulderWidth ? shoulderWidth / 4 : 20;
        this.drawCapsule(joints.leftShoulder, joints.leftElbow, limbThickness, this.colors.leftArm);
        this.drawCapsule(joints.leftElbow, joints.leftWrist, limbThickness, this.colors.leftArm);
        this.drawCapsule(joints.rightShoulder, joints.rightElbow, limbThickness, this.colors.rightArm);
        this.drawCapsule(joints.rightElbow, joints.rightWrist, limbThickness, this.colors.rightArm);
        this.drawCapsule(joints.leftHip, joints.leftKnee, limbThickness, this.colors.leftLeg);
        this.drawCapsule(joints.leftKnee, joints.leftAnkle, limbThickness, this.colors.leftLeg);
        this.drawCapsule(joints.rightHip, joints.rightKnee, limbThickness, this.colors.rightLeg);
        this.drawCapsule(joints.rightKnee, joints.rightAnkle, limbThickness, this.colors.rightLeg);
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
        if (joints.leftShoulder && joints.rightShoulder && joints.leftEar && joints.rightEar) {
            const shoulderCenter = { x: (joints.leftShoulder.x + joints.rightShoulder.x) / 2, y: (joints.leftShoulder.y + joints.rightShoulder.y) / 2 };
            const headRadius = this.distance(joints.leftEar, joints.rightEar) / 1.5;
            const neckLength = shoulderWidth ? shoulderWidth / 2 : 40;
            const headCenter = { x: shoulderCenter.x, y: shoulderCenter.y - neckLength };
            this.ctx.fillStyle = this.colors.face;
            this.ctx.beginPath();
            this.ctx.arc(headCenter.x, headCenter.y, headRadius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    drawCapsule(p1, p2, thickness, color) {
        if (!p1 || !p2) return;
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = this.colors.characterStroke;
        this.ctx.lineWidth = 2;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
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
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
}
