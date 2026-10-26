import React from "react";
import {Pressable} from "react-native";
import {ScrollView, Text, XStack, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {accents, resolveAppearance} from "@/constants/colors";
import {useAppearance} from "@/hooks/useAppearance";
import {THEME_IDS, type AppearanceChoice, type RecipeColourMode, type ThemeId} from "@/library/appearance";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    choice: AppearanceChoice;
    chooseTheme: (theme: ThemeId) => void;
    chooseRecipeColours: (mode: RecipeColourMode) => void;
    solidControlLabels: boolean;
    onSolidControlLabelsChange: (on: boolean) => void;
};

const LABELS: Record<ThemeId, string> = {
    original: "Original Dark", light: "Light", blue: "Offline Blue", magenta: "Magenta"
};

function ChoiceRow({label, selected, onPress, children}: {
    label: string;
    selected: boolean;
    onPress: () => void;
    children?: React.ReactNode;
}) {
    const {palette, selection} = useAppearance();
    return (
        <Pressable accessibilityRole="radio" accessibilityLabel={label}
                   accessibilityState={{checked: selected}} onPress={onPress}
                   style={({pressed}) => ({transform: [{scale: pressed ? 0.98 : 1}]})}>
            <YStack gap="$3" padding="$3" borderRadius="$3"
                    backgroundColor={selected ? selection.fill : palette.raised}>
                <XStack alignItems="center" gap="$3" minHeight={44}>
                    <Text flex={1} flexShrink={1} fontSize={16}
                          color={selected ? selection.ink : palette.text}>{label}</Text>
                    {selected && <Text fontSize={13} color={selection.ink}>Selected</Text>}
                </XStack>
                {children}
            </YStack>
        </Pressable>
    );
}

function ThemeChoice({theme, choice, onPress}: {
    theme: ThemeId;
    choice: AppearanceChoice;
    onPress: () => void;
}) {
    const candidate = resolveAppearance({theme, recipeColours: choice.recipeColours});
    const recipe = candidate.recipe(accents.coffee[0]);
    return (
        <ChoiceRow label={LABELS[theme]} selected={theme === choice.theme} onPress={onPress}>
            <YStack testID={`appearance-preview-${theme}`} padding="$3" gap="$2"
                    borderRadius="$2" backgroundColor={candidate.palette.base}
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text fontSize={13} color={candidate.palette.text}>Library</Text>
                <YStack testID={`appearance-preview-recipe-${theme}`} padding="$3"
                        borderRadius="$2" backgroundColor={recipe.fill}>
                    <Text testID={`appearance-preview-label-${theme}`} fontSize={15}
                          color={candidate.onFill(recipe.fill).text}>Morning recipe</Text>
                </YStack>
            </YStack>
        </ChoiceRow>
    );
}

export default function AppearanceSheet({
    open, onOpenChange, choice, chooseTheme, chooseRecipeColours,
    solidControlLabels, onSolidControlLabelsChange
}: Props) {
    const {palette} = useAppearance();
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Appearance" heightPercent={85}>
            <ScrollView testID="appearance-scroll" flex={1}
                        contentContainerStyle={{paddingBottom: 16}}>
                <YStack gap="$3">
                    <Text fontSize={13} color={palette.dim}>Changes are saved immediately.</Text>
                    {THEME_IDS.map(theme =>
                        <ThemeChoice key={theme} theme={theme} choice={choice}
                                     onPress={() => chooseTheme(theme)}/>)}
                    <Text fontSize={16} color={palette.text}>Recipe colours</Text>
                    <Text fontSize={13} color={palette.dim}>
                        Keep original recipe colours or match them to your appearance.
                    </Text>
                    {(["original", "themed"] as const).map(mode =>
                        <ChoiceRow key={mode} label={mode === "original" ? "Original" : "Themed"}
                                   selected={choice.recipeColours === mode}
                                   onPress={() => chooseRecipeColours(mode)}/>)}
                    <SettingsToggleRow label="Solid button labels"
                                       description="Use solid lettering on filled buttons and selected controls. Off keeps the dotted labels."
                                       value={solidControlLabels}
                                       onChange={onSolidControlLabelsChange}/>
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}
