import React from "react";
import {Text} from "react-native";
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
