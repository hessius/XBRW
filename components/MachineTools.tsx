import React from "react";
import {Button, XStack} from "tamagui";
import {useAppearance} from "@/hooks/useAppearance";
import router from "@/hooks/steadyRouter";
import type {ToolId} from "@/library/machine/controlModel";

export function machineToolRoute(machineId: string, tool: ToolId) {
    return {pathname: "/machineTool" as const, params: {machineId, tool}};
}

/** Navigation only. Availability and connection belong to the destination. */
export default function MachineTools({machineId}: {machineId: string}) {
    const {palette} = useAppearance();
    return <XStack gap="$2" flexWrap="wrap">
        {(["grind", "scale", "pour"] as const).map(tool =>
            <Button key={tool} accessibilityRole="button"
                backgroundColor={palette.control} color={palette.text}
                minHeight={44} flex={1}
                onPress={() => router.push(machineToolRoute(machineId, tool))}>
                {tool === "grind" ? "Grind" : tool === "scale" ? "Scale" : "Pour"}
            </Button>
        )}
    </XStack>;
}
