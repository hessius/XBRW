import React from "react";
import {Pressable} from "react-native";
import {XStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import {useAppearance} from "@/hooks/useAppearance";
import router from "@/hooks/steadyRouter";
import type {ToolId} from "@/library/machine/controlModel";

export function machineToolRoute(machineId: string, tool: ToolId) {
    return {pathname: "/machineTool" as const, params: {machineId, tool}};
}

const TOOLS: readonly {id: ToolId; label: string; display: string}[] = [
    {id: "grind", label: "Grind", display: "GRIND"},
    {id: "scale", label: "Scale", display: "SCALE"},
    {id: "pour",  label: "Pour",  display: "POUR"},
];

/** Navigation only. Availability and connection belong to the destination. */
export default function MachineTools({
    machineId, accent, disabled = false
}: {
    machineId: string;
    accent?: string;
    disabled?: boolean;
}) {
    const {palette} = useAppearance();
    const colour = disabled ? palette.dim : (accent ?? palette.text);
    return (
        <XStack gap="$2" flexWrap="wrap">
            {TOOLS.map(({id, label, display}) => (
                <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{disabled}}
                    disabled={disabled}
                    onPress={disabled ? undefined : () => router.push(machineToolRoute(machineId, id))}
                    style={({pressed}) => ({flex: 1, opacity: disabled ? 0.4 : pressed ? 0.6 : 1})}>
                    <XStack
                        testID={`machine-tool-${id}`}
                        minHeight={44}
                        alignItems="center"
                        justifyContent="center"
                        paddingVertical="$2.5"
                        borderRadius="$4"
                        borderWidth={1}
                        borderColor={colour}
                        pressStyle={disabled ? undefined : {opacity: 0.6, backgroundColor: palette.raised}}>
                        <DotMatrixText
                            fontSize={11}
                            weight="bold"
                            letterSpacing={2}
                            color={colour}>
                            {display}
                        </DotMatrixText>
                    </XStack>
                </Pressable>
            ))}
        </XStack>
    );
}
