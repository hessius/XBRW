import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import XbrwSwitch from "@/components/XbrwSwitch";
import {switchColours} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

function trackOf(label: string) {
    return StyleSheet.flatten(screen.getByLabelText(label).props.style);
}

describe("XbrwSwitch", () => {
    it("is a switch that reports whether it is on", async () => {
        await renderWithProviders(
            <XbrwSwitch accessibilityLabel="Dot matrix" checked onCheckedChange={() => {}}/>
        );

        const control = screen.getByRole("switch", {name: "Dot matrix"});
        expect(control.props.accessibilityState).toEqual({checked: true});
    });

    it("reports disabled only when the caller can lock it", async () => {
        await renderWithProviders(
            <XbrwSwitch accessibilityLabel="Scale" checked={false} disabled
                        onCheckedChange={() => {}}/>
        );

        expect(screen.getByLabelText("Scale").props.accessibilityState)
            .toEqual({checked: false, disabled: true});
    });

    it("draws the on track in its own colour", async () => {
        // The regression this exists for: Tamagui replaced a checked switch's
        // backgroundColor with the theme's `$backgroundActive`, so on and off
        // came out as two near-identical greys.
        await renderWithProviders(
            <XbrwSwitch accessibilityLabel="On" checked onCheckedChange={() => {}}/>
        );

        const track = trackOf("On");
        expect(track.backgroundColor).toBe(switchColours.dark.on.track);
        expect(track.borderTopColor).toBe(switchColours.dark.on.ring);
    });

    it("draws the off track quiet, with a ring", async () => {
        await renderWithProviders(
            <XbrwSwitch accessibilityLabel="Off" checked={false} onCheckedChange={() => {}}/>
        );

        const track = trackOf("Off");
        expect(track.backgroundColor).toBe(switchColours.dark.off.track);
        expect(track.borderTopColor).toBe(switchColours.dark.off.ring);
        expect(track.borderTopWidth).toBe(2);
    });

    it("takes the accent colours on an accent card", async () => {
        await renderWithProviders(
            <XbrwSwitch accessibilityLabel="Slot" checked ground="accent"
                        onCheckedChange={() => {}}/>
        );

        expect(trackOf("Slot").backgroundColor).toBe(switchColours.accent.on.track);
    });

    it("reports a change", async () => {
        const onCheckedChange = jest.fn();
        await renderWithProviders(
            <XbrwSwitch accessibilityLabel="Flip" checked={false}
                        onCheckedChange={onCheckedChange}/>
        );

        await fireEvent(screen.getByLabelText("Flip"), "checkedChange", true);

        expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
});
