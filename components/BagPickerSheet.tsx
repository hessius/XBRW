import {ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import type {CoffeeBag} from "@/library/coffeeBag";

export type BagPickerProps = {
    open: boolean; onOpenChange: (open: boolean) => void; recipeName: string;
    linked: readonly CoffeeBag[]; selectedId: string | null;
    summaryFor: (bag: CoffeeBag) => string;
    onSelect: (id: string | null) => void; onLinkExisting: () => void; onAdd: () => void;
    mode?: "choose" | "existing" | "inventory";
    all?: readonly CoffeeBag[];
    onEdit?: (bag: CoffeeBag) => void;
    onBack?: () => void;
};

export default function BagPickerSheet({
    open, onOpenChange, recipeName, linked, selectedId, summaryFor, onSelect,
    onLinkExisting, onAdd, mode = "choose", all = [], onEdit, onBack
}: BagPickerProps) {
    const {palette} = useAppearance();
    const rows = (mode === "choose" ? linked : all)
        .filter(bag => mode === "inventory" || bag.finishedAt === undefined);
    function choice(id: string | null, label: string, detail: string) {
        return <XStack key={id ?? "none"} accessible accessibilityRole="radio"
            accessibilityLabel={`${label}, ${detail}`}
            accessibilityState={{checked: selectedId === id}}
            onPress={() => onSelect(id)} minHeight={48} padding="$3"
            gap="$3" alignItems="center" borderBottomWidth={1} borderColor={palette.line}>
            <YStack flex={1}><Text color={palette.text}>{label}</Text>
                <Text fontSize={12} color={palette.dim}>{detail}</Text></YStack>
            <Text accessible={false} color={palette.text}>{selectedId === id ? "*" : ""}</Text>
        </XStack>;
    }
    return <XbrwSheet open={open} onOpenChange={onOpenChange}
        title={mode === "inventory" ? "Your coffee bags" : `Bag for ${recipeName}`} heightPercent={65}>
        <ScrollView keyboardShouldPersistTaps="handled">
            <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$2">
                {mode === "choose" && choice(null, "No bag", "Brew without tracking")}
                {rows.map(bag => mode !== "inventory"
                    ? choice(bag.id, bag.name, summaryFor(bag))
                    : <XStack key={bag.id} minHeight={48} alignItems="center" gap="$3">
                        <YStack flex={1}><Text color={palette.text}>{bag.name}</Text>
                            <Text color={palette.dim} fontSize={12}>
                                {bag.finishedAt !== undefined ? "Finished. " : ""}{summaryFor(bag)}
                            </Text></YStack>
                        <XStack accessible accessibilityRole="button" accessibilityLabel={`Edit ${bag.name}`}
                            onPress={() => onEdit?.(bag)} minHeight={44} padding="$3">
                            <Text color={palette.text}>EDIT</Text>
                        </XStack>
                    </XStack>)}
                {mode === "choose" && <XStack accessible accessibilityRole="button"
                    accessibilityLabel="Use another existing bag" onPress={onLinkExisting}
                    minHeight={48} padding="$3"><Text color={palette.text}>USE ANOTHER EXISTING BAG</Text></XStack>}
                {mode !== "inventory" && <XStack accessible accessibilityRole="button"
                    accessibilityLabel="Add a bag" onPress={onAdd} minHeight={48} padding="$3">
                    <Text color={palette.text}>ADD A BAG</Text></XStack>}
                {mode === "existing" && rows.length === 0
                    && <Text color={palette.dim}>There are no other open bags.</Text>}
                {onBack && mode !== "choose" && <XStack accessible accessibilityRole="button"
                    accessibilityLabel="Back to bag choices" onPress={onBack}
                    minHeight={48} padding="$3"><Text color={palette.text}>BACK</Text></XStack>}
            </YStack>
        </ScrollView>
    </XbrwSheet>;
}
