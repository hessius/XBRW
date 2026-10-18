import React, {useState} from "react";
import {Pressable, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import MachineColourDot from "@/components/MachineColourDot";
import {palette} from "@/constants/colors";

/**
 * Rows with a hairline between each pair, the way `SettingsSection` draws its
 * card. `toArray` drops the `false` a conditional row leaves behind, so a
 * hidden row never leaves a doubled line. Each group in the card starts with a
 * hairline of its own, because it always sits under the header.
 */
function Rows({children}: {children: React.ReactNode}) {
    return (
        <YStack>
            {React.Children.toArray(children).map((row, index) => (
                // Keyed by index, as in `SettingsSection`: every row here is
                // stateless, so a row appearing does not cost a neighbour state.
                <React.Fragment key={index}>
                    <YStack testID="machine-card-divider" height={1} backgroundColor={palette.line}/>
                    {row}
                </React.Fragment>
            ))}
        </YStack>
    );
}

/** The caret beside a heading that opens. Decorative: the button carries the state. */
function Caret({open}: {open: boolean}) {
    return (
        <View style={{transform: [{rotate: open ? "90deg" : "-90deg"}]}}>
            <DotIcon name="back" size={14} color={palette.muted}/>
        </View>
    );
}

type Props = {
    /** The machine's name, as the list shows it. */
    title: string;
    /** Model, place in the order and link, joined with interpuncts. */
    summary: string;
    /**
     * The first machine in the connect order gets the star, with two or more
     * saved. The summary says "Tried 1st" too.
     */
    isDefault: boolean;
    /** The machine's colour ink, as a dot beside its name. Absent with one machine. */
    colour?: string;
    /** The summary turns green while this machine is the one connected. */
    connected: boolean;
    /** The summary turns red while the link has an error to show. Wins over `connected`. */
    failed?: boolean;
    /**
     * Start open. The machine in use does, so its status, any error and the
     * way to fix it are on screen without a tap, as they were before cards.
     */
    initiallyOpen?: boolean;
    testID: string;
    /** Status, connect and model: what somebody opened the card for. */
    children: React.ReactNode;
    /** The machine's own readings, behind a second fold. */
    details: React.ReactNode;
    /** Below the details, so a destructive row is never the first thing under the header. */
    footer: React.ReactNode;
};

/**
 * One saved machine in Settings, which opens in place.
 *
 * The machine in use starts open and the others start closed. Its status line,
 * any error and the Android settings row would otherwise be a tap away, and
 * Connect a tap deeper than it was before there were cards.
 *
 * In place rather than in a sheet because almost everything in it is a tap
 * and a glance: is it connected, connect it, which model is it. A sheet would
 * put a slide and a dismissal around each of those. Naming and reordering do
 * still open the machine's sheet, from a row in here, because a text field
 * inside the long settings scroll would sit under the keyboard.
 *
 * The readings are a second fold inside the first. Serial, firmware, water
 * and grind size are useful when something is wrong and noise the rest of the
 * time.
 *
 * Three `Collapsible`s in a column rather than one inside another. A nested
 * one changes its parent's height while the parent is measuring it, and the
 * parent would clip the details in the middle of their animation.
 */
export default function MachineCard({
    title, summary, isDefault, colour, connected, failed = false, initiallyOpen = false, testID,
    children, details, footer
}: Props) {
    const [open, setOpen] = useState(initiallyOpen);
    const [detailsOpen, setDetailsOpen] = useState(false);

    return (
        <YStack testID={`${testID}-card`} backgroundColor={palette.surface} borderRadius="$5"
                overflow="hidden">
            <Pressable accessibilityRole="button"
                       accessibilityLabel={`${title}, ${summary}`}
                       accessibilityState={{expanded: open}}
                       onPress={() => setOpen(!open)}
                       style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
                <XStack testID={testID} alignItems="center" gap="$3"
                        minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
                    <YStack width={14} alignItems="center">
                        {isDefault && <DotIcon name="favourite" size={14} color={palette.dim}/>}
                    </YStack>
                    <YStack flex={1} gap="$1">
                        <XStack alignItems="center" gap="$2">
                            {colour !== undefined && (
                                <MachineColourDot testID={`${testID}-colour`} colour={colour}/>
                            )}
                            <Text fontSize={16} color={palette.text} numberOfLines={1}
                                  flexShrink={1}>{title}</Text>
                        </XStack>
                        <Text testID={`${testID}-summary`} fontSize={13}
                              color={failed ? palette.danger : connected ? palette.success : palette.dim}>
                            {summary}
                        </Text>
                    </YStack>
                    <Caret open={open}/>
                </XStack>
            </Pressable>

            <Collapsible open={open}>
                <Rows>
                    {children}
                    <Pressable accessibilityRole="button"
                               accessibilityLabel="Details, Serial, firmware, water and grind size"
                               accessibilityState={{expanded: detailsOpen}}
                               onPress={() => setDetailsOpen(!detailsOpen)}
                               style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
                        <XStack testID="machine-card-details-toggle" alignItems="center" gap="$4"
                                minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
                            <YStack flex={1} gap="$1">
                                <Text fontSize={16} color={palette.text}>Details</Text>
                                <Text fontSize={13} color={palette.dim}>
                                    Serial, firmware, water and grind size.
                                </Text>
                            </YStack>
                            <Caret open={detailsOpen}/>
                        </XStack>
                    </Pressable>
                </Rows>
            </Collapsible>

            <Collapsible open={open && detailsOpen}>
                <YStack height={1} backgroundColor={palette.line}/>
                <YStack testID="machine-card-details" paddingVertical="$1">
                    {details}
                </YStack>
            </Collapsible>

            <Collapsible open={open}>
                <Rows>{footer}</Rows>
            </Collapsible>
        </YStack>
    );
}
