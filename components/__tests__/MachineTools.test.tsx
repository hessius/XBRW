import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";
import {PixelRatio} from "react-native";

import MachineControlReadout from "@/components/MachineControlReadout";
import GrindActivityBand from "@/components/GrindActivityBand";
import GrindTool, {type GrindToolProps} from "@/components/GrindTool";
import ScaleTool from "@/components/ScaleTool";
import PourTool, {type PourToolProps} from "@/components/PourTool";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

const grind: GrindToolProps = {
    phase: "ready", request: {grindSize: 50, rpm: 80},
    policy: {grindSize: {min: 40, max: 60, step: 1}, rpm: {min: 60, max: 100, step: 10}},
    unavailable: null, stopUnavailable: null, error: null, animationEnabled: false,
    onRequestChange: jest.fn(), onStart: jest.fn(), onStop: jest.fn()
};
const pour: PourToolProps = {
    phase: "ready",
    request: {mode: "target", volumeMl: 150, temperatureC: 90, flowMlPerSecond: 3, pattern: "spiral"},
    policy: {
        temperatureC: {min: 80, max: 95, step: 1},
        flowMlPerSecond: {min: 2, max: 4, step: 1},
        volumeMl: {min: 50, max: 200, step: 10},
        patterns: ["centered", "circular", "spiral"], modes: ["target", "continuous"]
    },
    dispensedMl: null, temperatureC: null, pattern: null,
    pendingTemperatureC: null, pendingPattern: null,
    unavailable: null, stopUnavailable: null, error: null,
    onRequestChange: jest.fn(), onModeChange: jest.fn(), onStart: jest.fn(), onStop: jest.fn()
};

beforeEach(() => jest.clearAllMocks());

it("keeps unavailable distinct from zero and groups the readout without live announcements", async () => {
    const view = await renderWithProviders(<MachineControlReadout label="WEIGHT" value={null} unit="g"/>);
    expect(screen.getByLabelText("WEIGHT: Unavailable")).toBeTruthy();
    await view.rerender(<MachineControlReadout label="WEIGHT" value={0} unit="g"/>);
    expect(screen.getByLabelText("WEIGHT: 0 g")).toHaveProp("accessibilityLiveRegion", "none");
});

it("allows large text to wrap without a fixed-height or clipped number canvas", async () => {
    const scale = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(3);
    try {
        await renderWithProviders(<MachineControlReadout label="DISPENSED" value={123456.78} unit="ml"/>);
        expect(screen.getByLabelText("DISPENSED: 123456.78 ml")).toBeTruthy();
        expect(screen.getByTestId("machine-control-value")).not.toHaveProp("numberOfLines", 1);
        expect(screen.getByTestId("machine-control-readout")).not.toHaveStyle({overflow: "hidden"});
        expect(screen.getByTestId("machine-control-readout")).not.toHaveStyle({height: expect.any(Number)});
    } finally {
        scale.mockRestore();
    }
});

it("tares without optimistically changing a measured weight", async () => {
    const onTare = jest.fn();
    const view = await renderWithProviders(<ScaleTool grams={18.2} unavailable={null} tarePending={false} onTare={onTare}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Tare"}));
    expect(onTare).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("WEIGHT: 18.2 g")).toBeTruthy();
    await view.rerender(<ScaleTool grams={18.2} unavailable={null} tarePending onTare={onTare}/>);
    expect(screen.getByRole("button", {name: "Taring…"})).toBeDisabled();
    expect(screen.getByLabelText("WEIGHT: 18.2 g")).toBeTruthy();
});

it("names an unsupported scale and preserves a real zero", async () => {
    const onTare = jest.fn();
    await renderWithProviders(<ScaleTool grams={0} unavailable="Tare is not qualified for this machine." tarePending={false} onTare={onTare}/>);
    expect(screen.getByLabelText("WEIGHT: 0 g")).toBeTruthy();
    expect(screen.getByText("Tare is not qualified for this machine.")).toBeTruthy();
    expect(screen.getByRole("button", {name: "Tare"})).toBeDisabled();
});

