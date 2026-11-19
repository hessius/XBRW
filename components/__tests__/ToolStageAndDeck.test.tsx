import React from "react";
import {screen} from "@testing-library/react-native";

import ToolHeroStage from "@/components/ToolHeroStage";
import ToolParameterDeck from "@/components/ToolParameterDeck";
import {MachineToolActions} from "@/components/MachineControlReadout";
import {palette, onBrand, resolveAppearance} from "@/constants/colors";
import {DEFAULT_APPEARANCE} from "@/library/appearance";
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
                subRight="BURR CALIBRATED"
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
});
