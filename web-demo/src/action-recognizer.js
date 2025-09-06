/**
 * MIMICA - Action Recognizer
 * Analyzes pose landmarks to classify a wide range of common actions.
 */
export class ActionRecognizer {
    constructor() {
        // Thresholds can be tuned for better accuracy
        this.SITTING_HIP_KNEE_THRESHOLD = 20;
        this.PICKING_HAND_HIP_THRESHOLD = 50;
        this.KICKING_KNEE_HIP_THRESHOLD = 40;
    }

    // Helper to safely get a point from the pose array
    getPoint(pose, index) {
        return (pose && pose[index]) ? pose[index] : null;
    }

    /**
     * Recognizes the current action based on a pose.
     * @param {Array} pose - An array of 33 landmark points {x, y, visibility}.
     * @returns {string} The name of the recognized action.
     */
    recognize(pose) {
        if (!pose || pose.length < 33) {
            return "unknown";
        }

        // --- Retrieve all necessary landmark points first ---
        const nose = this.getPoint(pose, 0);
        const leftShoulder = this.getPoint(pose, 11);
        const rightShoulder = this.getPoint(pose, 12);
        const leftElbow = this.getPoint(pose, 13);
        const rightElbow = this.getPoint(pose, 14);
        const leftWrist = this.getPoint(pose, 15);
        const rightWrist = this.getPoint(pose, 16);
        const leftHip = this.getPoint(pose, 23);
        const rightHip = this.getPoint(pose, 24);
        const leftKnee = this.getPoint(pose, 25);
        const rightKnee = this.getPoint(pose, 26);
        const leftAnkle = this.getPoint(pose, 27);
        const rightAnkle = this.getPoint(pose, 28);
        
        // Ensure all required keypoints are visible before proceeding
        const requiredPoints = [nose, leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle];
        if (requiredPoints.some(p => !p)) {
            return "unknown";
        }

        // --- Setup: Helper Variables and Functions ---

        // Helper function to check if three points are roughly collinear
        const arePointsCollinear = (p1, p2, p3, threshold = 25) => {
            if (!p1 || !p2 || !p3) return false;
            const dist12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const dist23 = Math.hypot(p2.x - p3.x, p2.y - p3.y);
            const dist13 = Math.hypot(p1.x - p3.x, p1.y - p3.y);
            return Math.abs(dist13 - (dist12 + dist23)) < threshold;
        };

        const shoulderMidpoint = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
        const hipMidpoint = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
        const wristDistance = Math.hypot(leftWrist.x - rightWrist.x, leftWrist.y - rightWrist.y);
        const shoulderToHipDist = Math.hypot(shoulderMidpoint.x - hipMidpoint.x, shoulderMidpoint.y - hipMidpoint.y);

        // --- Action Recognition Logic (Ordered by Specificity) ---

        // Category 1: Gestures & Poses
        const isTPose = arePointsCollinear(leftShoulder, leftElbow, leftWrist) && arePointsCollinear(rightShoulder, rightElbow, rightWrist) && Math.abs(leftShoulder.y - leftElbow.y) < 30 && Math.abs(rightShoulder.y - rightElbow.y) < 30;
        if (isTPose) return "t_pose";

        const isCrossedArms = (Math.hypot(leftWrist.x - rightElbow.x, leftWrist.y - rightElbow.y) < 100) && (Math.hypot(rightWrist.x - leftElbow.x, rightWrist.y - leftElbow.y) < 100);
        if (isCrossedArms) return "crossed_arms";

        const isVictoryPose = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y && leftWrist.x < leftShoulder.x && rightWrist.x > rightShoulder.x;
        if (isVictoryPose) return "victory_pose";

        const isHandsUp = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
        if (isHandsUp) return "hands_up";

        const isWavingRight = rightWrist.y < rightElbow.y && Math.abs(rightElbow.y - rightShoulder.y) < 50;
        if (isWavingRight) return "waving_right";

        const isWavingLeft = leftWrist.y < leftElbow.y && Math.abs(leftElbow.y - leftShoulder.y) < 50;
        if (isWavingLeft) return "waving_left";

        const isPunchingRight = arePointsCollinear(rightShoulder, rightElbow, rightWrist) && Math.abs(rightShoulder.y - rightWrist.y) < 40;
        if (isPunchingRight) return "punching_right";

        const isPunchingLeft = arePointsCollinear(leftShoulder, leftElbow, leftWrist) && Math.abs(leftShoulder.y - leftWrist.y) < 40;
        if (isPunchingLeft) return "punching_left";

        const isPointingRight = arePointsCollinear(rightShoulder, rightElbow, rightWrist) && rightWrist.y < (rightHip.y + 100);
        if (isPointingRight) return "pointing_right";

        const isPointingLeft = arePointsCollinear(leftShoulder, leftElbow, leftWrist) && leftWrist.y < (leftHip.y + 100);
        if (isPointingLeft) return "pointing_left";

        const isClapping = wristDistance < 80 && leftWrist.y > shoulderMidpoint.y && rightWrist.y > shoulderMidpoint.y;
        if (isClapping) return "clapping";

        const isThumbsUpRight = rightWrist.y < rightElbow.y && rightElbow.y > rightShoulder.y;
        if (isThumbsUpRight) return "thumbs_up_right";

        const isThumbsUpLeft = leftWrist.y < leftElbow.y && leftElbow.y > leftShoulder.y;
        if (isThumbsUpLeft) return "thumbs_up_left";

        // Category 2: Daily Works & Tasks
        const isDrinkingRight = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y) < 60 && nose.y < rightShoulder.y;
        if (isDrinkingRight) return "drinking_right_hand";

