import React, {useState} from "react";
import {TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

/**
 * The same ceiling the Name row carried on the brew deck.
 *
 * A name is a headline, not a description. The note on ABOUT is where a
 * sentence belongs.
 */
const MAX_LENGTH = 100;

/**
 * Renames a recipe, from wherever in the editor you happen to be.
 *
 * A sheet rather than a field in the header, which is what the header being
 * tappable might suggest. The header collapses on scroll and a software
 * keyboard arrives under it, and an editable field caught between those two is
 * the shape of bug that behaves on one platform and not the other. A sheet has
 * neither problem: the header may collapse, the keyboard belongs to the sheet,
 * and it works identically from all three decks, which renaming never did.
 *
 * Inter rather than Doto, because a recipe's name is something a person wrote
 * rather than a label the app prints. The shelf sheet is shift locked for the
 * opposite reason: a shelf name is drawn as a system label.
 *
 * The field holds its own text and hands over a trimmed one. What an empty name
 * means is the screen's business: it is not a missing value, it means follow
 * the pod.
 *
 * A recipe following its pod opens on the title it borrowed, because that is
 * the name on screen and an empty field left nothing to edit. Handing that
 * borrowed title back unchanged is not a rename, so it goes back as the empty
 * name it was: only a different name becomes the recipe's own.
 */
export default function RenameSheet({open, onOpenChange, name, borrowedName, onRename}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * The recipe's own `name`, not its `displayName()`.
     *
     * A recipe following its pod has an empty name and a title it borrowed.
     * Only an own name is ever handed back as itself.
     */
    name: string;
    /**
     * The real title the recipe shows while its own name is empty: the pod
     * name, or failing that the Recipe ID. Empty when there is none, so the
     * generated placeholder is never offered as a name somebody chose.
     */
    borrowedName: string;
    onRename: (name: string) => void;
}) {
    const following = name.trim().length === 0;
    const seed = following ? borrowedName : name;
    const [draft, setDraft] = useState(seed);
    // Seeded per opening rather than per mount, so the sheet always greets the
    // user with the name the recipe has now. Reading it at render against the
    // value it was opened with is the house alternative to an effect, which the
    // compiler forbids: `useTraceAnimation` does the same with its phase.
    const [seededFor, setSeededFor] = useState(seed);
    if (seededFor !== seed) {
        setSeededFor(seed);
        setDraft(seed);
    }

    function submit() {
        const next = draft.trim();
        // The borrowed title saved untouched keeps the recipe on its pod, so a
        // later change to the pod name still reaches it.
        const unchanged = following && next === borrowedName.trim();
        onRename(unchanged ? "" : next);
        // Saving a following recipe as empty leaves its name, and so the seed,
        // where they were. Without this the next opening would offer back the
        // cleared field rather than the name on screen.
        setDraft(seed);
        onOpenChange(false);
    }

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {
            // Discarded on the way out, so a sheet dismissed and reopened does
            // not offer back the name the user just decided against.
            if (!next) setDraft(seed);
            onOpenChange(next);
        }} title="Rename recipe" heightPercent={34}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    Clear it to follow the pod name.
                </Text>

                <TextInput
                    testID="rename-field"
                    accessibilityLabel="Recipe name"
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={MAX_LENGTH}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    placeholder="e.g. Yirgacheffe"
                    placeholderTextColor={palette.placeholder}
                    autoCorrect={false}
                    style={{
                        fontSize:        16,
                        color:           palette.text,
                        backgroundColor: palette.raised,
                        borderRadius:    12,
                        paddingHorizontal: 14,
                        paddingVertical: 12
                    }}/>

                <XStack
                    accessibilityRole="button"
                    accessibilityLabel="Save the name"
                    testID="rename-confirm"
                    onPress={submit}
                    height={48} alignItems="center" justifyContent="center"
                    borderRadius="$4"
                    backgroundColor={palette.text}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        SAVE NAME
                    </DotMatrixText>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}
