import React from "react";
import {Image, Modal, Pressable} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    /** The picture to show, or "" for none (closed). */
    uri: string;
    visible: boolean;
    onClose: () => void;
};

/**
 * A recipe's picture, full screen.
 *
 * The header's thumbnail is 56 points, which is too small to read a bag's
 * label. This shows the whole picture fitted to the screen on a dark
 * backdrop. CLOSE, a tap anywhere, or Android's back all close it.
 *
 * A plain `Modal`, like the BrewMind browser, rather than a sheet: a sheet
 * has a title bar and a drag handle, and the picture wants the whole screen.
 */
export default function PhotoViewer({uri, visible, onClose}: Props) {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible && uri.length > 0} transparent animationType="fade"
               statusBarTranslucent onRequestClose={onClose}>
            <YStack testID="photo-viewer" flex={1} backgroundColor={palette.base}
                    accessibilityViewIsModal>
                <Pressable testID="photo-viewer-backdrop" accessibilityLabel="Close"
                           accessibilityRole="button" onPress={onClose}
                           style={{flex: 1, alignItems: "center", justifyContent: "center",
                                   paddingTop: insets.top + 56, paddingBottom: insets.bottom + 16,
                                   paddingHorizontal: 16}}>
                    <Image testID="photo-viewer-image" source={{uri}}
                           accessibilityLabel="Coffee photo" accessibilityRole="image"
                           resizeMode="contain"
                           style={{width: "100%", height: "100%"}}/>
                </Pressable>
                <XStack position="absolute" top={insets.top + 8} right={16}>
                    <Pressable testID="photo-viewer-close" accessibilityRole="button"
                               accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
                        <YStack backgroundColor={palette.raised} borderRadius="$3"
                                paddingHorizontal="$3" height={40} justifyContent="center">
                            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                                           color={palette.text}>
                                CLOSE
                            </DotMatrixText>
                        </YStack>
                    </Pressable>
                </XStack>
            </YStack>
        </Modal>
    );
}
