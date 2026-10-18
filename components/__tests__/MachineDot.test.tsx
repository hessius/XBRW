import React from "react";
import {StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {fireEvent, screen, within} from "@testing-library/react-native";

import MachineDot from "@/components/MachineDot";
import {machineColours, palette} from "@/constants/colors";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {renderWithProviders} from "@/test-utils/render";

/**
 * Which glyph a `DotIcon` drew, and in what colour.
 *
 * Not `.props.name`: `testID` lands on a host `View` whose only props are
 * `testID`, `accessible`, `accessibilityElementsHidden`,
 * `importantForAccessibility`, `style` and `children`. The name never reaches
 * the tree. What does reach it is one `dot-icon-dot` per lit cell, so the
 * count identifies the glyph — and the three link glyphs were drawn with 41,
 * 16 and 4 lit cells precisely so they rank. That makes this assertion the
 * design's own claim, checked.
 *
 * `includeHiddenElements` because an unlabelled `DotIcon` sets
 * `accessibilityElementsHidden`, and the default queries skip hidden elements
 * — without it every one of these fails "unable to find an element" rather
 * than on its assertion.
 */
function drawn(testID: string) {
    const icon = screen.getByTestId(testID, {includeHiddenElements: true});
    const dots = within(icon).getAllByTestId("dot-icon-dot",
                                             {includeHiddenElements: true});
    return {cells: dots.length, colour: dots[0].props.style.backgroundColor};
}

function tintOpacity(): number {
    return screen.getByTestId("machine-dot-tint").props.jestAnimatedStyle.value.opacity;
}

describe("MachineDot", () => {
    describe("the shape says the state", () => {
        it.each([
            ["connected", "link-on", palette.success],
            ["connecting", "link-wait", palette.warn],
            // The whole diamond, broken, for all three. The grey says nobody
            // has asked for a machine yet; the faint red says one was asked
            // for and did not answer.
            ["idle", "link-gone", palette.muted],
            ["disconnected", "link-gone", palette.dangerFaint],
            ["failed", "link-gone", palette.dangerFaint]
        ] as const)("draws %s as %s", async (status, icon, colour) => {
            await renderWithProviders(
                <MachineDot status={status} collapsed={false} onPress={() => undefined}/>
            );
            expect(drawn("machine-dot-lit"))
                .toEqual({cells: litCells(DOT_ICONS[icon]).length, colour});
        });

        it("has no ring left to draw", async () => {
            await renderWithProviders(
                <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
            );
            // The ring was compensating for a shape that could not say "present".
            // The filled diamond says it, so the ring is gone rather than restyled.
            expect(screen.queryByTestId("machine-dot-ring",
                                        {includeHiddenElements: true})).toBeNull();
        });
    });

    describe("collapsing", () => {
        it("keeps a desaturated copy underneath to fade to", async () => {
            await renderWithProviders(
                <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
            );
            // Two copies, cross-faded, because Reanimated cannot drive a colour
            // that arrives as a prop. Same reason HomeTitle draws its wordmark
            // twice.
            expect(drawn("machine-dot-dim").colour).toBe(palette.successMuted);
            expect(drawn("machine-dot-lit").colour).toBe(palette.success);
        });

        it("starts collapsed already desaturated, with no animation to watch", async () => {
            await renderWithProviders(
                <MachineDot status="connected" collapsed onPress={() => undefined}/>
            );
            // Mounting into the collapsed state is the header arriving settled,
            // not a transition anybody saw begin.
            expect(tintOpacity()).toBe(0);
        });

        it("is fully lit when expanded", async () => {
            await renderWithProviders(
                <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
            );
            expect(tintOpacity()).toBe(1);
        });

        it("does not bother cross-fading grey to grey", async () => {
            await renderWithProviders(
                <MachineDot status="disconnected" collapsed={false} onPress={() => undefined}/>
            );
            // muted has no twin because it is already grey, so the second copy
            // would be a pixel-identical overdraw on every frame of every scroll.
            expect(screen.queryByTestId("machine-dot-dim",
                                        {includeHiddenElements: true})).toBeNull();
        });

        it("keeps the greyed-out glyph visible when the header collapses", async () => {
            await renderWithProviders(
                <MachineDot status="disconnected" collapsed onPress={() => undefined}/>
            );
            // With no copy underneath to reveal, fading this one out does not
            // desaturate it, it deletes it.
            expect(tintOpacity()).toBe(1);
        });

        it("lands the lit copy exactly on the dim one it is covering", async () => {
            // The dim copy is a flow child, centred by the Pressable. The lit
            // one floats above it, so it has to be centred the same way or it
            // sits in the overlay's top-left corner -- which reads as two
            // indicators at once, and drags the glyph out of line with the
            // toolbar as the header collapses.
            await renderWithProviders(
                <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
            );
            const style = StyleSheet.flatten(
                screen.getByTestId("machine-dot-tint").props.style as StyleProp<ViewStyle>
            );
            expect(style.position).toBe("absolute");
            expect(style.alignItems).toBe("center");
            expect(style.justifyContent).toBe("center");
        });
    });

    it("says which state it is in, for a screen reader", async () => {
        const {getByLabelText} = await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={jest.fn()} />
        );
        expect(getByLabelText("Machine connected")).toBeTruthy();
    });

    it("labels idle as not connected, not not in range — nothing has been tried yet", async () => {
        // "Not in range" would claim we looked and the machine was absent.
        // In the idle state we genuinely do not know; the honest label is
        // "not connected".
        const {getByLabelText} = await renderWithProviders(
            <MachineDot status="idle" collapsed={false} onPress={jest.fn()} />
        );
        expect(getByLabelText("Machine not connected")).toBeTruthy();
    });

    it("labels disconnected and failed as not in range — we know because we tried", async () => {
        for (const status of ["disconnected", "failed"] as const) {
            const {getByLabelText} = await renderWithProviders(
                <MachineDot status={status} collapsed={false} onPress={jest.fn()} />
            );
            expect(getByLabelText("Machine not in range")).toBeTruthy();
        }
    });

    it("opens on a press", async () => {
        const onPress = jest.fn();
        const {getByLabelText} = await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={onPress} />
        );
        await fireEvent.press(getByLabelText("Machine connected"));
        expect(onPress).toHaveBeenCalled();
    });
});

