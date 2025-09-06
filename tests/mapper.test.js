/**
 * MIMICA - Pose Mapper Tests  
 * Unit tests for coordinate mapping and IK calculations
 */

import { PoseMapper } from '../web-demo/src/mapper.js';

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
const mapper = new PoseMapper();

test('landmarksToPoints - basic conversion', () => {
    const landmarks = [
        { x: 0.5, y: 0.5 },
        { x: 0.0, y: 1.0 },
        { x: 1.0, y: 0.0 }
    ];
    
    const points = mapper.landmarksToPoints(landmarks, 640, 480, false);
    
    assertEqual(points[0].x, 320);
    assertEqual(points[0].y, 240);
    assertEqual(points[1].x, 0);
    assertEqual(points[1].y, 480);
    assertEqual(points[2].x, 640);
    assertEqual(points[2].y, 0);
});

test('landmarksToPoints - with mirroring', () => {
    const landmarks = [
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 }
    ];
    
    const points = mapper.landmarksToPoints(landmarks, 400, 300, true);
    
    // With mirroring, x coordinates should be flipped
    assertEqual(points[0].x, 300); // 400 - (0.25 * 400) = 300
    assertEqual(points[0].y, 150);
    assertEqual(points[1].x, 100); // 400 - (0.75 * 400) = 100
    assertEqual(points[1].y, 150);
});

test('distance calculation', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 3, y: 4 };
    
    const dist = mapper.distance(p1, p2);
    assertEqual(dist, 5); // 3-4-5 triangle
});

test('vector operations', () => {
    const p1 = { x: 10, y: 20 };
    const p2 = { x: 5, y: 8 };
    
    const subtracted = mapper.subtract(p1, p2);
    assertEqual(subtracted.x, 5);
    assertEqual(subtracted.y, 12);
    
    const added = mapper.add(p1, p2);
    assertEqual(added.x, 15);
    assertEqual(added.y, 28);
    
    const multiplied = mapper.multiply(p1, 0.5);
    assertEqual(multiplied.x, 5);
    assertEqual(multiplied.y, 10);
});

test('vector normalization', () => {
    const vector = { x: 3, y: 4 };
    const normalized = mapper.normalize(vector);
    
    assertEqual(normalized.x, 0.6);
    assertEqual(normalized.y, 0.8);
    
    // Verify unit length
    const length = Math.sqrt(normalized.x * normalized.x + normalized.y * normalized.y);
    assertEqual(length, 1, 0.001);
});

test('angle difference calculation', () => {
    // Test angle wrapping
    const diff1 = mapper.angleDiff(0, Math.PI);
    assertEqual(Math.abs(diff1), Math.PI);
    
    const diff2 = mapper.angleDiff(Math.PI * 1.8, Math.PI * 0.2);
    assertEqual(Math.abs(diff2) < Math.PI, true);
});

test('IK solver - reachable target', () => {
    const shoulder = { x: 0, y: 0 };
    const elbow = { x: 50, y: 0 }; // Upper arm length = 50
    const wrist = { x: 50, y: 50 }; // Forearm length = 50, target at (50, 50)
    
    const result = mapper.solveIK(shoulder, elbow, wrist);
    
    // Should find a valid solution
    assertEqual(result !== null, true);
    assertEqual(result.wrist.x, 50);
    assertEqual(result.wrist.y, 50);
    
    // Verify bone lengths are preserved
    const upperArmLength = mapper.distance(shoulder, result.elbow);
    const forearmLength = mapper.distance(result.elbow, result.wrist);
    assertEqual(upperArmLength, 50, 1);
    assertEqual(forearmLength, 50, 1);
});

test('IK solver - unreachable target', () => {
    const shoulder = { x: 0, y: 0 };
    const elbow = { x: 30, y: 0 }; // Upper arm = 30
    const wrist = { x: 30, y: 30 }; // Forearm = 30
    const unreachableTarget = { x: 200, y: 0 }; // Too far (max reach = 60)
    
    const result = mapper.solveIK(shoulder, elbow, { x: 200, y: 0 });
    
    // Should handle gracefully with proportional scaling
    assertEqual(result !== null, true);
    
    // Target should be scaled down to reachable distance
    const reachDistance = mapper.distance(shoulder, result.wrist);
    assertEqual(reachDistance <= 60, true);
});

test('static lerp function', () => {
    assertEqual(PoseMapper.lerp(0, 10, 0.5), 5);
    assertEqual(PoseMapper.lerp(-10, 10, 0.25), -5);
    assertEqual(PoseMapper.lerp(100, 200, 0), 100);
    assertEqual(PoseMapper.lerp(100, 200, 1), 200);
});

test('static lerpPoint function', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 20 };
    
    const midpoint = PoseMapper.lerpPoint(p1, p2, 0.5);
    assertEqual(midpoint.x, 5);
    assertEqual(midpoint.y, 10);
    
    // Handle null inputs
    const nullTest = PoseMapper.lerpPoint(null, p2, 0.5);
    assertEqual(nullTest.x, p2.x);
    assertEqual(nullTest.y, p2.y);
});

console.log('All mapper tests passed! ✓');