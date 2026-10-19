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
     * The pod name the recipe borrows while its own name is empty, its
     * `xbloomName`. Empty when it has none: a recipe titled only by its
     * Recipe ID or by the generated placeholder opens on an empty field.
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
    //
    // Only an untouched draft follows a new seed. The editor looks the pod name
    // up on mount, and that answer can land while the sheet is open; it must
    // not replace what somebody is typing.
    const [seededFor, setSeededFor] = useState(seed);
    if (seededFor !== seed) {
        setSeededFor(seed);
        if (draft === seededFor) setDraft(seed);
    }

    function submit() {
        // A name is one line. Return submits rather than breaking the line, but
        // a pasted name can still carry a line break, and the header and the
        // library row have nowhere to put one.
        const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim();
        const next = oneLine(draft);
        // The borrowed title saved untouched keeps the recipe on its pod, so a
        // later change to the pod name still reaches it. Compared after Unicode
        // normalisation, so the same name typed with a different keyboard's
        // accents still counts, but not case-folded: a recased name is a rename.
        const unchanged = following
            && next.normalize() === oneLine(borrowedName).normalize();
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
        }} title="Rename recipe" heightPercent={RENAME_HEIGHT}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    Clear it to follow the pod name.
                </Text>

                <TextInput
                    testID="rename-field"
                    accessibilityLabel="Recipe name"
                    accessibilityHint="Clear it to follow the pod name."
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={MAX_LENGTH}
                    autoFocus
                    // Wraps, so a long name is read whole. Single line, Android
                    // scrolled a pre-filled name to its end and cut the first
                    // visible letter at the field's edge. Return still saves,
                    // as in every other field in the app: see BrewJudgement.
                    multiline
                    submitBehavior="blurAndSubmit"
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    placeholder="e.g. Yirgacheffe"
                    placeholderTextColor={palette.placeholder}
                    autoCorrect={false}
                    textAlignVertical="top"
                    style={{
                        fontSize:        16,
                        lineHeight:      FIELD_LINE,
                        // Three lines, then it scrolls inside itself rather
                        // than pushing SAVE NAME down under the keyboard.
                        maxHeight:       FIELD_LINE * FIELD_LINES + 2 * FIELD_PAD_V,
                        color:           palette.text,
                        backgroundColor: palette.raised,
                        borderRadius:    12,
                        // On the input itself, not a wrapper, so the text
                        // clears the rounded corner on both platforms.
                        paddingHorizontal: 14,
                        paddingVertical: FIELD_PAD_V
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

/** Line height and vertical padding of the name field, and how many lines it shows. */
const FIELD_LINE = 22;
const FIELD_LINES = 3;
const FIELD_PAD_V = 12;

/**
 * Taller than the 34 the single-line field had, for the two lines a long name
 * can now wrap onto (about 44 dp).
 *
 * From a 1080 x 2520 Android screenshot with the keyboard up: the 34 sheet had
 * been lifted by the keyboard with its bottom edge just under the keyboard's
 * top, and left about 50 dp free beneath SAVE NAME. That is too close to spend
 * all of it, so the sheet grows instead and the extra comes off the dimmed
 * screen above it.
 */
const RENAME_HEIGHT = 40;
