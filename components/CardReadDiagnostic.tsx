import {useAppearance} from "@/hooks/useAppearance";
import * as Clipboard from "expo-clipboard";
import React from "react";
import {Text, XStack, YStack} from "tamagui";

import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import {notify} from "@/components/XbrwToast";

import {useSetting} from "@/hooks/useSetting";
import {captureToText, parseCapture} from "@/library/cardDiagnostics";
import type {Settings} from "@/library/Settings";

/** One label-and-value line, borrowed from `MachineSection`'s `Vital`. */
function Line({label, value}: {label: string; value: string}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    return (
        <XStack justifyContent="space-between" paddingVertical="$2" paddingHorizontal="$4">
            <Text color={palette.dim} fontSize={13}>{label}</Text>
            <Text color={palette.text} fontSize={13}>{value}</Text>
        </XStack>
    );
}

/**
 * Settings → Labs → Card diagnostics.
 *
 * The evidence half of the bypass-card investigation. A genuine "bypass water"
 * card read to apparent success and then crashed the app, and the raw bytes are
 * the only way to see how its layout differs from what `parseData` assumes. The
 * read path now persists them to `lastCardRead`; this hands them back as text a
 * user can copy out of a phone that has no console.
 *
 * Read-only diagnostics belong with the other Labs tools. Opening the machine
 * console still requires its separate acknowledgement before commands appear.
 */
export default function CardReadDiagnostic({settings}: {settings?: Settings}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const [labsUnlocked] = useSetting("labsUnlocked", settings);
    const [lastCardRead] = useSetting("lastCardRead", settings);

    if (!labsUnlocked) {
        return null;
    }

    const capture = parseCapture(lastCardRead);

    function onCopy() {
        if (capture === null) {
            return;
        }
        void Clipboard.setStringAsync(captureToText(capture)).then(() => notify({
            tone: "success",
            message: "Card read copied"
        }));
    }

    const capacity = capture?.systemInfo === null || capture === null
        ? "unknown"
        : `${capture.systemInfo.blockCount * capture.systemInfo.blockSize} bytes`;

    return (
        <SettingsSection title="Card diagnostics">
            {capture === null ? (
                <YStack paddingVertical="$3" paddingHorizontal="$4">
                    <Text color={palette.dim} fontSize={13}>
                        No card has been read yet.
                    </Text>
                </YStack>
            ) : (
                <YStack paddingVertical="$1">
                    <Line label="Last read" value={capture.at}/>
                    <Line label="Card capacity" value={capacity}/>
                    <Line label="Bytes read" value={`${capture.data.length} bytes`}/>
                </YStack>
            )}

            {capture !== null && (
                <SettingsActionRow
                    label="Copy the raw bytes"
                    detail="Puts the last card read on the clipboard as text."
                    onPress={onCopy}/>
            )}
        </SettingsSection>
    );
}
