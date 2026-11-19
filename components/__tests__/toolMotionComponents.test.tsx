import React from "react";
import {StyleSheet, Text} from "react-native";
import {screen} from "@testing-library/react-native";

import DotMatrixCadenceStrip from "@/components/DotMatrixCadenceStrip";
import ToolHeadShakeView from "@/components/ToolHeadShakeView";
import {TOOL_MOTION, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

beforeEach(() => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe("DotMatrixCadenceStrip", () => {
    it("renders 16 dot cells with semantic warn/success/danger/resting tones", async () => {
        const view = await renderWithProviders(<DotMatrixCadenceStrip phase="entering"/>);
        expect(screen.getAllByTestId("cadence-dot", {includeHiddenElements: true})).toHaveLength(TOOL_MOTION.dotCount);
        const enteringStyle = screen.getAllByTestId("cadence-dot", {includeHiddenElements: true})[0].props.style;
        expect(JSON.stringify(enteringStyle)).toContain(palette.warn);

        await view.rerender(<DotMatrixCadenceStrip phase="running"/>);
        const runningStyle = screen.getAllByTestId("cadence-dot", {includeHiddenElements: true})[0].props.style;
        expect(JSON.stringify(runningStyle)).toContain(palette.success);

        await view.rerender(<DotMatrixCadenceStrip phase="stopping"/>);
        const stoppingStyle = screen.getAllByTestId("cadence-dot", {includeHiddenElements: true})[0].props.style;
        expect(JSON.stringify(stoppingStyle)).toContain(palette.danger);

        await view.rerender(<DotMatrixCadenceStrip phase="ready"/>);
        const readyStyle = screen.getAllByTestId("cadence-dot", {includeHiddenElements: true})[0].props.style;
        expect(JSON.stringify(readyStyle)).toContain(palette.line);
    });

    it("degrades safely under Reduced Motion without dropping the strip", async () => {
        (useReducedMotion as jest.Mock).mockReturnValue(true);
        await renderWithProviders(<DotMatrixCadenceStrip phase="running"/>);
        expect(screen.getByTestId("tool-cadence-strip", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getAllByTestId("cadence-dot", {includeHiddenElements: true})).toHaveLength(TOOL_MOTION.dotCount);
    });

    it("keeps wrapped trailing dot opacities non-negative and bounded during stopping", async () => {
        // Under stopping (550ms cycle / 45ms step), indices 13..15 exceed one full cycle (phaseShift > 1).
        await renderWithProviders(<DotMatrixCadenceStrip phase="stopping"/>);
        const dots = screen.getAllByTestId("cadence-dot", {includeHiddenElements: true});
        expect(dots).toHaveLength(TOOL_MOTION.dotCount);
        for (const dot of dots) {
            const flat = StyleSheet.flatten(dot.props.style);
            expect(typeof flat.opacity).toBe("number");
            expect(flat.opacity).toBeGreaterThanOrEqual(0);
            expect(flat.opacity).toBeLessThanOrEqual(1);
        }
        // Index 15 has phaseShift = (15 * 45) / 550 > 1; positive modulo keeps its wrapped phase in [0, 1] rather than stalling negative.
        const trailingOpacities = dots.slice(13).map(dot => StyleSheet.flatten(dot.props.style).opacity as number);
        expect(Math.max(...trailingOpacities)).toBeGreaterThan(0.25);
    });
});

describe("ToolHeadShakeView", () => {
    it("renders children cleanly across shake triggers and Reduced Motion", async () => {
        const view = await renderWithProviders(
            <ToolHeadShakeView shakeKey={0} testID="shake-wrap">
                <Text>Guarded</Text>
            </ToolHeadShakeView>
        );
        expect(screen.getByTestId("shake-wrap")).toBeTruthy();
        expect(screen.getByText("Guarded")).toBeTruthy();

        await view.rerender(
            <ToolHeadShakeView shakeKey={1} testID="shake-wrap">
                <Text>Guarded</Text>
            </ToolHeadShakeView>
        );
        expect(screen.getByText("Guarded")).toBeTruthy();

        (useReducedMotion as jest.Mock).mockReturnValue(true);
        await view.rerender(
            <ToolHeadShakeView shakeKey={2} testID="shake-wrap">
                <Text>Guarded</Text>
            </ToolHeadShakeView>
        );
        expect(screen.getByTestId("shake-wrap")).toBeTruthy();
    });
});