describe("the low-tank warning", () => {
    it("draws no warning copy when the tank is fine", async () => {
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={jest.fn()}/>
        );
        expect(
            screen.queryByTestId("machine-dot-alarm", {includeHiddenElements: true})
        ).toBeNull();
    });

    it("draws an amber copy over the green one when the tank is low", async () => {
        // The machine is connected and working, so the dot settles green. The
        // tank being low is worth one glance before it does, not a permanent
        // colour: nothing is wrong with the link, which is what this dot is for.
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} alarm
                        onPress={jest.fn()}/>
        );

        expect(drawn("machine-dot-alarm").colour).toBe(palette.warn);
        expect(drawn("machine-dot-lit").colour).toBe(palette.success);
    });
});

describe("with several machines saved", () => {
    const work = {name: "Work", colour: machineColours[1]};

    it("draws the connected machine in its own colour, and its stepped-back twin underneath", async () => {
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} machine={work} onPress={jest.fn()}/>
        );
        expect(drawn("machine-dot-lit"))
            .toEqual({cells: litCells(DOT_ICONS["link-on"]).length, colour: machineColours[1].ink});
        expect(drawn("machine-dot-dim").colour).toBe(machineColours[1].muted);
    });

    it.each([
        ["connecting", "link-wait", palette.warn],
        ["idle", "link-gone", palette.muted],
        ["disconnected", "link-gone", palette.dangerFaint]
    ] as const)("keeps %s in its state colour and shape, not the machine's", async (status, icon, colour) => {
        // The colour says which machine; whether it is linked is said by the
        // shape, filled or broken, so it never rests on hue.
        await renderWithProviders(
            <MachineDot status={status} collapsed={false} machine={work} onPress={jest.fn()}/>
        );
        expect(drawn("machine-dot-lit")).toEqual({cells: litCells(DOT_ICONS[icon]).length, colour});
    });

    it.each([
        ["connected", "Connected to Work"],
        ["connecting", "Connecting to Work"],
        ["idle", "Not connected"],
        ["disconnected", "Not connected. Work is not in range"],
        ["failed", "Not connected. Work is not in range"]
    ] as const)("says %s as \"%s\"", async (status, label) => {
        await renderWithProviders(
            <MachineDot status={status} collapsed={false} machine={work} onPress={jest.fn()}/>
        );
        expect(screen.getByLabelText(label)).toBeTruthy();
    });

    it("opens the picker on a hold, and the panel on a tap", async () => {
        const onPress = jest.fn();
        const onLongPress = jest.fn();
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} machine={work}
                        onPress={onPress} onLongPress={onLongPress}/>
        );
        await fireEvent(screen.getByLabelText("Connected to Work"), "longPress");
        expect(onLongPress).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Connected to Work"));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("offers the hold to a screen reader as a named action, with a hint", async () => {
        const onLongPress = jest.fn();
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} machine={work}
                        onPress={jest.fn()} onLongPress={onLongPress}
                        accessibilityHint="Hold to switch machines."
                        longPressActionLabel="Switch machine"/>
        );
        const dot = screen.getByLabelText("Connected to Work");
        expect(dot.props.accessibilityHint).toBe("Hold to switch machines.");
        expect(dot.props.accessibilityActions).toEqual([{name: "longpress", label: "Switch machine"}]);
        await fireEvent(dot, "accessibilityAction", {nativeEvent: {actionName: "longpress"}});
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });
});

describe("with one machine saved", () => {
    it("does on a hold what it does on a tap, and offers no extra action", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={onPress}/>
        );
        const dot = screen.getByLabelText("Machine connected");
        await fireEvent(dot, "longPress");
        expect(onPress).toHaveBeenCalledTimes(1);
        expect(dot.props.accessibilityActions).toBeUndefined();
        expect(drawn("machine-dot-lit").colour).toBe(palette.success);
    });
});
