import React from "react";
import {StyleSheet} from "react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {fireEvent, screen} from "@testing-library/react-native";

import GrindTool from "@/components/GrindTool";
import PourTool from "@/components/PourTool";
import ToolHeroStage from "@/components/ToolHeroStage";
import ToolParameterDeck from "@/components/ToolParameterDeck";
import {
    INLINE_MIN_SCROLL_HEIGHT, inlineFieldsMaxHeight, MachineToolActions
} from "@/components/MachineControlReadout";
import {mix, palette, onBrand, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {DEFAULT_APPEARANCE, THEME_IDS} from "@/library/appearance";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

describe("ToolHeroStage", () => {
    it("renders full variant with 1.5px brand rim, white value, brand unit, and zero sheen", async () => {
        await renderWithProviders(
            <ToolHeroStage
                tool="pour"
                phase="running"
                variant="full"
                kicker="DISPENSED"
                value={64}
                unit="ml"
                subLeft="TARGET 150 ML"
                subRight="CUP 62.1 G"
                vessel={{targetMl: 150, dispensedMl: 64, active: true}}
            />
        );
        const stage = screen.getByTestId("tool-hero-stage");
        expect(stage).toHaveStyle({
            backgroundColor: palette.surface,
            borderColor: palette.brand,
            borderWidth: 1.5
        });
        expect(screen.queryByTestId("hero-sheen")).toBeNull();
        expect(screen.getByLabelText("DISPENSED: 64 ml")).toBeTruthy();
        expect(screen.getByText("POURING")).toBeTruthy();
        expect(screen.getByTestId("pour-vessel-meter", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getByTestId("tool-cadence-strip", {includeHiddenElements: true})).toBeTruthy();
    });

    it("renders inline variant in toned-down green status tones without outer glow", async () => {
        await renderWithProviders(
            <ToolHeroStage
                tool="grind"
                phase="ready"
                variant="inline"
                kicker="SELECTED SIZE"
                value={48}
                subLeft="RPM 90"
                burr={{running: false, rpm: 90, animationEnabled: true}}
            />
        );
        const stage = screen.getByTestId("tool-hero-stage");
        expect(stage).toHaveStyle({
            backgroundColor: palette.raised,
            borderWidth: 1
        });
        expect(stage.props.style).not.toMatchObject({borderColor: palette.brand});
        expect(screen.getByTestId("grind-burr-matrix", {includeHiddenElements: true})).toBeTruthy();
    });

    it("draws scale sparkline bars only when two or more genuine readings exist", async () => {
        const view = await renderWithProviders(
            <ToolHeroStage
                tool="scale"
                phase="ready"
                variant="full"
                kicker="LIVE WEIGHT"
                value="18.4"
                unit="g"
                subLeft="0.1 G PRECISION"
                subRight="GRAMS"
                scaleSamples={[18.4]}
            />
        );
        expect(screen.queryByTestId("scale-spark-bars", {includeHiddenElements: true})).toBeNull();
        expect(screen.getByTestId("scale-spark-baseline", {includeHiddenElements: true})).toBeTruthy();

        await view.rerender(
            <ToolHeroStage
                tool="scale"
                phase="ready"
                variant="full"
                kicker="LIVE WEIGHT"
                value="18.6"
                unit="g"
                subLeft="0.1 G PRECISION"
                subRight="GRAMS"
                scaleSamples={[18.4, 18.6]}
            />
        );
        expect(screen.getByTestId("scale-spark-bars", {includeHiddenElements: true})).toBeTruthy();
    });
});

describe("ToolParameterDeck", () => {
    it("keeps stepper and segment rows rendered and dimmed during entering without plain-text flash", async () => {
        await renderWithProviders(
            <ToolParameterDeck
                variant="full"
                phase="entering"
                tool="pour"
                pourRequest={{mode: "target", volumeMl: 150, flowMlPerSecond: 3, temperatureC: 93, pattern: "centered"}}
                pourPolicy={{
                    modes: ["target", "continuous"],
                    volumeMl: {min: 20, max: 350, step: 10},
                    flowMlPerSecond: {min: 1, max: 5, step: 0.5},
                    temperatureC: {min: 40, max: 98, step: 1},
                    patterns: ["centered", "circular", "spiral"]
                }}
                onGrindChange={jest.fn()}
                onPourChange={jest.fn()}
                onModeChange={jest.fn()}
                onStart={jest.fn()}
            />
        );
        const deck = screen.getByTestId("tool-parameter-deck");
        expect(deck).toHaveStyle({opacity: 0.55});
        expect(screen.getByRole("button", {name: "Target"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Until stopped"})).toBeDisabled();
        expect(screen.getByLabelText("Target volume: 150 ml")).toBeTruthy();
        expect(screen.queryByLabelText("Increase Target volume")).toBeNull();
    });

    it("applies brandFill on full active pills and success fill on inline active pills", async () => {
        const view = await renderWithProviders(
            <ToolParameterDeck
                variant="full"
                phase="ready"
                tool="pour"
                pourRequest={{mode: "target", volumeMl: 150, flowMlPerSecond: 3, temperatureC: 93, pattern: "centered"}}
                pourPolicy={{
                    modes: ["target", "continuous"],
                    volumeMl: {min: 20, max: 350, step: 10},
                    flowMlPerSecond: {min: 1, max: 5, step: 0.5},
                    temperatureC: {min: 40, max: 98, step: 1},
                    patterns: ["centered", "circular", "spiral"]
                }}
                onGrindChange={jest.fn()}
                onPourChange={jest.fn()}
                onModeChange={jest.fn()}
                onStart={jest.fn()}
            />
        );
        expect(screen.getByRole("button", {name: "Target"})).toHaveStyle({backgroundColor: palette.brandFill});

        await view.rerender(
            <ToolParameterDeck
                variant="inline"
                phase="ready"
                tool="pour"
                pourRequest={{mode: "target", volumeMl: 150, flowMlPerSecond: 3, temperatureC: 93, pattern: "centered"}}
                pourPolicy={{
                    modes: ["target", "continuous"],
                    volumeMl: {min: 20, max: 350, step: 10},
                    flowMlPerSecond: {min: 1, max: 5, step: 0.5},
                    temperatureC: {min: 40, max: 98, step: 1},
                    patterns: ["centered", "circular", "spiral"]
                }}
                onGrindChange={jest.fn()}
                onPourChange={jest.fn()}
                onModeChange={jest.fn()}
                onStart={jest.fn()}
            />
        );
        expect(screen.getByRole("button", {name: "Target"})).toHaveStyle({backgroundColor: palette.success});
    });
});

describe("MachineToolActions", () => {
    it("transitions from solid START to solid STOP to outlined STOPPING…", async () => {
        const app = resolveAppearance(DEFAULT_APPEARANCE);
        const view = await renderWithProviders(
            <MachineToolActions tool="pour" variant="full" phase="ready" startDisabled={false} stopUnavailable={null} onStart={jest.fn()} onStop={jest.fn()}/>
        );
        const startBtn = screen.getByRole("button", {name: "START POUR"});
        expect(startBtn).toHaveStyle({backgroundColor: app.palette.brandFill, color: onBrand.text});
        expect(startBtn).toBeEnabled();

        await view.rerender(
            <MachineToolActions tool="pour" variant="full" phase="running" startDisabled={false} stopUnavailable={null} onStart={jest.fn()} onStop={jest.fn()}/>
        );
        const stopBtn = screen.getByRole("button", {name: "STOP POUR"});
        expect(stopBtn).toHaveStyle({backgroundColor: app.palette.danger});
        expect(stopBtn).toBeEnabled();

        await view.rerender(
            <MachineToolActions tool="pour" variant="full" phase="stopping" startDisabled={false} stopUnavailable={null} onStart={jest.fn()} onStop={jest.fn()}/>
        );
        const stoppingBtn = screen.getByRole("button", {name: "STOPPING POUR…"});
        expect(stoppingBtn).toBeDisabled();
        expect(stoppingBtn).toHaveStyle({borderColor: app.palette.danger, borderWidth: 1});
    });

    it("enforces full-vs-inline design spec invariants across all theme presets and exposes status badge to assistive tech", async () => {
        for (const theme of THEME_IDS) {
            const choice = {theme, recipeColours: "original" as const};
            const app = resolveAppearance(choice);
            const fullView = await renderWithProviders(
                <AppearanceScope choice={choice}>
                    <ToolHeroStage
                        tool="grind"
                        phase="running"
                        variant="full"
                        kicker="SELECTED SIZE"
                        value={48}
                        unit="rpm"
                        subLeft="RPM 90"
                        burr={{running: true, rpm: 90, animationEnabled: false}}
                    />
                </AppearanceScope>
            );
            const fullStage = screen.getByTestId("tool-hero-stage");
            expect(fullStage).toHaveStyle({
                backgroundColor: app.palette.surface,
                borderColor: app.palette.brand,
                borderWidth: 1.5
            });
            expect(screen.queryByTestId("hero-sheen")).toBeNull();
            expect(screen.getByText("48")).toHaveStyle({color: app.palette.text});
            expect(screen.getByText("RPM")).toHaveStyle({color: app.palette.brand});
            const badge = screen.getByTestId("tool-status-badge");
            expect(badge).toHaveProp("accessible", true);
            expect(badge).toHaveProp("accessibilityRole", "text");
            expect(badge).toHaveProp("accessibilityLabel", "GRINDING");
            await fullView.unmount();

            const inlineView = await renderWithProviders(
                <AppearanceScope choice={choice}>
                    <ToolHeroStage
                        tool="grind"
                        phase="running"
                        variant="inline"
                        kicker="SELECTED SIZE"
                        value={48}
                        unit="rpm"
                        subLeft="RPM 90"
                        burr={{running: true, rpm: 90, animationEnabled: false}}
                    />
                </AppearanceScope>
            );
            const inlineStage = screen.getByTestId("tool-hero-stage");
            expect(inlineStage).toHaveStyle({
                backgroundColor: app.palette.raised,
                borderColor: mix(app.palette.raised, app.palette.success, 0.42),
                borderWidth: 1
            });
            expect(screen.getByText("48")).toHaveStyle({color: app.palette.text});
            expect(screen.getByText("RPM")).toHaveStyle({color: app.palette.success});
            await inlineView.unmount();
        }
    });

    it("omits BURR CALIBRATED on both full and inline grinder views while preserving RPM telemetry", async () => {
        const grindPolicy = {
            grindSize: {min: 1, max: 80, step: 1},
            rpm: {min: 60, max: 120, step: 10}
        };
        const fullView = await renderWithProviders(
            <GrindTool
                variant="full"
                phase="ready"
                request={{grindSize: 48, rpm: 90}}
                policy={grindPolicy}
                unavailable={null}
                stopUnavailable={null}
                error={null}
                animationEnabled={true}
                onRequestChange={jest.fn()}
                onStart={jest.fn()}
                onStop={jest.fn()}
            />
        );
        expect(screen.getByText("RPM 90")).toBeTruthy();
        expect(screen.queryByText(/BURR CALIBRATED/i)).toBeNull();
        await fullView.unmount();

        await renderWithProviders(
            <GrindTool
                variant="inline"
                phase="ready"
                request={{grindSize: 48, rpm: 90}}
                policy={grindPolicy}
                unavailable={null}
                stopUnavailable={null}
                error={null}
                animationEnabled={true}
                onRequestChange={jest.fn()}
                onStart={jest.fn()}
                onStop={jest.fn()}
            />
        );
        expect(screen.getByText("RPM 90")).toBeTruthy();
        expect(screen.queryByText(/BURR CALIBRATED/i)).toBeNull();
    });

    it("computes inline Pour height from available screen budget and renders accessible-hidden scroll cues", async () => {
        expect(inlineFieldsMaxHeight({frameHeight: 844, topInset: 47, bottomInset: 34})).toBe(487);
        expect(inlineFieldsMaxHeight({frameHeight: 667, topInset: 20, bottomInset: 0})).toBe(371);
        expect(inlineFieldsMaxHeight({frameHeight: 844, topInset: 47, bottomInset: 34, headerChromeHeight: 160})).toBe(413);
        expect(inlineFieldsMaxHeight({frameHeight: 360, topInset: 0, bottomInset: 0})).toBe(INLINE_MIN_SCROLL_HEIGHT);

        await renderWithProviders(
            <SafeAreaProvider initialMetrics={{
                frame: {x: 0, y: 0, width: 375, height: 667},
                insets: {top: 20, right: 0, bottom: 0, left: 0}
            }}>
                <PourTool
                    variant="inline"
                    phase="ready"
                    request={{mode: "target", volumeMl: 150, temperatureC: 90, flowMlPerSecond: 3, pattern: "spiral"}}
                    policy={{
                        temperatureC: {min: 80, max: 95, step: 1},
                        flowMlPerSecond: {min: 2, max: 4, step: 1},
                        volumeMl: {min: 50, max: 200, step: 10},
                        patterns: ["centered", "circular", "spiral"],
                        modes: ["target", "continuous"]
                    }}
                    dispensedMl={null}
                    temperatureC={null}
                    pattern={null}
                    unavailable={null}
                    stopUnavailable={null}
                    error={null}
                    onRequestChange={jest.fn()}
                    onModeChange={jest.fn()}
                    onStart={jest.fn()}
                    onStop={jest.fn()}
                />
            </SafeAreaProvider>
        );
        const scroller = screen.getByTestId("pour-tool-fields");
        expect(StyleSheet.flatten(scroller.props.style).maxHeight).toBe(371);
        expect(scroller.props.showsVerticalScrollIndicator).toBe(true);
        expect(scroller.props.persistentScrollbar).toBe(true);

        const fade = screen.getByTestId("pour-tool-fields-scroll-fade", {includeHiddenElements: true});
        const hint = screen.getByTestId("pour-tool-fields-scroll-hint", {includeHiddenElements: true});
        expect(fade.props.pointerEvents).toBe("none");
        expect(hint.props.pointerEvents).toBe("none");
        expect(hint.props.accessibilityElementsHidden).toBe(true);
        expect(hint.props.importantForAccessibility).toBe("no-hide-descendants");
        expect(screen.getByText("SCROLL", {includeHiddenElements: true})).toBeTruthy();

        await fireEvent(scroller, "layout", {nativeEvent: {layout: {width: 340, height: 371, x: 0, y: 0}}});
        await fireEvent(scroller, "contentSizeChange", 340, 460);
        expect(screen.getByTestId("pour-tool-fields-scroll-hint", {includeHiddenElements: true})).toBeTruthy();
    });
});
