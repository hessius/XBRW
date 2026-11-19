import React from "react";
import {StyleSheet} from "react-native";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import MachinePanel from "@/components/MachinePanel";
import PourTool from "@/components/PourTool";
import * as XbrwToast from "@/components/XbrwToast";
import {machineColours, palette} from "@/constants/colors";
import {controlFixture, flushControls, identity, type Planned} from "@/hooks/__tests__/machineControlFixture";
import {renderWithProviders} from "@/test-utils/render";

const vitals = {
    waterEnough: true, waterFeed: "tank" as const,
    mode: "PRO" as const, grindSize: 62, askedAt: 0
};
/**
 * A request that never settles, so the control stays in its asking state for
 * the duration of the test. The hook is driven by the promise now, so a mock
 * returning undefined would have nothing to await.
 */
function pending() {
    return jest.fn(() => new Promise<boolean>(() => undefined));
}

const someVitals = {
    waterEnough: true, waterFeed: "tank" as const,
    mode: "PRO" as const, grindSize: 62, askedAt: 1000
};

async function draw(props: Partial<React.ComponentProps<typeof MachinePanel>> = {}) {
    return renderWithProviders(
        <MachinePanel
            open
            status="connected"
            accent="#C86A3B"
            vitals={vitals}
            now={4 * 60 * 1000}
            onRefreshWater={pending()}
            onConnect={jest.fn()}
            {...props}
        />
    );
}

