import React from "react";
import type {Insets} from "react-native";
import {Switch} from "tamagui";

import {switchColours, type SwitchGround} from "@/constants/colors";

/**
 * Tamagui's `$3`: 36pt, which Switch draws as a 23 x 46pt track. Every switch
 * in the app was already this size, so pinning it here changes nothing.
 */
const SIZE = "$3";
/** Track height for `SIZE`: Tamagui takes 0.65 of the size token, rounded. */
const TRACK = 23;
/** The outline. Present in both states so the thumb never changes size. */
const RING = 2;
/** The thumb fills the track inside the ring. */
const THUMB = TRACK - RING * 2;

type Props = {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    accessibilityLabel: string;
    accessibilityHint?: string;
    /** Set only by a switch that can be locked, so the others keep reporting `{checked}` alone. */
    disabled?: boolean;
    hitSlop?: Insets;
    /** What the switch is drawn on. Defaults to the dark surfaces. */
    ground?: SwitchGround;
};

/**
 * The app's on/off switch. Every switch goes through here so the two states
 * look the same wherever they appear; `switchColours` says why each colour.
 *
 * The on colours go in `activeStyle`, not in a `backgroundColor` chosen from
 * `checked`. When a Tamagui Switch is on and has no `activeStyle`, it spreads
 * `backgroundColor: "$backgroundActive"` over whatever the caller passed.
 * `$backgroundActive` resolves to nothing in this theme, so the frame's
 * default `$background` shows through, which in the `dark_Switch` sub-theme is
 * `#232323`: a step away from the `#2E2E2E` off track. The `success` fill
 * every call site asked for was never drawn. The thumb takes the same
 * route so both halves change together.
 */
export default function XbrwSwitch({
    checked, onCheckedChange, accessibilityLabel, accessibilityHint, disabled, hitSlop,
    ground = "dark"
}: Props) {
    const {on, off} = switchColours[ground];
    return (
        <Switch accessibilityRole="switch" accessibilityLabel={accessibilityLabel}
                accessibilityHint={accessibilityHint}
                accessibilityState={disabled === undefined ? {checked} : {checked, disabled}}
                checked={checked} onCheckedChange={onCheckedChange}
                disabled={disabled} hitSlop={hitSlop} size={SIZE}
                borderWidth={RING} borderColor={off.ring} backgroundColor={off.track}
                activeStyle={{backgroundColor: on.track, borderColor: on.ring}}>
            <Switch.Thumb width={THUMB} height={THUMB} backgroundColor={off.thumb}
                          activeStyle={{backgroundColor: on.thumb}}/>
        </Switch>
    );
}
