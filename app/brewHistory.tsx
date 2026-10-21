import {useFocusEffect, useLocalSearchParams} from "expo-router";
import router from "@/hooks/steadyRouter";
import React, {useRef, useState} from "react";
import {FlatList} from "react-native-gesture-handler";
import Swipeable, {type SwipeableMethods} from "react-native-gesture-handler/ReanimatedSwipeable";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Button, Text, XStack, YStack} from "tamagui";

import BrewHistoryRow from "@/components/BrewHistoryRow";
import BrewHistoryControls, {BrewHistorySortSheet} from "@/components/BrewHistoryControls";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ExportButton from "@/components/ExportButton";
import ScreenHeader from "@/components/ScreenHeader";
import XbrwSheet from "@/components/XbrwSheet";
import {COMPARE_SELECTION_COPY} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {useBrewBatchHandoff} from "@/hooks/useBrewBatchHandoff";
import {useBrewHistory} from "@/hooks/useBrewHistory";
import {useBrewHistoryQuery} from "@/hooks/useBrewHistoryQuery";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useSetting} from "@/hooks/useSetting";
import type {StoredBrew} from "@/library/BrewDatabase";
import {canHandOff} from "@/library/brew/handoff/targets";
import {queryBrewHistory, type HistorySort, type HistorySortDirection} from "@/library/brew/historyQuery";
import {UNCLIPPED_LIST} from "@/constants/lists";
import {STABLE_HOST} from "@/constants/views";

/** How long one push to the record screen refuses a second (same latch as index.tsx). */
const PUSH_GUARD_MS = 2000;

const TILE_WIDTH = 76;
const TILE_GLYPH_SIZE = 24;

/**
 * The screen's own header, drawn in content rather than by the native bar.
 *
 * The route keeps the platform back chevron — it is pushed on top of the record
 * screen or a recipe sheet — but its system-font title is emptied in favour of
 * this, the same move the record screen makes: the native title read in the
 * platform font, out of register with the app's Doto chrome. "BREW HISTORY" is
 * fixed chrome, so it is Doto like the rest of it.
 *
 * When the list is filtered to one recipe, that recipe is named beneath the
 * heading so the screen says which history it is showing. A recipe name is
 * human-typed, so it is Inter prose (a plain `Text`) and never rendered through
 * `DotMatrixText` — the one dot-matrix exception for a recipe name, on the brew
 * screen, is not extended here.
 */
function HistoryHeader({recipeName, count}: {recipeName?: string; count: number}) {
    return (
        <YStack>
            {/* The same header the other pushed screens draw, rather than a
                second one of its own. An earlier pass hand-set a Doto title
                here, which read as a third kind of header in an app that
                already had two -- and, being drawn in content, sat *under* the
                native bar instead of replacing it. */}
            <ScreenHeader title="Brew history" count={count}
                          onBack={() => router.back()}/>
            {recipeName !== undefined && (
                <Text testID="history-header-recipe" fontSize={13}
                      color={palette.dim} numberOfLines={1}
                      paddingHorizontal="$4" paddingBottom="$2">
                    {recipeName}
                </Text>
            )}
        </YStack>
    );
}

/**
 * The delete tile revealed by swiping a row left.
 *
 * Tapping it does not delete immediately — it opens a confirmation sheet,
 * because a brew record cannot be recovered once removed.
 */
function DeleteTile({onPress}: {onPress: () => void}) {
    return (
        <YStack
            accessible
            accessibilityRole="button"
            accessibilityLabel="Delete brew"
            onPress={onPress}
            pressStyle={{opacity: 0.6}}
            width={TILE_WIDTH}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            borderRadius="$8"
            backgroundColor={palette.surface}>
            <DotIcon testID="brew-delete-icon" name="delete" size={TILE_GLYPH_SIZE}
                     color={palette.danger}/>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={palette.danger}>
                DELETE
            </DotMatrixText>
        </YStack>
    );
}