        const isDrinkingLeft = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y) < 60 && nose.y < leftShoulder.y;
        if (isDrinkingLeft) return "drinking_left_hand";

        const isBrushingTeethRight = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y) < 80;
        if (isBrushingTeethRight) return "brushing_teeth_right";

        const isBrushingTeethLeft = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y) < 80;
        if (isBrushingTeethLeft) return "brushing_teeth_left";

        const isCombingHairRight = rightWrist.y < nose.y;
        if (isCombingHairRight) return "combing_hair_right";

        const isCombingHairLeft = leftWrist.y < nose.y;
        if (isCombingHairLeft) return "combing_hair_left";

        const isTyping = wristDistance < 150 && Math.abs(leftWrist.y - hipMidpoint.y) < 100 && Math.abs(rightWrist.y - hipMidpoint.y) < 100;
        if (isTyping) return "typing_on_keyboard";

        const isReadingBook = wristDistance < 120 && leftWrist.y > shoulderMidpoint.y && leftWrist.y < hipMidpoint.y && nose.y > shoulderMidpoint.y;
        if (isReadingBook) return "reading_a_book";

        // Category 3: Sports & Exercise
        const isDownwardDog = hipMidpoint.y < shoulderMidpoint.y && shoulderMidpoint.y < leftAnkle.y && shoulderMidpoint.y < rightAnkle.y && arePointsCollinear(leftWrist, leftElbow, leftShoulder) && arePointsCollinear(leftAnkle, leftKnee, leftHip);
        if (isDownwardDog) return "yoga_downward_dog";

        const isSquatting = leftHip.y > leftKnee.y && rightHip.y > rightKnee.y;
        if (isSquatting) return "squatting";

        const isJumping = leftAnkle.y < leftKnee.y && rightAnkle.y < rightKnee.y;
        if (isJumping) return "jumping";

        const isKickingRight = arePointsCollinear(rightHip, rightKnee, rightAnkle);
        if (isKickingRight) return "kicking_right_leg";

        const isKickingLeft = arePointsCollinear(leftHip, leftKnee, leftAnkle);
        if (isKickingLeft) return "kicking_left_leg";

        const isStretchingUp = leftWrist.y < nose.y && rightWrist.y < nose.y && arePointsCollinear(leftShoulder, leftElbow, leftWrist) && arePointsCollinear(rightShoulder, rightElbow, rightWrist);
        if (isStretchingUp) return "stretching_arms_up";

        const isSideBendRight = nose.x > hipMidpoint.x + (shoulderToHipDist * 0.2) && rightWrist.y < shoulderMidpoint.y;
        if (isSideBendRight) return "stretching_side_bend_right";

        const isSideBendLeft = nose.x < hipMidpoint.x - (shoulderToHipDist * 0.2) && leftWrist.y < shoulderMidpoint.y;
        if (isSideBendLeft) return "stretching_side_bend_left";

        const isBoxingStance = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y) < 150 && Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y) < 150;
        if (isBoxingStance) return "boxing_stance";

        // Category 4-8 & Other Actions
        const isSaluting = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y) < 80 && arePointsCollinear(rightElbow, rightShoulder, leftShoulder) === false;
        if (isSaluting) return "saluting";

        const isFacepalmRight = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y) < 50 && nose.y > shoulderMidpoint.y;
        if (isFacepalmRight) return "facepalm_right";

        const isFacepalmLeft = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y) < 50 && nose.y > shoulderMidpoint.y;
        if (isFacepalmLeft) return "facepalm_left";

        const isSitting = hipMidpoint.y > (shoulderMidpoint.y + shoulderToHipDist * 0.5) && leftKnee.y < leftAnkle.y && rightKnee.y < rightAnkle.y;
        if (isSitting) return "sitting";

        const isLeaningLeft = shoulderMidpoint.x < hipMidpoint.x - (shoulderToHipDist * 0.2);
        if (isLeaningLeft) return "leaning_left";

        const isLeaningRight = shoulderMidpoint.x > hipMidpoint.x + (shoulderToHipDist * 0.2);
        if (isLeaningRight) return "leaning_right";

        const isWalking = (leftKnee.y > rightKnee.y && rightWrist.y > leftWrist.y) || (rightKnee.y > leftKnee.y && leftWrist.y > rightWrist.y);
        if (isWalking) return "walking";

        // --- Fallback Action ---
        // If no other specific action is detected, assume the user is standing.
        return "standing";
    }
}