describe("MachinePanel", () => {
    it("shows water and mode without grind size", async () => {
        const {getByText, queryByText} = await draw();
        expect(getByText("WATER")).toBeTruthy();
        expect(getByText("PRO")).toBeTruthy();
        expect(queryByText("GRIND")).toBeNull();
    });

    it("draws EASY in warn, because it will refuse a brew", async () => {
        // DotMatrixText puts color in style[0], not as a direct prop.
        const {getByText} = await draw({vitals: {...vitals, mode: "EASY"}});
        const styleArr = getByText("EASY").props.style as {color?: string}[];
        expect(styleArr[0]?.color).toBe(palette.warn);
    });

    it("ages the water reading", async () => {
        const {getByText} = await draw();
        expect(getByText("4 MIN AGO")).toBeTruthy();
    });

    it("offers a refresh button with the readings label", async () => {
        const {getByTestId, getByLabelText} = await draw();
        expect(getByTestId("machine-refresh")).toBeTruthy();
        expect(getByLabelText("Refresh the machine readings")).toBeTruthy();
    });

    it("warns when the tank is low, and says what to do", async () => {
        const {getByText} = await draw({vitals: {...vitals, waterEnough: false}});
        expect(getByText("FILL THE TANK, THEN REFRESH")).toBeTruthy();
    });

    it("identifies a tap-fed machine instead of warning about its unused tank", async () => {
        const {getByText, queryByText} = await draw({
            vitals: {...vitals, waterEnough: false, waterFeed: "tap"}
        });

        expect(getByText("PLUMBED")).toBeTruthy();
        expect(queryByText("LOW")).toBeNull();
        expect(queryByText("FILL THE TANK, THEN REFRESH")).toBeNull();
    });

    it("offers TRY NOW only when the machine is not connected", async () => {
        const connected = await draw();
        expect(connected.queryByLabelText("Try now")).toBeNull();
        const away = await draw({status: "disconnected", vitals: null});
        expect(away.getByLabelText("Try now")).toBeTruthy();
        const idle = await draw({status: "idle", vitals: null});
        expect(idle.getByLabelText("Try now")).toBeTruthy();
    });

    it("says it will reconnect by itself when out of range", async () => {
        const {getByText} = await draw({status: "disconnected", vitals: null});
        expect(getByText(/reconnect by itself/i)).toBeTruthy();
    });

    it("says not connected — without claiming out of range — when idle", async () => {
        // Idle means no attempt has been made. We do not know whether the
        // machine is nearby, so "not in range" would be false.
        const {getByText, queryByText} = await draw({status: "idle", vitals: null});
        expect(getByText("Not connected. Tap TRY NOW to connect.")).toBeTruthy();
        expect(queryByText(/reconnect by itself/i)).toBeNull();
        expect(queryByText(/not in range/i)).toBeNull();
    });

    it("shows last-seen age when the machine has gone away but had answered (task 2)", async () => {
        // This branch was previously unreachable because the disconnect handler
        // cleared vitals to null — the same code path that made the "last seen"
        // copy unrenderable.  With vitals preserved on disconnect, the age can
        // now appear.
        const {getByText, queryByText} = await draw({
            status: "disconnected",
            vitals:  {...vitals, askedAt: 5 * 60 * 1000},
            now:     10 * 60 * 1000
        });
        expect(getByText(/last seen/i)).toBeTruthy();
        expect(getByText(/5 min ago/i)).toBeTruthy();
        // The full vitals panel must not appear — the machine is away.
        expect(queryByText("WATER")).toBeNull();
    });

    it("has no machine settings button", async () => {
        const {queryByLabelText} = await draw();
        expect(queryByLabelText(/machine settings/i)).toBeNull();
    });

    it("shows nothing when closed", async () => {
        const {queryByText} = await draw({open: false});
        expect(queryByText("WATER")).toBeNull();
        expect(queryByText("OK")).toBeNull();
    });

    it("shows content when open", async () => {
        const {getByText} = await draw({open: true});
        expect(getByText("WATER")).toBeTruthy();
    });

    it("shows nothing but the state while connecting", async () => {
        const {queryByText} = await draw({status: "connecting", vitals: null});
        expect(queryByText("WATER")).toBeNull();
    });

    it("offers a refresh button, not a twelve-point icon", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        const button = r.getByTestId("machine-refresh");
        expect(button.props.accessibilityRole).toBe("button");
        const style = StyleSheet.flatten(button.props.style) as {minHeight?: number};
        expect(style.minHeight).toBeGreaterThanOrEqual(44);
    });

    it("says REFRESH when it is not doing anything", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        expect(r.getByTestId("machine-refresh-label").props.children).toBe("REFRESH");
    });

    it("says so while it is asking", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        await fireEvent.press(r.getByTestId("machine-refresh"));

        expect(r.getByTestId("machine-refresh-label").props.children)
            .toBe("CHECKING…");
    });

    it("asks the machine when pressed", async () => {
        const onRefreshWater = pending();
        const r = await draw({status: "connected", vitals: someVitals, onRefreshWater});

        await fireEvent.press(r.getByTestId("machine-refresh"));

        expect(onRefreshWater).toHaveBeenCalledTimes(1);
    });

    it("will not ask twice while it is already asking", async () => {
        const onRefreshWater = pending();
        const r = await draw({status: "connected", vitals: someVitals, onRefreshWater});

        await fireEvent.press(r.getByTestId("machine-refresh"));
        await fireEvent.press(r.getByTestId("machine-refresh"));

        expect(onRefreshWater).toHaveBeenCalledTimes(1);
    });

    it("is not a sheet", async () => {
        const r = await draw({open: true, status: "connected", vitals: someVitals});

        expect(r.queryByLabelText("Close")).toBeNull();
    });

    it("shows nothing at all when closed", async () => {
        const r = await draw({open: false, status: "connected", vitals: someVitals,
            machineId: "HOME", onEasyMode: jest.fn()});

        expect(r.queryByTestId("machine-refresh")).toBeNull();
        expect(r.queryByRole("button", {name: "Grind"})).toBeNull();
        expect(r.queryByRole("button", {name: "Machine settings and tools"})).toBeNull();
        expect(r.queryByRole("button", {name: "Easy Mode slots"})).toBeNull();
    });

    it("keeps Refresh and Easy Mode, offers no tools without a saved id, and omits the redundant machine settings button", async () => {
        const onEasyMode = jest.fn();
        const r = await draw({onEasyMode});
        expect(r.getByLabelText("Refresh the machine readings")).toBeTruthy();
        expect(r.queryByRole("button", {name: "Grind"})).toBeNull();
        expect(r.queryByRole("button", {name: "Machine settings and tools"})).toBeNull();
        await fireEvent.press(r.getByLabelText("Easy Mode slots"));
        expect(onEasyMode).toHaveBeenCalledTimes(1);
    });

    it("styles tool launchers to match the panel button design", async () => {
        const r = await draw({machineId: "HOME", accent: "#2ECC71"});

        // Tools row
        const grind = r.getByRole("button", {name: "Grind"});
        const scale = r.getByRole("button", {name: "Scale"});
        const pour = r.getByRole("button", {name: "Pour"});
        expect(grind).toBeTruthy();
        expect(scale).toBeTruthy();
        expect(pour).toBeTruthy();

        expect(r.getByTestId("machine-tool-grind")).toHaveStyle({
            borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
            borderTopColor: "#2ECC71", borderBottomColor: "#2ECC71",
            borderLeftColor: "#2ECC71", borderRightColor: "#2ECC71",
            minHeight: 44
        });

        // Check DotMatrixText content
        expect(within(grind).getByText("GRIND")).toBeTruthy();
        expect(within(scale).getByText("SCALE")).toBeTruthy();
        expect(within(pour).getByText("POUR")).toBeTruthy();
        expect(r.queryByTestId("machine-settings-entry")).toBeNull();
    });

    it("disables Grind, Scale and Pour tools when disconnected", async () => {
        const disconnected = await draw({machineId: "HOME", status: "disconnected", vitals: null});
        expect(disconnected.getByRole("button", {name: "Grind"})).toBeDisabled();
        expect(disconnected.getByRole("button", {name: "Scale"})).toBeDisabled();
        expect(disconnected.getByRole("button", {name: "Pour"})).toBeDisabled();

        const connected = await draw({machineId: "HOME", status: "connected"});
        expect(connected.getByRole("button", {name: "Grind"})).toBeEnabled();
        expect(connected.getByRole("button", {name: "Scale"})).toBeEnabled();
        expect(connected.getByRole("button", {name: "Pour"})).toBeEnabled();
    });

    it("reads the water level large enough to glance at", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        // DotMatrixText delivers fontSize through style, not as a host prop
        // (it is the app-wide floor enforcement point), so read the rendered
        // size off the flattened style rather than props.fontSize.
        const style = StyleSheet.flatten(
            r.getByTestId("machine-water-value").props.style
        ) as {fontSize?: number};
        expect(style.fontSize).toBe(18);
    });

    it("says so when it is connected but has not heard any readings yet", async () => {
        // The panel used to branch on `connected && vitals !== null` and let
        // everything else fall to a final else whose copy is "Not in range".
        // A machine that is connected but whose info blob has not arrived
        // landed there and was described as out of range, while the header dot
        // two rows up was green -- and its TRY NOW called onConnect, which has
        // nothing to do when we are already connected, so it did nothing.
        const {queryByText, queryByLabelText, getByLabelText} =
            await draw({status: "connected", vitals: null});

        expect(queryByText(/Not in range/)).toBeNull();
        expect(queryByLabelText("Try now")).toBeNull();
        expect(getByLabelText("Refresh the machine readings")).toBeTruthy();
    });

    it("leaves room beneath the last reading", async () => {
        // Device testing found the panel looked clipped: $2 is seven points,
        // which is not enough to separate the last row from the edge of the
        // header. 18 is $4; pinned as a literal so that shrinking the token in
        // the source cannot make this assertion agree with itself.
        const {getByTestId} = await draw();
        const style = StyleSheet.flatten(getByTestId("machine-panel").props.style);

        expect(style.paddingBottom).toBeGreaterThanOrEqual(14);
    });
});

