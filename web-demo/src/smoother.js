/**
 * MIMICA - EMA Smoothing Helper
 * Applies Exponential Moving Average to smooth pose landmark data over time
 */

import { PoseMapper } from './mapper.js';

export class Smoother {
    constructor(alpha = 0.3) {
        this.alpha = alpha;
        this.previousPoints = null;
    }

    setAlpha(alpha) {
        this.alpha = Math.max(0, Math.min(1, alpha));
    }

    smooth(currentPoints) {
        if (!this.previousPoints) {
            this.previousPoints = currentPoints.map(p => (p ? { ...p } : null));
            return currentPoints;
        }

        const smoothedPoints = currentPoints.map((currentPoint, i) => {
            const previousPoint = this.previousPoints[i];
            return PoseMapper.lerpPoint(previousPoint, currentPoint, this.alpha);
        });

        this.previousPoints = smoothedPoints;
        return smoothedPoints;
    }

    getPrevious(index) {
        return (this.previousPoints && this.previousPoints[index]) ? this.previousPoints[index] : null;
    }
    
    isInitialized() { return this.previousPoints !== null; }
    getCurrent() { return this.previousPoints; }
    reset() { this.previousPoints = null; }
}