/**
 * The selection controls, above the list.
 *
 * Its own row rather than a slot on `ScreenHeader`, which several screens share
 * and none of the others has an action for: one screen's button is not a reason
 * to grow the chrome every pushed screen draws.
 *
 * Delete and Send share the top row and the count sits under them. They were
 * on one row with the count until a two-digit selection pushed the buttons off
 * the edge on a narrow phone.
 *
 * Selecting is available whether or not the handoff is switched on, because
 * deleting several brews at once is worth having on its own. Only the Send
 * button is behind the gate.
 */
function SelectionActionRow({
    selecting,
    count,
    blocked,
    fits,
    busy,
    canSend,
    comparable,
    onSend,
    onCompare,
    onDelete,
    onCancel
}: {
    selecting: boolean;
    count: number;
    /** How many of the selected brews cannot be handed over. */
    blocked: number;
    fits: boolean;
    busy: boolean;
    canSend: boolean;
    comparable: boolean;
    onSend: () => void;
    onCompare: () => void;
    onDelete: () => void;
    onCancel: () => void;
}) {
    if (!selecting) return null;

    const sendableCount = count - blocked;
    const tooLarge = canSend && sendableCount > 0 && !fits;

    return (
        <YStack paddingHorizontal="$4" paddingVertical="$2" gap="$2"
                borderBottomWidth={1} borderColor={palette.line}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <Button
                    accessibilityRole="button"
                    accessibilityLabel="Delete selected brews"
                    accessibilityState={{disabled: count === 0}}
                    disabled={count === 0}
                    opacity={count === 0 ? 0.5 : 1}
                    chromeless
                    size="$2"
                    onPress={onDelete}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                   color={palette.danger}>
                        DELETE
                    </DotMatrixText>
                </Button>
                <XStack gap="$2" alignItems="center" flexShrink={1} minWidth={0}>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Compare the selected brews"
                        accessibilityState={{disabled: !comparable}}
                        disabled={!comparable}
                        opacity={comparable ? 1 : 0.5}
                        chromeless
                        size="$2"
                        onPress={onCompare}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                       color={comparable ? palette.text : palette.dim}>
                            COMPARE
                        </DotMatrixText>
                    </Button>
                    {/* SEND, not the target's full label. This button sits
                        among the rows it acts on, so the destination is
                        already in view and the long label only costs width
                        the count and the cancel need. The screen reader hears
                        the whole sentence below, where there is no row in
                        earshot to supply it. */}
                    {canSend && (count === 0 || sendableCount > 0) && (
                        <ExportButton
                            label="SEND"
                            accessibilityLabel="Send selected brews to Beanconqueror"
                            busy={busy}
                            disabled={sendableCount === 0 || tooLarge}
                            onPress={onSend}
                        />
                    )}
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Cancel selection"
                        chromeless
                        size="$2"
                        onPress={onCancel}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                                       color={palette.dim}>
                            CANCEL
                        </DotMatrixText>
                    </Button>
                </XStack>
            </XStack>
            <Text color={palette.dim} fontSize={13}>
                {count === 1 ? "1 brew selected" : `${count} brews selected`}
            </Text>
            {canSend && count > 0 && (
                <Text color={palette.dim} fontSize={13}>
                    {`${sendableCount} of ${count} selected brews can be sent to Beanconqueror.`}
                </Text>
            )}
            {tooLarge && (
                <Text color={palette.warn} fontSize={12}>
                    Select fewer brews to send them together.
                </Text>
            )}
            {count === 2 && !comparable && (
                <Text testID="selection-not-comparable" color={palette.warn} fontSize={12}>
                    {COMPARE_SELECTION_COPY.notComparable}
                </Text>
            )}
            {canSend && blocked > 0 && (
                <Text testID="selection-blocked" color={palette.warn} fontSize={12}>
                    Tea and unfinished brews are excluded from sending.
                </Text>
            )}
        </YStack>
    );
}

/**
 * One swipeable brew history row.
 *
 * Extracted as a component so that the Swipeable ref is owned by the row
 * rather than by the `renderItem` callback — hooks cannot be called inside a
 * render function.
 */