it("does not substitute zero when the scale has no current observation", async () => {
    await renderWithProviders(<ScaleTool grams={null} unavailable="Scale reading is unavailable." tarePending={false} onTare={jest.fn()}/>);
    expect(screen.getByLabelText("WEIGHT: Unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("WEIGHT: 0 g")).toBeNull();
    expect(screen.getByRole("button", {name: "Tare"})).toBeDisabled();
});

it("edits a ready grinder explicitly, and never starts on mount", async () => {
    await renderWithProviders(<GrindTool {...grind}/>);
    expect(grind.onStart).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Increase Grind size"));
    expect(grind.onRequestChange).toHaveBeenCalledWith({grindSize: 51, rpm: 80});
    await fireEvent.press(screen.getByRole("button", {name: "Start"}));
    expect(grind.onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("grind-activity-band")).toBeNull();
});

it.each(["starting", "running", "stopping", "unknown"] as const)("keeps %s grinding readonly and Stop reachable", async (phase) => {
    await renderWithProviders(<GrindTool {...grind} phase={phase} error="Connection uncertain"/>);
    expect(screen.queryByLabelText("Increase Grind size")).toBeNull();
    expect(screen.queryByRole("button", {name: "Start"})).toBeNull();
    expect(screen.getByText(phase === "running" ? "GRINDING" : phase.toUpperCase())).toBeTruthy();
    expect(screen.getByText("Connection uncertain")).toBeTruthy();
    expect(within(screen.getByTestId("grind-tool-fields")).queryByRole("button", {name: "Stop"})).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "Stop"}));
    expect(grind.onStop).toHaveBeenCalledTimes(1);
    expect(Boolean(screen.queryByTestId("grind-activity-band", {includeHiddenElements: true}))).toBe(phase === "running");
});

it("does not invent a grinder request or bounds when unsupported", async () => {
    await renderWithProviders(<GrindTool {...grind} request={null} policy={null} unavailable="Grind is not qualified."/>);
    expect(screen.getByText("Grind is not qualified.")).toBeTruthy();
    expect(screen.queryByLabelText("Increase Grind size")).toBeNull();
    expect(screen.getByRole("button", {name: "Start"})).toBeDisabled();
});

it("blocks an invalid grind selection and names a missing numeric policy", async () => {
    await renderWithProviders(<GrindTool {...grind} policy={{
        grindSize: {min: 40, max: 60, step: 0}, rpm: {min: 60, max: 100, step: 10}
    }}/>);
    expect(screen.getByRole("button", {name: "Start"})).toBeDisabled();
    expect(screen.queryByLabelText("Increase Grind size")).toBeNull();
    expect(screen.getByText("Grind size control is unavailable: no qualified range.")).toBeTruthy();
});

it("renders a static running band when animation is disabled or motion is reduced", async () => {
    const {useReducedMotion} = jest.requireMock("@/constants/motion");
    const view = await renderWithProviders(<GrindActivityBand running rpm={80} animationEnabled={false}/>);
    expect(screen.getByTestId("grind-activity-static", {includeHiddenElements: true})).toBeTruthy();
    useReducedMotion.mockReturnValue(true);
    await view.rerender(<GrindActivityBand running rpm={80} animationEnabled/>);
    expect(screen.getByTestId("grind-activity-static", {includeHiddenElements: true})).toBeTruthy();
    await view.rerender(<GrindActivityBand running={false} rpm={80} animationEnabled/>);
    expect(screen.queryByTestId("grind-activity-band")).toBeNull();
    useReducedMotion.mockReturnValue(false);
});

it("animates only the small band when motion is enabled", async () => {
    await renderWithProviders(<GrindTool {...grind} phase="running" animationEnabled/>);
    expect(screen.getByTestId("grind-activity-animated", {includeHiddenElements: true})).toBeTruthy();
    expect(screen.getByLabelText("SELECTED SIZE: 50")).toBeTruthy();
});

it("shows target before starting and only independent dispensed telemetry during a target pour", async () => {
    const view = await renderWithProviders(<PourTool {...pour}/>);
    expect(screen.getByLabelText("TARGET VOLUME: 150 ml")).toBeTruthy();
    expect(pour.onStart).not.toHaveBeenCalled();
    await view.rerender(<PourTool {...pour} phase="running" dispensedMl={0}/>);
    expect(screen.getByLabelText("DISPENSED: 0 ml")).toBeTruthy();
    expect(screen.queryByLabelText("TARGET VOLUME: 150 ml")).toBeNull();
    expect(screen.queryByLabelText("Increase Flow")).toBeNull();
    expect(screen.queryByRole("button", {name: "Continuous"})).toBeNull();
    await view.rerender(<PourTool {...pour} phase="running" dispensedMl={null}/>);
    expect(screen.getByLabelText("DISPENSED: Unavailable")).toBeTruthy();
});

