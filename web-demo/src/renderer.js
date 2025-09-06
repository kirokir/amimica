/**
 * MIMICA - Pose Rendering Helper
 * Handles drawing stick figures and filled characters on canvas
 */

export class PoseRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        
        this.connections = [
            [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
            [11, 12], [11, 13], [12, 14], [13, 15], [14, 16], [15, 17], [16, 18],
            [15, 19], [15, 21], [16, 20], [16, 22], [11, 23], [12, 24], [23, 24],
            [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [27, 31],
            [28, 32], [29, 31], [30, 32]
        ];
        
        this.colors = {
            joints: '#00ff88', bones: '#ffffff', face: '#ffaa00', torso: '#00aaff',
            leftArm: '#ff6600', rightArm: '#ff0066', leftLeg: '#66ff00', rightLeg: '#0066ff'
        };
    }
    
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