import React from "react";
import {StyleSheet} from "react-native";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import MachinePanel from "@/components/MachinePanel";
import PourTool from "@/components/PourTool";
import * as XbrwToast from "@/components/XbrwToast";
import {machineColours, palette} from "@/constants/colors";
import {controlFixture, flushControls, identity, type Planned} from "@/hooks/__tests__/machineControlFixture";
import Machine from "@/library/machine/Machine";
import MachineControls from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {notification, status} from "@/library/machine/__tests__/protocolFixtures";
import {MACHINE_STATE} from "@/library/machine/protocol";
import {renderWithProviders} from "@/test-utils/render";

class QuietRadio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
}

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

    it("expands inline Pour to available vertical space while keeping actions pinned and mounting scroll cues", async () => {
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
        const fields = screen.getByTestId("pour-tool-fields");
        expect(StyleSheet.flatten(fields.props.style).maxHeight).toBe(487);
        expect(fields.props.showsVerticalScrollIndicator).toBe(true);
        expect(screen.getByTestId("pour-tool-fields-scroll-fade", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getByTestId("pour-tool-fields-scroll-hint", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getByRole("button", {name: "START POUR"})).toBeEnabled();
        expect(within(fields).queryByRole("button", {name: "START POUR"})).toBeNull();
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

    it("surfaces Scale error and tool-specific switch block reasons for applying and unknown", async () => {
        const notifySpy = jest.spyOn(XbrwToast, "notify").mockImplementation(jest.fn());
        const s = await controlFixture();
        let pendingTare: Planned | null = null;
        let holdExit = false;
        s.respond((item: Planned) => {
            if (item.command.kind === "tare") {
                pendingTare = item;
                return;
            }
            if (holdExit && item.command.kind === "exit") return;
            s.accept(item);
        });
        await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            controls: s.controls
        });

        await fireEvent.press(screen.getByRole("button", {name: "Scale"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));

        await fireEvent.press(screen.getByRole("button", {name: "Tare"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("applying"));
        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        expect(notifySpy).toHaveBeenCalledWith({tone: "info", message: "Wait for scale tare to finish."});

        await act(async () => { s.feedback(pendingTare!, {kind: "tared"}); });
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));

        holdExit = true;
        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("unknown"));
        expect(s.controls.getSnapshot().tool).toBe("scale");
        const snapshotError = s.controls.getSnapshot().error;
        expect(snapshotError).toBeTruthy();
        expect(screen.getByText(snapshotError!)).toBeTruthy();
        expect(screen.queryByText(/Connection lost/i)).toBeNull();
        expect(screen.queryByRole("button", {name: "Leave screen"})).toBeNull();

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        expect(notifySpy).toHaveBeenCalledWith({tone: "info", message: "Reconcile the machine before switching tools."});

        notifySpy.mockRestore();
        s.controls.dispose();
    });

    it("keeps connected cross-tool unknown on Inspect active tool without Connection lost or Leave screen", async () => {
        const s = await controlFixture();
        await s.controls.open(identity, "grind");
        s.respond((item: Planned) => {
            if (item.command.kind === "grind") s.accept(item);
            else if (item.command.kind === "inspect") s.feedback(item, {kind: "active"});
        });
        await s.controls.startGrind({grindSize: 5, rpm: 150});
        await s.machine.disconnect();
        await s.machine.connect(identity.deviceId);
        await s.controls.recover();
        expect(s.controls.getSnapshot()).toMatchObject({tool: "grind", phase: "unknown"});
        expect(s.controls.isIdentityConnected(identity)).toBe(true);

        await renderWithProviders(
            <MachinePanel
                open
                status="connected"
                accent="#C86A3B"
                vitals={vitals}
                now={4 * 60 * 1000}
                onRefreshWater={pending()}
                onConnect={jest.fn()}
                machineId={identity.deviceId}
                machineSerial={identity.serial}
                machineModel="Studio"
                controls={s.controls}
                inlineTool="scale"
                onInlineToolChange={jest.fn()}
            />
        );

        expect(screen.getByRole("button", {name: "Inspect active tool"})).toBeEnabled();
        expect(screen.queryByText(/Connection lost/i)).toBeNull();
        expect(screen.queryByRole("button", {name: "Leave screen"})).toBeNull();
        s.controls.dispose();
    });

    it("surfaces initial and failed recovery errors plus busy state on connected inline null-tool Reconcile", async () => {
        const s = await controlFixture();
        s.respond(() => {});
        await expect(s.controls.applySetting(identity, "brightness", 3)).rejects.toThrow(/readback|timeout|unknown|missing/i);
        expect(s.controls.getSnapshot()).toMatchObject({tool: null, phase: "unknown"});
        expect(s.controls.isIdentityConnected(identity)).toBe(true);
        const initialError = s.controls.getSnapshot().error!;
        expect(initialError).toBeTruthy();

        await renderWithProviders(
            <MachinePanel
                open
                status="connected"
                accent="#C86A3B"
                vitals={vitals}
                now={4 * 60 * 1000}
                onRefreshWater={pending()}
                onConnect={jest.fn()}
                machineId={identity.deviceId}
                machineSerial={identity.serial}
                machineModel="Studio"
                controls={s.controls}
                inlineTool="grind"
                onInlineToolChange={jest.fn()}
            />
        );

        expect(screen.getAllByText(initialError)).toHaveLength(1);
        expect(screen.getByRole("button", {name: "Reconcile connected machine"})).toBeEnabled();
        expect(screen.queryByText(/Connection lost/i)).toBeNull();
        expect(screen.queryByRole("button", {name: "Leave screen"})).toBeNull();

        await fireEvent.press(screen.getByRole("button", {name: "Reconcile connected machine"}));
        expect(screen.getByRole("button", {name: "Reconcile connected machine"})).toBeDisabled();
        await waitFor(() => expect(screen.getByRole("button", {name: "Reconcile connected machine"})).toBeEnabled());
        const recoveryError = s.controls.getSnapshot().error!;
        expect(recoveryError).toBeTruthy();
        expect(screen.getAllByText(recoveryError)).toHaveLength(1);

        s.respond((item: Planned) => {
            if (item.command.kind === "inspect") {
                s.feedback(item, {
                    kind: "settings",
                    readings: {
                        brightness: 3, temperatureUnit: null, weightUnit: null,
                        waterSource: null, pourRadius: null, vibrationAmplitude: null
                    }
                });
            } else {
                s.accept(item);
            }
        });
        await fireEvent.press(screen.getByRole("button", {name: "Reconcile connected machine"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("closed"));
        s.controls.dispose();
    });

    it("offers inline REFRESH when connected without readings and auto-opens once 40521 arrives", async () => {
        const radio = new QuietRadio();
        radio.infoReply = null;
        const machine = new Machine(radio, {frameGapMs: 0, infoWaitMs: 5});
        machine.installControlRecovery(new ControlRecoveryStore({read: () => "", write: () => {}}));
        await machine.connect(identity.deviceId);
        radio.emit(status(MACHINE_STATE.IDLE));
        const controls = new MachineControls(machine, {
            qualifications: [{
                profile: {
                    id: "inline-refresh",
                    models: ["Studio"],
                    firmwares: ["V12.0D.500"],
                    serials: ["*"],
                    scale: true,
                    grind: {grindSize: {min: 1, max: 80, step: 1}, rpm: {min: 60, max: 120, step: 5}},
                    pour: null,
                    settings: {}
                },
                protocol: {
                    actualWaterSource: () => "tank",
                    plan: (command, tokens) => ({
                        frame: new Uint8Array([0x58, 0x01, 0x01, command.kind === "enter" ? 1 : 2, 0, 12, 0, 0, 0, 1, tokens.session & 0xff, 0]),
                        deadlineMs: 50
                    }),
                    decode: () => null
                }
            }]
        });

        const onRefreshWater = jest.fn(async () => {
            radio.emit(machineInfoFrame({serial: identity.serial, model: "Studio", firmware: "V12.0D.500"}));
            return true;
        });

        const view = await renderWithProviders(
            <MachinePanel
                open
                status="connected"
                accent={palette.success}
                vitals={null}
                now={0}
                onRefreshWater={onRefreshWater}
                onConnect={jest.fn()}
                machineId={identity.deviceId}
                machineSerial={identity.serial}
                controls={controls}
            />
        );

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        expect(screen.getByText(/has not reported its readings yet/i)).toBeTruthy();
        expect(screen.getByLabelText("Refresh the machine readings")).toBeTruthy();

        const openSpy = jest.spyOn(controls, "open").mockResolvedValue(undefined);
        await fireEvent.press(screen.getByTestId("machine-refresh"));
        await view.rerender(
            <MachinePanel
                open
                status="connected"
                accent={palette.success}
                vitals={vitals}
                now={0}
                onRefreshWater={onRefreshWater}
                onConnect={jest.fn()}
                machineId={identity.deviceId}
                machineSerial={identity.serial}
                controls={controls}
            />
        );
        await waitFor(() => expect(openSpy).toHaveBeenCalledWith(identity, "grind", expect.anything()));
        openSpy.mockRestore();
        controls.dispose();
    });

    it("lets disconnected unknown inline workbench collapse via X while retaining unknown state and showing disconnected switch guidance", async () => {
        const notifySpy = jest.spyOn(XbrwToast, "notify").mockImplementation(jest.fn());
        const s = await controlFixture({reconnect: jest.fn()});
        s.respond((item) => s.accept(item));
        const view = await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            controls: s.controls
        });

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));
        await fireEvent.press(screen.getByRole("button", {name: "START GRIND"}));
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("running"));

        await act(async () => {
            s.radio.drop();
            await view.rerender(
                <MachinePanel
                    open
                    status="disconnected"
                    accent={palette.success}
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

        expect(s.controls.getSnapshot().phase).toBe("unknown");
        await fireEvent.press(screen.getByRole("button", {name: "Scale"}));
        expect(notifySpy).toHaveBeenCalledWith({
            tone: "info",
            message: "Machine disconnected — reconnect to inspect or close this tool."
        });

        // Disconnected X collapses cleanly while keeping recovery marker & unknown phase
        await fireEvent.press(screen.getByRole("button", {name: "Close inline tool"}));
        expect(screen.queryByTestId("inline-tool-workbench")).toBeNull();
        expect(s.controls.getSnapshot().phase).toBe("unknown");
        expect(s.recovery.snapshot.marker).not.toBeNull();

        notifySpy.mockRestore();
        s.controls.dispose();
    });

    it("surfaces styled ADD WATER guidance and RETRY OPENING TOOL in inline workbench on NO_WATER and opens after refill", async () => {
        const s = await controlFixture();
        s.respond((item) => s.accept(item));
        s.radio.emit(status(MACHINE_STATE.NO_WATER));
        await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            vitals: {...vitals, waterEnough: false},
            controls: s.controls
        });

        await fireEvent.press(screen.getByRole("button", {name: "Grind"}));
        await waitFor(() => expect(screen.getByText(/\+WATER.*Refill the water tank/i)).toBeTruthy());
        expect(screen.getByText("ADD WATER")).toBeTruthy();
        expect(screen.getByTestId("inline-tool-error")).toHaveProp("accessibilityRole", "alert");
        const retryBtn = screen.getByRole("button", {name: "Retry opening tool"});
        expect(retryBtn).toBeEnabled();
        expect(screen.getByText("RETRY OPENING TOOL")).toBeTruthy();
        expect(retryBtn).toHaveStyle({borderColor: palette.warn});
        expect(s.planned).toEqual([]);

        await act(async () => {
            s.radio.emit(status(MACHINE_STATE.IDLE));
            await flushControls();
        });
        await fireEvent.press(retryBtn);
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));
        expect(screen.queryByTestId("inline-tool-error")).toBeNull();
        s.controls.dispose();
    });

    it("surfaces inline Pour low-water guidance before enter when tank water is low, and opens after refill", async () => {
        const radio = new QuietRadio();
        const lowBlob = machineInfoFrame({serial: identity.serial, model: "Studio", firmware: "V12.0D.500", waterEnough: 0});
        const okBlob = machineInfoFrame({serial: identity.serial, model: "Studio", firmware: "V12.0D.500", waterEnough: 1});
        radio.infoReply = lowBlob;
        const machine = new Machine(radio, {frameGapMs: 0, infoWaitMs: 5});
        machine.installControlRecovery(new ControlRecoveryStore({read: () => "", write: () => {}}));
        await machine.connect(identity.deviceId);
        radio.emit(status(MACHINE_STATE.IDLE));
        radio.syntheticWrite = frame => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8007) radio.emit(notification(0x47, 0x1F, []));
        };
        const controls = new MachineControls(machine);

        await draw({
            machineId: identity.deviceId,
            machineSerial: identity.serial,
            machineModel: "Studio",
            vitals: {...vitals, waterEnough: false},
            controls
        });

        await fireEvent.press(screen.getByRole("button", {name: "Pour"}));
        await waitFor(() => expect(screen.getByText(/water tank is low.*Refill the water tank/i)).toBeTruthy());
        expect(screen.getByText("ADD WATER")).toBeTruthy();
        expect(radio.sent).not.toContain(8007);

        radio.infoReply = okBlob;
        await fireEvent.press(screen.getByRole("button", {name: "Retry opening tool"}));
        await waitFor(() => expect(controls.getSnapshot().phase).toBe("ready"));
        expect(radio.sent).toContain(8007);
        controls.dispose();
    });
});
