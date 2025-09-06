/**
 * MIMICA - Smoother Tests
 * Unit tests for EMA smoothing functionality
 */

import { Smoother } from '../web-demo/src/smoother.js';

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

// Test cases
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
    
    // Expected: 0.5 * 10 + 0.5 * 0 = 5
    assertEqual(result[0].x, 5);
    assertEqual(result[0].y, 10);
});

test('different alpha values', () => {
    // High alpha = more responsive (less smoothing)
    const responsiveSmoother = new Smoother(0.9);
    responsiveSmoother.smooth([{ x: 0, y: 0 }]);
    let result = responsiveSmoother.smooth([{ x: 10, y: 10 }]);
    assertEqual(result[0].x, 9); // 0.9 * 10 + 0.1 * 0 = 9
    
    // Low alpha = more smoothing (less responsive)  
    const smoothSmoother = new Smoother(0.1);
    smoothSmoother.smooth([{ x: 0, y: 0 }]);
    result = smoothSmoother.smooth([{ x: 10, y: 10 }]);
    assertEqual(result[0].x, 1); // 0.1 * 10 + 0.9 * 0 = 1
});

test('alpha boundary values', () => {
    const smoother = new Smoother();
    
    // Test setAlpha with boundary values
    smoother.setAlpha(-0.5); // Should clamp to 0
    smoother.setAlpha(1.5); // Should clamp to 1
    
    // Alpha 0 = no new data (all history)
    smoother.setAlpha(0);
    smoother.smooth([{ x: 100, y: 100 }]);
    let result = smoother.smooth([{ x: 200, y: 200 }]);
    assertEqual(result[0].x, 100); // Should keep original
    
    // Alpha 1 = no smoothing (all new data)
    smoother.reset();
    smoother.setAlpha(1);
    smoother.smooth([{ x: 100, y: 100 }]);
    result = smoother.smooth([{ x: 200, y: 200 }]);
    assertEqual(result[0].x, 200); // Should use new data
});

test('handling null/missing points', () => {
    const smoother = new Smoother(0.5);
    
    // Initialize with valid data
    smoother.smooth([
        { x: 10, y: 20 },
        { x: 30, y: 40 }
    ]);
    
    // Pass data with missing second point
    const result = smoother.smooth([
        { x: 50, y: 60 },
        null
    ]);
    
    // First point should be smoothed
    assertEqual(result[0].x, 30); // 0.5 * 50 + 0.5 * 10
    assertEqual(result[0].y, 40); // 0.5 * 60 + 0.5 * 20
    
    // Second point should retain previous value
    assertEqual(result[1].x, 30);
    assertEqual(result[1].y, 40);
});

test('getPrevious functionality', () => {
    const smoother = new Smoother(0.3);
    
    // Not initialized yet
    assertEqual(smoother.getPrevious(0), null);
    
    // Initialize with data
    const points = [
        { x: 100, y: 200 },
        { x: 300, y: 400 }
    ];
    smoother.smooth(points);

    // Get previous values
    const prevPoint0 = smoother.getPrevious(0);
    const prevPoint1 = smoother.getPrevious(1);

    assertEqual(prevPoint0.x, 100);
    assertEqual(prevPoint0.y, 200);
    assertEqual(prevPoint1.x, 300);
    assertEqual(prevPoint1.y, 400);
});

console.log('All smoother tests passed! ✓');