function SwipeableBrewRow({
    brew,
    onPress,
    onDeleteRequest,
    selecting,
    selected
}: {
    brew: StoredBrew;
    onPress: () => void;
    onDeleteRequest: (ref: React.RefObject<SwipeableMethods | null>) => void;
    selecting: boolean;
    selected: boolean;
}) {
    const rowRef = useRef<SwipeableMethods | null>(null);
    return (
        <Swipeable
            ref={rowRef}
            enabled={!selecting}
            friction={2}
            rightThreshold={40}
            overshootRight={false}
            renderRightActions={() => (
                // The left padding is the gap between the row and the tile.
                // Without it the tile butts against the row's edge and reads as
                // part of it rather than as something the row slid off -- the
                // same reasoning, and the same measurements, as the recipe
                // list's trays in SwipeableRecipeRow.
                <XStack testID="brew-row-actions" paddingLeft="$2"
                        paddingRight="$2" paddingVertical="$2"
                        alignItems="stretch">
                    <DeleteTile onPress={() => onDeleteRequest(rowRef)} />
                </XStack>
            )}>
            <BrewHistoryRow
                brew={brew}
                onPress={onPress}
                selectionMode={selecting}
                selected={selected}
            />
        </Swipeable>
    );
}

/**
 * The brew history list.
 *
 * Three entry points: the recipe overflow sheet (filtered by `recipeUuid`),
 * the record screen's "All brews" button (unfiltered), and Settings → Library
 * (unfiltered).
 */