it("never displays a volume or progress for continuous pour", async () => {
    const {volumeMl: _volume, ...common} = pour.request as Extract<NonNullable<PourToolProps["request"]>, {mode: "target"}>;
    await renderWithProviders(<PourTool {...pour} request={{...common, mode: "continuous"}} phase="running" dispensedMl={42}/>);
    expect(screen.queryByText("DISPENSED")).toBeNull();
    expect(screen.queryByText("TARGET VOLUME")).toBeNull();
    expect(screen.queryByLabelText("Increase Target volume")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
});

it("defaults live controls to unqualified while Stop stays accessible in unknown", async () => {
    await renderWithProviders(<PourTool {...pour} phase="unknown"/>);
    expect(screen.queryByLabelText("Increase Setpoint")).toBeNull();
    expect(screen.getByText("Live temperature control is not qualified.")).toBeTruthy();
    expect(screen.getByText("Live pattern control is not qualified.")).toBeTruthy();
    expect(screen.queryByRole("button", {name: "Start"})).toBeNull();
    expect(screen.getByRole("button", {name: "Stop"})).toBeEnabled();
});

it.each(["starting", "stopping"] as const)("freezes a %s pour without concealing Stop", async (phase) => {
    await renderWithProviders(<PourTool {...pour} phase={phase} dispensedMl={18.2}
        liveTemperature={{qualified: true, onChange: jest.fn(), error: null}}
        livePattern={{qualified: true, onChange: jest.fn(), error: null}}/>);
    expect(screen.getByText(phase.toUpperCase())).toBeTruthy();
    expect(screen.getByLabelText("DISPENSED: 18.2 ml")).toBeTruthy();
    expect(screen.queryByLabelText("Increase Flow")).toBeNull();
    expect(screen.queryByLabelText("Increase Setpoint")).toBeNull();
    expect(screen.queryByRole("button", {name: "Circular"})).toBeNull();
    expect(screen.getByRole("button", {name: "Stop"})).toBeEnabled();
});

it("keeps an unqualified pour unavailable without inventing target or flow values", async () => {
    await renderWithProviders(<PourTool {...pour} request={null} policy={null} unavailable="Pour is not qualified."/>);
    expect(screen.getByText("Pour is not qualified.")).toBeTruthy();
    expect(screen.getByLabelText("Flow: Unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Increase Target volume")).toBeNull();
    expect(screen.getByRole("button", {name: "Start"})).toBeDisabled();
});

it("keeps confirmed and pending live setpoints separate and shows failed mutations without hiding Stop", async () => {
    const onChange = jest.fn();
    const view = await renderWithProviders(<PourTool {...pour} phase="running" temperatureC={90} pattern="spiral"
        pendingTemperatureC={92} pendingPattern="circular"
        liveTemperature={{qualified: true, onChange, error: "Setpoint failed"}}
        livePattern={{qualified: true, onChange: jest.fn(), error: null}}/>);
    expect(screen.getByLabelText("SETPOINT: 90 °C")).toBeTruthy();
    expect(screen.getByText("Pending setpoint: 92 °C")).toBeTruthy();
    expect(screen.getByText("Pending pattern: circular")).toBeTruthy();
    expect(screen.queryByLabelText("Increase Setpoint")).toBeNull();
    expect(screen.getByText("Setpoint failed")).toBeTruthy();
    expect(screen.getByRole("button", {name: "Stop"})).toBeEnabled();
    expect(within(screen.getByTestId("pour-tool-fields")).queryByRole("button", {name: "Stop"})).toBeNull();
    await view.rerender(<PourTool {...pour} phase="running" temperatureC={90} pattern="spiral"
        liveTemperature={{qualified: true, onChange, error: null}}/>);
    await fireEvent.press(screen.getByLabelText("Increase Setpoint"));
    expect(onChange).toHaveBeenCalledWith(91);
});

it("uses the app string pattern mapping and reports a mode choice without inventing target defaults", async () => {
    await renderWithProviders(<PourTool {...pour}/>);
    expect(screen.getAllByLabelText("Spiral pour").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", {name: "Continuous"}));
    expect(pour.onModeChange).toHaveBeenCalledWith("continuous");
    await fireEvent.press(screen.getByRole("button", {name: "Circular"}));
    expect(pour.onRequestChange).toHaveBeenCalledWith({...pour.request, pattern: "circular"});
});
