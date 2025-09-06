/**
 * MIMICA - Pose Rendering Helper
 * Handles drawing stick figures and filled characters on canvas
 */

export class PoseRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        
        // MediaPipe pose connections for skeleton drawing
        this.connections = [
            // Face
            [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
            // Torso
            [9, 10], [11, 12], [11, 13], [12, 14], [13, 15], [14, 16],
            [15, 17], [16, 18], [15, 19], [15, 21], [16, 20], [16, 22],
            [11, 23], [12, 24], [23, 24],
            // Left arm
            [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
            // Right arm  
            [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
            // Left leg
            [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
            // Right leg
            [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
        ];
        
        // Colors for different body parts
        this.colors = {
            joints: '#00ff88',
            bones: '#ffffff',
            face: '#ffaa00',
            torso: '#00aaff',
            leftArm: '#ff6600',
            rightArm: '#ff0066',
            leftLeg: '#66ff00',
            rightLeg: '#0066ff'
        };
    }
    
    /**
     * Draw skeleton representation of the pose
     * @param {Array} points - Array of {x, y} coordinates for each landmark
     */
    drawSkeleton(points) {
        if (!points || points.length < 33) return;
        
        // Draw bones (connections between joints)
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
        
        // Draw joints as circles
        this.ctx.fillStyle = this.colors.joints;
        points.forEach((point, index) => {
            if (point) {
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Highlight key joints with larger circles
                if ([0, 11, 12, 13, 14, 15, 16, 23, 24].includes(index)) {
                    this.ctx.strokeStyle = this.colors.bones;
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            }
        });
    }
    
    /**
     * Draw filled character representation of the pose
     * @param {Array} points - Array of {x, y} coordinates for each landmark
     */
    drawFilledCharacter(points) {
        if (!points || points.length < 33) return;
        
        this.ctx.fillStyle = this.colors.torso;
        this.ctx.strokeStyle = this.colors.bones;
        this.ctx.lineWidth = 1;
        
        // Draw head as circle
        if (points[0] && points[9] && points[10]) {
            const headCenter = {
                x: (points[9].x + points[10].x) / 2,
                y: (points[9].y + points[10].y) / 2 - 20
            };
            const headRadius = Math.abs(points[9].x - points[10].x) / 2 + 15;
            
            this.ctx.fillStyle = this.colors.face;
            this.ctx.beginPath();
            this.ctx.arc(headCenter.x, headCenter.y, headRadius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
        }
        
        // Draw torso as rectangle
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
        
        // Draw arms as thick lines
        this.drawLimb([points[11], points[13], points[15]], this.colors.leftArm, 8);
        this.drawLimb([points[12], points[14], points[16]], this.colors.rightArm, 8);
        
        // Draw legs as thick lines
        this.drawLimb([points[23], points[25], points[27]], this.colors.leftLeg, 10);
        this.drawLimb([points[24], points[26], points[28]], this.colors.rightLeg, 10);
        
        // Draw hands as circles
        if (points[15]) this.drawJoint(points[15], 6, this.colors.leftArm);
        if (points[16]) this.drawJoint(points[16], 6, this.colors.rightArm);
        
        // Draw feet as circles
        if (points[27]) this.drawJoint(points[27], 8, this.colors.leftLeg);
        if (points[28]) this.drawJoint(points[28], 8, this.colors.rightLeg);
    }
    
    /**
     * Draw a limb as a series of connected thick lines
     * @param {Array} points - Points defining the limb
     * @param {string} color - Color for the limb
     * @param {number} thickness - Line thickness
     */
    drawLimb(points, color, thickness) {
        if (!points || points.length < 2) return;
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = thickness;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
            if (points[i]) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
        }
        
        this.ctx.stroke();
    }
    
    /**
     * Draw a joint as a filled circle
     * @param {Object} point - {x, y} coordinate
     * @param {number} radius - Circle radius
     * @param {string} color - Fill color
     */
    drawJoint(point, radius, color) {
        if (!point) return;
        
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}