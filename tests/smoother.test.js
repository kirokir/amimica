/**
 * MIMICA - Smoother Tests
 * Unit tests for EMA smoothing functionality
 */

import { Smoother } from '../web-demo/src/smoother.js';
// Note: We don't need to import PoseMapper here, because smoother.js already does.
// The Node.js module runner will handle resolving that dependency chain.

// Simple test runner for Node.js
function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}: ${error.message}`);
        process.exit(1);
    }
}

function assertEqual(actual, expected, tolerance = 0.001) {
    // Check for null/undefined cases
    if (actual == null || expected == null) {
        if (actual === expected) return;
        throw new Error(`Expected ${expected}, got ${actual}`);
    }

    if (typeof expected === 'number') {
        if (Math.abs(actual - expected) > tolerance) {
            throw new Error(`Expected ${expected}, got ${actual}`);
        }
    } else {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
}

// --- Test Cases ---

test('smoother initialization', () => {
    const smoother = new Smoother(0.5);
    assertEqual(smoother.isInitialized(), false);
    assertEqual(smoother.getCurrent(), null);
});

test('first frame initialization', () => {
    const smoother = new Smoother(0.3);
    const points = [
        { x: 100, y: 200 },
        { x: 150, y: 250 }
    ];
    
    const result = smoother.smooth(points);
    
    assertEqual(smoother.isInitialized(), true);
    assertEqual(result[0].x, 100);
    assertEqual(result[0].y, 200);
    assertEqual(result[1].x, 150);
    assertEqual(result[1].y, 250);
});

test('EMA smoothing calculation', () => {
    const smoother = new Smoother(0.5); // 50/50 blend
    
    // First frame
    const frame1 = [{ x: 0, y: 0 }];
    smoother.smooth(frame1);
    
    // Second frame - should blend 50/50
    const frame2 = [{ x: 10, y: 20 }];
    const result = smoother.smooth(frame2);
    
    // Expected: 0.5 * 10 + (1 - 0.5) * 0 = 5
    assertEqual(result[0].x, 5);
    assertEqual(result[0].y, 10);
});

test('handling null/missing points', () => {
    const smoother = new Smoother(0.5);
    
    // Initialize with valid data
    smoother.smooth([
        { x: 10, y: 20 },
        { x: 30, y: 40 }
    ]);
    
    // Pass data with a missing second point
    const result = smoother.smooth([
        { x: 50, y: 60 },
        null
    ]);
    
    // First point should be smoothed
    assertEqual(result[0].x, 30); // 0.5 * 50 + 0.5 * 10
    assertEqual(result[0].y, 40); // 0.5 * 60 + 0.5 * 20
    
    // Second point should be null, because it was null in the input
    assertEqual(result[1], null);
});

console.log('All smoother tests passed! ✓');
