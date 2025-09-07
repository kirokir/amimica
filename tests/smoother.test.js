/**
 * MIMICA - Smoother Tests
 * Unit tests for EMA smoothing functionality
 */
// Mock PoseMapper for the test environment
global.PoseMapper = class MockPoseMapper {
    static lerp(a, b, t) { return a + (b - a) * t; }
    static lerpPoint(p1, p2, t) {
        if (!p1) return p2 ? { ...p2 } : null;
        if (!p2) return p1 ? { ...p1 } : null;
        return {
            x: this.lerp(p1.x, p2.x, t),
            y: this.lerp(p1.y, p2.y, t)
        };
    }
};

import { Smoother } from '../web-demo/src/smoother.js';

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}: ${error.message}`);
        process.exit(1);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

// Test cases
test('smoother initialization', () => {
    const smoother = new Smoother(0.5);
    assert(!smoother.isInitialized(), "Should not be initialized");
});

test('EMA smoothing calculation', () => {
    const smoother = new Smoother(0.5);
    smoother.smooth([{ x: 0, y: 0 }]);
    const result = smoother.smooth([{ x: 10, y: 20 }]);
    assert(result[0].x === 5, "Smoothed X should be 5");
    assert(result[0].y === 10, "Smoothed Y should be 10");
});

console.log('All smoother tests passed! ✓');