describe("MachinePanel with several machines saved", () => {
    it("says whose readings these are, and opens the picker from there", async () => {
        const onChooseMachine = jest.fn();
        const r = await draw({machineLabel: "Work", onChooseMachine});

        expect(r.getByTestId("machine-choice-label").props.children).toBe("WORK");
        await fireEvent.press(r.getByLabelText(/^Machine, Work/));
        expect(onChooseMachine).toHaveBeenCalled();
    });

    it("names the machine, its model and whether it is linked, before anybody taps", async () => {
        const r = await draw({machineLabel: "Work", machineModel: "Original",
                              onChooseMachine: jest.fn()});

        expect(r.getByTestId("machine-choice-detail").props.children).toBe("ORIGINAL · CONNECTED");
        expect(r.getByLabelText("Machine, Work, original · connected")).toBeTruthy();
        expect(r.getByLabelText("Machine, Work, original · connected").props.accessibilityHint)
            .toBe("Choose another saved machine");
    });

    it("says Selected, not Connected, while the machine it names has no link", async () => {
        const r = await draw({status: "disconnected", vitals: null,
                              machineLabel: "Work", machineModel: "Studio",
                              onChooseMachine: jest.fn()});

        expect(r.getByTestId("machine-choice-detail").props.children).toBe("STUDIO · SELECTED");
    });

    it("draws the machine's colour beside its name", async () => {
        const r = await draw({machineLabel: "Work", machineColour: machineColours[1].ink,
                              onChooseMachine: jest.fn()});

        const dot = r.getByTestId("machine-choice-colour", {includeHiddenElements: true});
        expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe(machineColours[1].ink);
    });

    it("draws no machine row with only one machine, so nothing changes for that user", async () => {
        const r = await draw();

        expect(r.queryByTestId("machine-choice")).toBeNull();
    });
});

