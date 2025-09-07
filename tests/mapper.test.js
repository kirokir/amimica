/**
 * MIMICA - Pose Mapper Tests  
 * Unit tests for coordinate mapping and IK calculations
 */
import { PoseMapper } from '../web-demo/src/mapper.js';

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
const mapper = new PoseMapper();

test('landmarksToPoints - basic conversion', () => {
    const landmarks = [{ x: 0.5, y: 0.5 }];
    const points = mapper.landmarksToPoints(landmarks, 640, 480, false);
    assert(points[0].x === 320, 'X should be 320');
    assert(points[0].y === 240, 'Y should be 240');
});

test('landmarksToPoints - with mirroring', () => {
    const landmarks = [{ x: 0.25, y: 0.5 }];
    const points = mapper.landmarksToPoints(landmarks, 400, 300, true);
    assert(points[0].x === 300, 'Mirrored X should be 300');
});

test('static lerpPoint function', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 20 };
    const midpoint = PoseMapper.lerpPoint(p1, p2, 0.5);
    assert(midpoint.x === 5, 'Lerp X should be 5');
    assert(midpoint.y === 10, 'Lerp Y should be 10');
});

console.log('All mapper tests passed! ✓');
