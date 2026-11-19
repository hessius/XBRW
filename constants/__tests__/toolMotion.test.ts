import {DURATION, TOOL_MOTION} from "@/constants/motion";

describe("TOOL_MOTION", () => {
    it("defines positive cadence and dot-matrix timing constants", () => {
        expect(TOOL_MOTION.dotCount).toBe(16);
        expect(TOOL_MOTION.waveStepMs).toBeGreaterThan(0);
        expect(TOOL_MOTION.switchingCycleMs).toBeGreaterThan(0);
        expect(TOOL_MOTION.runningCycleMs).toBeGreaterThan(0);
        expect(TOOL_MOTION.stoppingCycleMs).toBeGreaterThan(0);
        expect(TOOL_MOTION.stoppingCycleMs).toBeLessThan(TOOL_MOTION.runningCycleMs);
        expect(TOOL_MOTION.reducedPulseMs).toBe(DURATION.fast);
    });

    it("defines a damped horizontal head-shake sequence ending cleanly at rest", () => {
        const offsets = TOOL_MOTION.headShakeOffsets;
        expect(TOOL_MOTION.headShakeDurationMs).toBe(420);
        expect(offsets.length).toBeGreaterThanOrEqual(4);
        expect(offsets[0]).not.toBe(0);
        expect(offsets[offsets.length - 1]).toBe(0);
    });
});