export default function BrewHistory() {
    const {recipeUuid} = useLocalSearchParams<{recipeUuid?: string}>();
    const insets = useSafeAreaInsets();
    const {brews, open, remove, refresh} = useBrewHistory();
    const historyQuery = useBrewHistoryQuery(recipeUuid);
    const [sortOpen, setSortOpen] = useState(false);
    const [handoffEnabled] = useSetting("beanconquerorHandoff");
    const handoff = useBrewBatchHandoff((id) => {
        const opened = open(id);
        return opened === null ? null : {record: opened.record, samples: opened.samples};
    });

    const lastPushRef = useRef(0);
    // The id of the brew the user has swiped and tapped Delete on, waiting for
    // confirmation. Null when no confirmation sheet is open.
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [selecting, setSelecting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectionFits, setSelectionFits] = useState(false);
    // True while the batch delete confirmation is open. Kept apart from
    // `pendingDeleteId` because the two delete different things and say so
    // differently: one names a brew, the other counts them.
    const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);
    const {ratingNoteOpen} = useLiveBrew();
    // Keep a ref to the currently-open swipeable so it can be closed when the
    // confirmation sheet is dismissed without deleting.
    const swipeableRef = useRef<SwipeableMethods | null>(null);

    useFocusEffect(
        // `useFocusEffect` demands a stable callback, which is the one place the
        // repo hand-writes `React.useCallback` despite the React Compiler owning
        // memoisation elsewhere — see `components/ImportTile.tsx`. Deps empty on
        // purpose: this must re-run on focus, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        React.useCallback(() => { refresh(); }, [])
    );

    const scoped = recipeUuid !== undefined
        ? brews.filter((b) => b.recipeUuid === recipeUuid)
        : brews;
    const filtered = queryBrewHistory(brews, historyQuery.query);

    // Resolve all batch actions against visible rows, even after a refresh.
    const selectedBrews = selectedIds
        .map((id) => filtered.find((brew) => brew.id === id))
        .filter((brew): brew is StoredBrew => brew !== undefined);
    const visibleSelectedIds = selectedBrews.map((brew) => brew.id);
    const sendableIds = selectedBrews.filter(canHandOff).map((brew) => brew.id);
    const blockedCount = selectedBrews.length - sendableIds.length;
    const visibleSelectionFits = selectionFits && selectedBrews.length === selectedIds.length;
    const comparable = selectedBrews.length === 2
        && selectedBrews[0].recipeUuid === selectedBrews[1].recipeUuid;

    function handlePress(brew: StoredBrew) {
        if (selecting) {
            toggleSelected(brew.id);
            return;
        }
        // eslint-disable-next-line react-hooks/purity
        if (Date.now() - lastPushRef.current < PUSH_GUARD_MS) return;
        // eslint-disable-next-line react-hooks/purity
        lastPushRef.current = Date.now();
        router.push(`/brewRecord?id=${brew.id}`);
    }

    function handleDeleteRequest(brew: StoredBrew, ref: React.RefObject<SwipeableMethods | null>) {
        swipeableRef.current = ref.current;
        setPendingDeleteId(brew.id);
    }

    function handleSelectStart() {
        setSelecting(true);
        setSelectedIds([]);
        setSelectionFits(false);
        handoff.reset();
    }

    function handleSelectCancel() {
        setSelecting(false);
        setSelectedIds([]);
        setSelectionFits(false);
        setConfirmingBatchDelete(false);
        handoff.reset();
    }

    function handleQueryChange(change: () => void) {
        handleSelectCancel();
        handleDeleteCancel();
        change();
    }

    function handleSortChange(sort: HistorySort, direction: HistorySortDirection) {
        if (sort === historyQuery.query.sort && direction === historyQuery.query.direction) return;
        handleQueryChange(() => historyQuery.onSortChange(sort, direction));
    }

    function toggleSelected(id: string) {
        const next = visibleSelectedIds.includes(id)
            ? visibleSelectedIds.filter((selectedId) => selectedId !== id)
            : [...visibleSelectedIds, id];
        setSelectedIds(next);
        const eligible = filtered.filter((brew) => next.includes(brew.id) && canHandOff(brew));
        setSelectionFits(handoff.fits(eligible.map((brew) => brew.id)));
    }

    async function handleSelectionSend() {
        if (sendableIds.length === 0 || !visibleSelectionFits || handoff.busy) return;
        await handoff.send(sendableIds);
        handleSelectCancel();
    }

    function handleSelectionCompare() {
        if (!comparable) return;
        // Exactly two. Quietly taking the first two out of three would answer a
        // different question than the one the user selected.
        //
        // The newer brew leads. Somebody comparing two brews is nearly always
        // asking what their last one did differently, so the accent goes on
        // the one they just made and the older brew is the grey it is held
        // against. SWAP is there for the other reading.
        const [older, newer] = [...selectedBrews]
            .sort((one, two) => one.startedAt - two.startedAt);
        handleSelectCancel();
        router.push({pathname: "/brewCompare", params: {a: newer.id, b: older.id}});
    }

    function handleSelectionDelete() {
        for (const id of visibleSelectedIds) remove(id);
        handleSelectCancel();
    }

    function handleDeleteConfirm() {
        if (pendingDeleteId !== null) remove(pendingDeleteId);
        setPendingDeleteId(null);
        swipeableRef.current = null;
    }

    function handleDeleteCancel() {
        swipeableRef.current?.close();
        setPendingDeleteId(null);
        swipeableRef.current = null;
    }

    const pendingBrew = pendingDeleteId !== null
        ? filtered.find((b) => b.id === pendingDeleteId) ?? null
        : null;

    // When filtered to one recipe, name it under the heading. Taken from the
    // brew rows themselves (the name at brew time), so a since-renamed recipe
    // does not relabel its own history.
    const recipeName = recipeUuid !== undefined ? scoped[0]?.recipeName : undefined;
    // Every open sheet has to be named here. On Android a Tamagui sheet renders
    // as a sibling of the screen and isolates nothing on its own, so one left
    // out leaves the rows and the selection actions reachable underneath a
    // destructive confirmation -- see `components/XbrwSheet.tsx`.
    const screenCovered = pendingBrew !== null || confirmingBatchDelete || ratingNoteOpen || sortOpen;

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            {/* The Android half of what `accessibilityViewIsModal` does on iOS.
                The sheets sit outside this subtree, so they never hide
                themselves. */}
            <YStack {...STABLE_HOST} flex={1} testID="brew-history-content"
                    accessibilityElementsHidden={screenCovered}
                    importantForAccessibility={screenCovered ? "no-hide-descendants" : "auto"}>
                <HistoryHeader recipeName={recipeName} count={filtered.length} />
                <BrewHistoryControls query={historyQuery.query}
                    onToggleHideUnsuccessful={() => handleQueryChange(historyQuery.toggleHideUnsuccessful)}
                    onToggleRatedOnly={() => handleQueryChange(historyQuery.toggleRatedOnly)}
                    editing={selecting}
                    onToggleEdit={filtered.length > 0 || selecting
                        ? (selecting ? handleSelectCancel : handleSelectStart) : undefined}
                    onOpenSort={() => setSortOpen(true)}/>
                {/* Selection does not depend on the handoff gate, which hides Send alone. */}
                {selecting && <SelectionActionRow
                    selecting={selecting}
                    count={visibleSelectedIds.length}
                    blocked={blockedCount}
                    fits={visibleSelectionFits}
                    busy={handoff.busy}
                    canSend={handoffEnabled}
                    comparable={comparable}
                    onSend={() => void handleSelectionSend()}
                    onCompare={handleSelectionCompare}
                    onDelete={() => setConfirmingBatchDelete(true)}
                    onCancel={handleSelectCancel}
                />}
                <FlatList {...UNCLIPPED_LIST}
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    renderItem={({item}) => (
                        <SwipeableBrewRow
                            brew={item}
                            onPress={() => handlePress(item)}
                            onDeleteRequest={(ref) => handleDeleteRequest(item, ref)}
                            selecting={selecting}
                            selected={selectedIds.includes(item.id)}
                        />
                    )}
                    // The last row scrolls clear of the navigation bar or
                    // home indicator, the way the library's does. The mini bar
                    // is silent here, so nothing else takes the inset.
                    contentContainerStyle={{paddingTop: 8, paddingBottom: 8 + insets.bottom}}
                    ListEmptyComponent={
                        <YStack padding="$4" alignItems="center" gap="$2">
                            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                                           color={palette.dim}>
                                {scoped.length === 0 ? "NO BREWS YET" : "NO MATCHING BREWS"}
                            </DotMatrixText>
                            <Text color={palette.muted} fontSize={13} textAlign="center">
                                {scoped.length === 0
                                    ? "Brew a recipe and it will appear here."
                                    : "No brews match these filters."}
                            </Text>
                            {(historyQuery.query.hideUnsuccessful || historyQuery.query.ratedOnly) && (
                                <Button accessibilityRole="button" accessibilityLabel="Clear filters"
                                        onPress={() => handleQueryChange(historyQuery.clearFilters)}>
                                    Clear filters
                                </Button>
                            )}
                        </YStack>
                    }
                />
            </YStack>

            <BrewHistorySortSheet open={sortOpen} onOpenChange={setSortOpen}
                sort={historyQuery.query.sort} direction={historyQuery.query.direction}
                onSortChange={handleSortChange}/>

            {/* Confirmation sheet — shown after swipe+tap, before the delete lands. */}
            <XbrwSheet
                open={pendingBrew !== null}
                onOpenChange={(next) => { if (!next) handleDeleteCancel(); }}
                title="Delete brew"
                heightPercent={40}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={15} color={palette.text}>
                        Delete {pendingBrew?.recipeName}? This cannot be undone.
                    </Text>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${pendingBrew?.recipeName ?? "brew"}`}
                        backgroundColor={palette.danger}
                        onPress={handleDeleteConfirm}>
                        Delete
                    </Button>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Keep this brew"
                        chromeless
                        onPress={handleDeleteCancel}>
                        Keep this brew
                    </Button>
                </YStack>
            </XbrwSheet>

            {/* The batch equivalent, opened from the selection row. It counts
                the brews rather than naming them: a list of names long enough
                to be worth batching is longer than a sheet can show. */}
            <XbrwSheet
                open={confirmingBatchDelete}
                onOpenChange={(next) => { if (!next) setConfirmingBatchDelete(false); }}
                title="Delete brews"
                heightPercent={40}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={15} color={palette.text}>
                        {visibleSelectedIds.length === 1
                            ? "Delete 1 brew? This cannot be undone."
                            : `Delete ${visibleSelectedIds.length} brews? This cannot be undone.`}
                    </Text>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Delete the selected brews"
                        backgroundColor={palette.danger}
                        onPress={handleSelectionDelete}>
                        Delete
                    </Button>
                    <Button
                        accessibilityRole="button"
                        accessibilityLabel="Keep these brews"
                        chromeless
                        onPress={() => setConfirmingBatchDelete(false)}>
                        Keep these brews
                    </Button>
                </YStack>
            </XbrwSheet>
        </YStack>
    );
}
