import {Text, XStack, YStack} from "tamagui";
import {useAppearance} from "@/hooks/useAppearance";

export function SelectedBagRow({label, detail, onPress}: {
    label: string; detail: string; onPress: () => void;
}) {
    const {palette} = useAppearance();
    return <XStack accessible accessibilityRole="button"
        accessibilityLabel={`Bag, ${label}, ${detail}`}
        accessibilityHint="Choose a bag or brew without tracking."
        testID="selected-bag-row" onPress={onPress} minHeight={44}
        paddingVertical="$2" gap="$3" alignItems="center" justifyContent="space-between"
        borderTopWidth={1} borderColor={palette.line}>
        <YStack flex={1} minWidth={0}>
            <Text color={palette.text} fontSize={13}>{label}</Text>
            <Text color={palette.dim} fontSize={12}>{detail}</Text>
        </YStack>
        <Text color={palette.dim} accessible={false}>{">"}</Text>
    </XStack>;
}
