/**
 * MIMICA - Action Recognizer
 * Analyzes pose landmarks to classify common actions.
 */
export class ActionRecognizer {
    constructor() {
        // Thresholds can be tuned for better accuracy
        this.SITTING_HIP_KNEE_THRESHOLD = 20; // How much lower hips must be than knees to be "sitting"
        this.PICKING_HAND_HIP_THRESHOLD = 50; // How much lower a hand must be than a hip for "picking"
        this.KICKING_KNEE_HIP_THRESHOLD = 40; // How much higher a knee must be than a hip for "kicking"
    }

    // Helper to safely get a point
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

        const leftHip = this.getPoint(pose, 23);
        const rightHip = this.getPoint(pose, 24);
        const leftKnee = this.getPoint(pose, 25);
        const rightKnee = this.getPoint(pose, 26);
        const leftWrist = this.getPoint(pose, 15);
        const rightWrist = this.getPoint(pose, 16);
        const leftShoulder = this.getPoint(pose, 11);
        const rightShoulder = this.getPoint(pose, 12);
        
        // Ensure all required keypoints are visible
        if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftWrist || !rightWrist || !leftShoulder || !rightShoulder) {
            return "unknown";
        }

        // Action classification logic (order matters: from most specific to most general)

        // 1. Sitting: Check if hips are significantly lower than knees.
        const isSitting = (leftHip.y > leftKnee.y + this.SITTING_HIP_KNEE_THRESHOLD) && 
                          (rightHip.y > rightKnee.y + this.SITTING_HIP_KNEE_THRESHOLD);
        if (isSitting) {
            return "sitting";
        }

        // 2. Kicking: Check if one knee is raised high.
        const isKickingLeft = leftKnee.y < leftHip.y - this.KICKING_KNEE_HIP_THRESHOLD;
        const isKickingRight = rightKnee.y < rightHip.y - this.KICKING_KNEE_HIP_THRESHOLD;
        if (isKickingLeft) return "kicking_left";
        if (isKickingRight) return "kicking_right";

        // 3. Picking: Check if a hand is reaching down below the hips.
        const isPickingLeft = leftWrist.y > leftHip.y + this.PICKING_HAND_HIP_THRESHOLD;
        const isPickingRight = rightWrist.y > rightHip.y + this.PICKING_HAND_HIP_THRESHOLD;
        if (isPickingLeft) return "picking_left";
        if (isPickingRight) return "picking_right";
        
        // 4. Turning: A simple check based on shoulder width. If shoulders are close, user is likely turned sideways.
        const shoulderDist = Math.abs(leftShoulder.x - rightShoulder.x);
        const hipDist = Math.abs(leftHip.x - rightHip.x);
        if (shoulderDist < hipDist * 0.6) { // Heuristic: shoulder width is much less than hip width
             return "turned_sideways";
        }

        // 5. Default action: If none of the above, assume standing.
        return "standing";
    }
}