describe("MachinePanel inline tool mode", () => {
    it("swaps vitals for toned-down green inline grind workbench, preserves session on expand, and closes idle in background", async () => {
        const s = await controlFixture();
        let exitCount = 0;
        let releaseExit!: () => void;
        s.respond((item: Planned) => {
            if (item.command.kind === "exit") {
                exitCount += 1;
                void new Promise<void>((resolve) => { releaseExit = resolve; }).then(() => s.accept(item));
                return;
            }
            s.accept(item);
        });
        const onExpandTool = jest.fn();

        await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            controls: s.controls,
            onExpandTool
        });

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(screen.getByText(/STUDIO · WATER OK · PRO/)).toBeTruthy());
        expect(screen.queryByText("REFRESH")).toBeNull();
        expect(screen.getByTestId("tool-hero-stage")).toHaveStyle({backgroundColor: palette.raised});

        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));
        expect(screen.getByRole("button", {name: "START GRIND"})).toBeEnabled();

        await fireEvent.press(screen.getByRole("button", {name: "Close inline tool"}));
        expect(screen.getByText("REFRESH")).toBeTruthy();
        expect(exitCount).toBe(1);
        await act(async () => {
            releaseExit();
            await flushControls();
        });
        expect(s.controls.getSnapshot().phase).toBe("closed");

        // Reopen inline and tap Expand -> hands off without emitting exit
        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));
        await fireEvent.press(screen.getByRole("button", {name: "Expand to full screen"}));
        expect(onExpandTool).toHaveBeenCalledWith(identity.deviceId, "grind");
        expect(exitCount).toBe(1);
        s.controls.dispose();
    });

    it("refuses collapsing or switching inline tool during an active run", async () => {
        const notifySpy = jest.spyOn(XbrwToast, "notify").mockImplementation(jest.fn());
        const s = await controlFixture();
        s.respond((item) => s.accept(item));
        await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            controls: s.controls
        });

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));
        await fireEvent.press(screen.getByRole("button", {name: "START GRIND"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("running"));

        await fireEvent.press(screen.getByRole("button", {name: "Close inline tool"}));
        expect(screen.getByRole("button", {name: "STOP GRIND"})).toBeTruthy();
        expect(screen.queryByText("REFRESH")).toBeNull();
        expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({tone: "info"}));

        await fireEvent.press(screen.getByRole("button", {name: "Scale"}));
        expect(s.controls.getSnapshot().tool).toBe("grind");
        expect(notifySpy).toHaveBeenCalledTimes(2);

        notifySpy.mockRestore();
        s.controls.dispose();
    });

    it("keeps inline Pour actions pinned outside the bounded pour parameter scroll view", async () => {
        await renderWithProviders(
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
        );
        expect(screen.getByRole("button", {name: "START POUR"})).toBeEnabled();
        expect(within(screen.getByTestId("pour-tool-fields")).queryByRole("button", {name: "START POUR"})).toBeNull();
    });

    it("keeps inline unknown recovery reachable on disconnect and failed switchback", async () => {
        const notifySpy = jest.spyOn(XbrwToast, "notify").mockImplementation(jest.fn());
        const s = await controlFixture({reconnect: jest.fn()});
        s.respond((item: Planned) => {
            if (item.command.kind === "exit") return;
            s.accept(item);
        });
        const view = await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            controls: s.controls
        });

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));

        await fireEvent.press(screen.getByRole("button", {name: "Scale"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("unknown"));
        expect(s.controls.getSnapshot().tool).toBe("grind");
        expect(screen.getByRole("button", {name: "Grind"})).toHaveProp("accessibilityState", {disabled: false, selected: true});
        expect(screen.getByRole("button", {name: "Reconcile connected machine"})).toBeEnabled();

        // Collapse via X is refused during unknown
        await fireEvent.press(screen.getByRole("button", {name: "Close inline tool"}));
        expect(screen.getByRole("button", {name: "Reconcile connected machine"})).toBeTruthy();

        // Disconnect shows Reconnect + Leave screen even while status is disconnected
        await act(async () => {
            s.radio.drop();
            await view.rerender(
                <MachinePanel
                    open
                    status="disconnected"
                    accent="#C86A3B"
                    vitals={vitals}
                    now={4 * 60 * 1000}
                    onRefreshWater={pending()}
                    onConnect={jest.fn()}
                    machineId={identity.deviceId}
                    machineSerial={identity.serial}
                    machineModel="Studio"
                    controls={s.controls}
                />
            );
        });
        expect(screen.getByRole("button", {name: "Reconnect named machine"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Leave screen"})).toBeEnabled();
        await fireEvent.press(screen.getByRole("button", {name: "Leave screen"}));
        expect(screen.queryByRole("button", {name: "Reconnect named machine"})).toBeNull();

        notifySpy.mockRestore();
        s.controls.dispose();
    });
});
