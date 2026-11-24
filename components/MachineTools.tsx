import React from "react";
import {Pressable} from "react-native";
import {XStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import {mix} from "@/constants/colors";
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

/** Navigation launcher or inline mode selector. Availability and connection belong to the tool owner. */
export default function MachineTools({
    machineId, accent, disabled = false, activeTool = null, onSelectTool
}: {
    machineId: string;
    accent?: string;
    disabled?: boolean;
    activeTool?: ToolId | null;
    onSelectTool?: (tool: ToolId) => void;
}) {
    const {palette} = useAppearance();
    const defaultColour = disabled ? palette.dim : (accent ?? palette.text);
    const selectedFill = mix(palette.raised, palette.success, 0.14);

    return (
        <XStack gap="$2" flexWrap="wrap">
            {TOOLS.map(({id, label, display}) => {
                const selected = !disabled && activeTool === id;
                const colour = selected ? palette.success : defaultColour;
                const border = selected ? palette.success : defaultColour;
                return (
                    <Pressable
                        key={id}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={activeTool !== null ? {disabled, selected} : {disabled}}
                        disabled={disabled}
                        onPress={disabled ? undefined : () => {
                            if (onSelectTool) onSelectTool(id);
                            else router.push(machineToolRoute(machineId, id));
                        }}
                        style={({pressed}) => ({flex: 1, opacity: disabled ? 0.4 : pressed ? 0.6 : 1})}>
                        <XStack
                            testID={`machine-tool-${id}`}
                            minHeight={44}
                            alignItems="center"
                            justifyContent="center"
                            paddingVertical="$2.5"
                            borderRadius="$4"
                            backgroundColor={selected ? selectedFill : palette.none}
                            borderWidth={1}
                            borderColor={border}
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
                );
            })}
        </XStack>
    );
}
