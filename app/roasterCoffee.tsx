import {useLocalSearchParams} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {Linking, Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import BagSheet, {type BagSheetResult} from "@/components/BagSheet";
import BrewStageLadder from "@/components/BrewStageLadder";
import {
    BuySection, CatalogueStatus, Chip, CoffeeBadgeTag, DetailPhoto, PageLinkRow, WatchToggle
} from "@/components/CatalogueParts";
import DotMatrixText from "@/components/DotMatrixText";
import NameShelfSheet from "@/components/NameShelfSheet";
import NewerVersionPrompt from "@/components/NewerVersionPrompt";
import ScreenHeader from "@/components/ScreenHeader";
import ShelfChoiceSheet from "@/components/ShelfChoiceSheet";
import {notify} from "@/components/XbrwToast";
import {palette, primary as primaryButton} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import router from "@/hooks/steadyRouter";
import {useScrollEndPadding} from "@/hooks/useBottomInset";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import type {BagStore} from "@/hooks/useCoffeeBag";
import {assignAccent, resolveAccent} from "@/library/accent";
import {bagBeanName, bagBeanNameFixed} from "@/library/brew/handoff/bagBean";
import {sharedBagDatabase} from "@/library/CoffeeBagDatabase";
import {resolveBagTracker} from "@/library/coffeeBag";
import {withRoastAdvice} from "@/library/restPeak";
import {bagFormFor, beanconquerorBagLink, catalogueBag} from "@/library/roasterBag";
import type Recipe from "@/library/Recipe";
import {
    bagWatchKey, coffeeBadge, coffeeKey, readAlerts, recordOpened, setWatch
} from "@/library/roasterAlerts";
import {
    bagLine, beanFacts, chooseRecipe, detailTitle, findCoffee, readCatalogue,
    roastAdvice, tasteOf
} from "@/library/roasterCatalogue";
import {buyOptions} from "@/library/roasterBuy";
import type {FeedCoffee} from "@/library/roasterFeed";
import {
    addToLibrary, addToShelf, fetchCoffeeRecipe, takeRoasterLatest,
    type AddOutcome, type FetchedCoffee, type LibraryDeps
} from "@/library/roasterRecipes";
import {realLibraryDeps, realUserShelves} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";

const LADDER_BAR_HEIGHT = 18;
const LADDER_RUNG_GAP = 12;

type Loaded = {request: string; fetched: FetchedCoffee | null; failed: boolean};
/** What the screen is waiting on after an add, if anything. */
type Pending =
    | {kind: "ask"; held: Recipe; latest: Recipe}
    | {kind: "shelf"; recipe: Recipe};

/**
 * Room for the longest caption, ELEVATION, so values line up. The same floor
 * as the XPOD block on ABOUT.
 */
const FACT_LABEL_MIN_WIDTH = 92;

/** Where the scroll view ends, before the bottom inset is counted. */
const SCROLL_END = 24;

function Figure({label, value, accent}: {label: string; value: string; accent: string}) {
    return (
        <YStack flex={1} minWidth={72} gap="$1">
            <DotMatrixText fontSize={20} weight="bold" color={accent}>{value}</DotMatrixText>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={palette.muted}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}

function Action({label, spoken, testID, primary = false, disabled = false, onPress}: {
    label: string;
    spoken: string;
    testID: string;
    primary?: boolean;
    disabled?: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={spoken}
                   accessibilityState={{disabled}} testID={testID}
                   onPress={disabled ? undefined : onPress}>
            <XStack height={48} alignItems="center" justifyContent="center" borderRadius="$4"
                    opacity={disabled && !primary ? 0.35 : 1}
                    backgroundColor={!primary ? palette.none
                        : disabled ? primaryButton.disabledFill : primaryButton.fill}
                    borderWidth={primary ? 0 : 1} borderColor={palette.line}>
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                               color={!primary ? palette.text
                                   : disabled ? primaryButton.disabledInk : primaryButton.ink}>
                    {label}
                </DotMatrixText>
            </XStack>
        </Pressable>
    );
}

/**
 * One coffee from a roaster's catalogue: what the bag says, and its recipes.
 *
 * Opening it is a user action, so this is where xBloom is asked: the chosen
 * size's recipe is fetched as the screen opens and again when the size
 * changes, so what is shown and what every action uses is the roaster's
 * latest. Three actions, because a catalogue is for deciding: brew it now
 * without keeping it, add it to the library, or put it on a shelf.
 */
export default function RoasterCoffeeScreen({settings, feedUrl, coffeeId, library, shelves, bagStore}: {
    /** Injected by tests; production reads the route and the real stores. */
    settings?: Settings;
    feedUrl?: string;
    coffeeId?: string;
    library?: LibraryDeps;
    shelves?: () => string[];
    bagStore?: Pick<BagStore, "save">;
} = {}) {
    const {ratingNoteOpen} = useLiveBrew();
    const params = useLocalSearchParams<{feed: string; coffee: string}>();
    const feed = feedUrl ?? params.feed ?? "";
    const ref = coffeeId ?? params.coffee ?? "";
    const store = settings ?? sharedSettings();
    useSetting("roasterCatalogue", store);
    // So the watch switches redraw when they are pressed.
    useSetting("roasterAlerts", store);
    const scrollEnd = useScrollEndPadding(SCROLL_END);
    const [deps] = useState(() => library ?? realLibraryDeps(store));
    const cached = readCatalogue(store, feed);
    const coffee = cached === null ? undefined : findCoffee(cached.feed, ref);
    const alerts = readAlerts(store, feed);
    // What the coffee was when it was opened: opening it clears the flag in
    // the store at once, but this visit still says why it was worth opening.
    const [badge] = useState(() => coffee === undefined ? undefined : coffeeBadge(alerts, coffee));

    // Opened: seen, and no longer NEW or back. Once per mount.
    const opened = useRef(false);
    useEffect(() => {
        if (opened.current || coffee === undefined) return;
        opened.current = true;
        recordOpened(store, feed, coffee);
        // Once per visit, by design; see the ref above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [size, setSize] = useState<string | undefined>(undefined);
    const [retry, setRetry] = useState(0);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const [naming, setNaming] = useState(false);
    // ADD TO SHELF asks about the bag first, then the shelf. The answer waits
    // here until the shelf is chosen, so a cancelled shelf makes no bag.
    const [bagOpen, setBagOpen] = useState(false);
    const [bagEpoch, setBagEpoch] = useState(0);
    const [bagInput, setBagInput] = useState<BagSheetResult | null>(null);
    const [bagTrackerSetting] = useSetting("bagTracker", store);
    const [beanconquerorHandoff] = useSetting("beanconquerorHandoff", store);
    const tracker = resolveBagTracker(bagTrackerSetting, beanconquerorHandoff);
    const chosen = coffee === undefined ? undefined : chooseRecipe(coffee, size);
    const request = `${chosen?.share ?? ""}:${retry}`;

    useEffect(() => {
        if (coffee === undefined || chosen === undefined) return;
        const controller = new AbortController();
        let alive = true;
        fetchCoffeeRecipe(coffee, chosen.size, deps, controller.signal)
            .then((fetched) => {
                if (alive) setLoaded({request, fetched, failed: false});
            })
            .catch(() => {
                if (alive) setLoaded({request, fetched: null, failed: true});
            });
        return () => {
            alive = false;
            controller.abort();
        };
        // `request` is the share and the retry count, which is everything
        // this fetch depends on.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request]);

    if (cached === null || coffee === undefined || chosen === undefined) {
        return (
            <YStack flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={ratingNoteOpen}
                    importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title="Coffee" onBack={() => router.back()}/>
                <CatalogueStatus testID="roaster-coffee-missing" title="NOT IN THE CATALOGUE"
                                 body="This coffee is no longer in the roaster's list."/>
            </YStack>
        );
    }

    const arrived = loaded !== null && loaded.request === request;
    const fetched = arrived ? loaded.fetched : null;
    const failed = arrived && loaded.failed;
    const recipe = fetched?.recipe ?? null;
    const accent = recipe === null ? palette.text : resolveAccent(recipe);
    const advice = roastAdvice(coffee);
    const bags = bagLine(coffee);
    const facts = beanFacts(coffee);
    const buying = buyOptions(cached.feed.roaster, coffee);
    const title = detailTitle(coffee.name);
    const taste = tasteOf(coffee);
    const covered = ratingNoteOpen || bagOpen || naming || (pending !== null && pending.kind === "shelf");
    const watched = new Set(alerts?.watch ?? []);
    const watchingCoffee = watched.has(coffeeKey(coffee));
    // The bags being watched, by bag key, for the BUY section's switches.
    const watchedBags = new Set(buying
        .map((option) => option.bag)
        .filter((bag): bag is string => bag !== undefined && watched.has(bagWatchKey(coffee, bag))));

    /** A fresh copy each time, so one action never mutates what another uses. */
    async function latest(): Promise<FetchedCoffee> {
        return fetchCoffeeRecipe(coffee as FeedCoffee, chosen?.size, deps);
    }

    /**
     * ADD TO SHELF: saved to the library first (or matched to the copy already
     * there), then put on a shelf the person picks. There is no separate ADD
     * TO LIBRARY; shelving already does that.
     */
    async function add() {
        let outcome: AddOutcome;
        try {
            outcome = addToLibrary(await latest(), deps, store);
        } catch {
            notify({tone: "error", message: "Couldn't reach xBloom. Check your connection."});
            return;
        }
        if (outcome.kind === "ask") {
            setPending({kind: "ask", held: outcome.held, latest: outcome.latest});
            return;
        }
        setPending({kind: "shelf", recipe: outcome.recipe});
    }

    function answer(takeLatest: boolean) {
        if (pending === null || pending.kind !== "ask") return;
        const kept = takeLatest
            ? takeRoasterLatest(pending.held, pending.latest, deps, store)
            : pending.held;
        setPending({kind: "shelf", recipe: kept});
    }

    function shelve(shelf: string): boolean {
        if (pending === null || pending.kind !== "shelf") return false;
        addToShelf(pending.recipe, shelf, deps, store);
        setPending(null);
        setNaming(false);
        if (bagInput !== null) startBag(pending.recipe, bagInput);
        setBagInput(null);
        notify({tone: "success", message: `Added to ${shelf}.`});
        return true;
    }

    /**
     * The bag, made as the editor makes one. In Beanconqueror mode it is also
     * handed over there, and a Beanconqueror that will not open costs nothing
     * here: the bag is already saved.
     */
    function startBag(shelved: Recipe, input: BagSheetResult) {
        const bag = catalogueBag(shelved, input, tracker);
        try {
            (bagStore ?? sharedBagDatabase()).save(bag);
        } catch {
            notify({tone: "error", message: "The bag could not be saved."});
            return;
        }
        if (tracker === "beanconqueror") {
            Linking.openURL(beanconquerorBagLink(shelved, bag)).catch(() => notify({
                tone:    "error",
                message: "The bag is saved here, but Beanconqueror could not be opened. Make sure it is installed."
            }));
        }
    }

    function askBag() {
        setBagEpoch((epoch) => epoch + 1);
        setBagOpen(true);
    }

    async function brewNow() {
        // Not saved: the editor opens it as an import does, and the user can
        // brew, tune or save from there.
        let fresh: FetchedCoffee;
        try {
            fresh = await latest();
        } catch {
            notify({tone: "error", message: "Couldn't reach xBloom. Check your connection."});
            return;
        }
        assignAccent(fresh.recipe, deps.stored());
        router.push({pathname: "/editRecipe", params: {recipeJSON: JSON.stringify(fresh.recipe)}});
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <YStack flex={1} accessibilityElementsHidden={covered}
                    importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title={coffee.name} titleLines={title.lines}
                              titleSize={title.size} onBack={() => router.back()}/>
                {/* Under the system's bottom bar rather than above it, so the
                    photo and facts use the whole screen; the padding at the
                    end is what lets the last action scroll clear of it. */}
                <ScrollView testID="roaster-coffee-scroll" showsVerticalScrollIndicator={false}
                            contentContainerStyle={{
                                paddingBottom: scrollEnd,
                                gap: 18
                            }}>
                    <DetailPhoto uri={coffee.image ?? null} testID="roaster-coffee-photo" whole/>
                    <YStack paddingHorizontal={SCREEN_PADDING} gap="$4">
                        <CoffeeBadgeTag badge={badge} testID="roaster-coffee-badge"/>
                        {!coffee.available && (
                            <DotMatrixText testID="roaster-coffee-sold-out" fontSize={12}
                                           weight="bold" letterSpacing={1.6} color={palette.text}>
                                SOLD OUT
                            </DotMatrixText>
                        )}
                        {!coffee.available && (
                            <WatchToggle on={watchingCoffee}
                                         onChange={(on) => setWatch(store, feed, coffeeKey(coffee), on)}/>
                        )}
                        {coffee.roast?.level !== undefined && (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.dim}>
                                {`${coffee.roast.level.toUpperCase()} ROAST`}
                            </DotMatrixText>
                        )}
                        {advice !== null && (
                            <Text testID="roaster-coffee-advice" color={palette.text} fontSize={15}>
                                {advice}
                            </Text>
                        )}
                        {taste.chips.length > 0 && (
                            <XStack testID="roaster-coffee-note-chips" flexWrap="wrap" gap="$2">
                                {taste.chips.map((note) => <Chip key={note} label={note}/>)}
                            </XStack>
                        )}
                        {taste.prose !== undefined && (
                            <Text testID="roaster-coffee-notes" fontSize={15} lineHeight={22}
                                  color={palette.dim}>
                                {taste.prose}
                            </Text>
                        )}
                        {/* Quieter than the flavours: these say what kind of
                            coffee it is, and they become the recipe's tags. */}
                        {taste.tags.length > 0 && (
                            <Text testID="roaster-coffee-tags" fontSize={13} color={palette.muted}>
                                {taste.tags.join(" · ")}
                            </Text>
                        )}
                        {facts.length > 0 && (
                            <YStack gap="$2">
                                {facts.map(({label, value}) => (
                                    <XStack key={label} testID={`roaster-coffee-fact-${label}`}
                                            accessible accessibilityLabel={`${label}, ${value}`}
                                            alignItems="flex-start" gap="$2">
                                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.3}
                                                       color={palette.dim}
                                                       style={{minWidth: FACT_LABEL_MIN_WIDTH,
                                                               paddingTop: 2}}>
                                            {label}
                                        </DotMatrixText>
                                        <Text flex={1} minWidth={0} fontSize={14} color={palette.text}>
                                            {value}
                                        </Text>
                                    </XStack>
                                ))}
                            </YStack>
                        )}
                        {/* The bags with their prices replace the plain size
                            list when the roaster publishes them. */}
                        {buying.length > 0 ? (
                            <BuySection options={buying}
                                        watching={watchedBags}
                                        onWatch={coffee.available
                                            ? (bag, on) => setWatch(store, feed, bagWatchKey(coffee, bag), on)
                                            : undefined}/>
                        ) : bags !== null && (
                            <Text testID="roaster-coffee-bags" fontSize={14} color={palette.dim}>
                                {`Bags: ${bags}`}
                            </Text>
                        )}
                        {coffee.url !== undefined && (
                            <PageLinkRow testID="roaster-coffee-page"
                                         label="View the roaster's page" url={coffee.url}/>
                        )}

                        <YStack gap="$3">
                            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                           color={palette.dim}>
                                RECIPE
                            </DotMatrixText>
                            {coffee.recipes.length > 1 && (
                                <XStack gap="$2" accessibilityRole="radiogroup">
                                    {coffee.recipes.map((entry) => {
                                        const on = entry.size === chosen.size;
                                        return (
                                            <Pressable key={entry.size} accessibilityRole="radio"
                                                       accessibilityState={{checked: on}}
                                                       accessibilityLabel={entry.size}
                                                       testID={`roaster-coffee-size-${entry.size}`}
                                                       onPress={() => setSize(entry.size)}>
                                                <XStack height={36} paddingHorizontal="$3"
                                                        alignItems="center" borderRadius="$4"
                                                        backgroundColor={on ? primaryButton.fill : palette.raised}>
                                                    <DotMatrixText fontSize={12} weight="bold"
                                                                   letterSpacing={1.4}
                                                                   color={on ? primaryButton.ink : palette.dim}>
                                                        {entry.size.toUpperCase()}
                                                    </DotMatrixText>
                                                </XStack>
                                            </Pressable>
                                        );
                                    })}
                                </XStack>
                            )}
                            {!arrived && (
                                <Text testID="roaster-coffee-loading" color={palette.muted} fontSize={14}>
                                    Loading the recipe from xBloom.
                                </Text>
                            )}
                            {failed && (
                                <XStack gap="$3" alignItems="center">
                                    <Text color={palette.danger} fontSize={13} flex={1}
                                          accessibilityRole="alert">
                                        Couldn&apos;t load the recipe from xBloom.
                                    </Text>
                                    <Pressable accessibilityRole="button" accessibilityLabel="Try again"
                                               testID="roaster-coffee-retry"
                                               onPress={() => setRetry((value) => value + 1)}>
                                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.5}
                                                       color={palette.text}>
                                            TRY AGAIN
                                        </DotMatrixText>
                                    </Pressable>
                                </XStack>
                            )}
                            {recipe !== null && (
                                <YStack gap="$3">
                                    <XStack flexWrap="wrap" gap="$3">
                                        <Figure label="DOSE" value={`${recipe.dosage} g`} accent={accent}/>
                                        <Figure label="RATIO" value={`1:${recipe.ratio}`} accent={accent}/>
                                        <Figure label="GRIND" value={recipe.grinder ? String(recipe.grindSize) : "OFF"}
                                                accent={accent}/>
                                    </XStack>
                                    {recipe.pours.length > 0 && (
                                        <BrewStageLadder pours={recipe.pours} accent={accent}
                                                         activeIndex={null} barHeight={LADDER_BAR_HEIGHT}
                                                         rungGap={LADDER_RUNG_GAP} scrolls={false}
                                                         fill={false} stageWater={[]} stalls={[]}
                                                         pauseElapsed={0} plan/>
                                    )}
                                </YStack>
                            )}
                        </YStack>

                        {pending?.kind === "ask" ? (
                            <NewerVersionPrompt name={pending.held.displayName()}
                                                onLatest={() => answer(true)}
                                                onKeep={() => answer(false)}/>
                        ) : (
                            <YStack gap="$2">
                                <Action label="BREW NOW" spoken="Brew now" testID="roaster-coffee-brew"
                                        primary disabled={recipe === null} onPress={() => void brewNow()}/>
                                <Action label="ADD TO SHELF" spoken="Add to shelf"
                                        testID="roaster-coffee-shelf" disabled={recipe === null}
                                        onPress={askBag}/>
                            </YStack>
                        )}
                    </YStack>
                </ScrollView>
            </YStack>

            <BagSheet open={bagOpen}
                      onOpenChange={(next) => {
                          if (!next) setBagOpen(false);
                      }}
                      tracker={tracker} bag={null} gramsLeft={null}
                      coffee={withRoastAdvice(coffee.coffee, coffee.roast ?? {})}
                      beanName={recipe === null ? coffee.name : bagBeanName(recipe)}
                      beanNameFixed={bagBeanNameFixed(recipe ?? {coffee: coffee.coffee})}
                      epoch={bagEpoch}
                      {...bagFormFor(coffee)}
                      onSave={(result) => {
                          setBagOpen(false);
                          setBagInput(result);
                          void add();
                      }}
                      onFinish={() => setBagOpen(false)}
                      onRemove={() => setBagOpen(false)}/>
            <ShelfChoiceSheet open={pending?.kind === "shelf" && !naming}
                              shelves={pending?.kind === "shelf" ? (shelves ?? (() => realUserShelves(store)))() : []}
                              onOpenChange={(next) => {
                                  if (!next && !naming) setPending(null);
                              }}
                              onChoose={shelve}
                              onNew={() => setNaming(true)}/>
            <NameShelfSheet open={naming} count={1}
                            onOpenChange={(next) => {
                                if (!next) {
                                    setNaming(false);
                                    setPending(null);
                                }
                            }}
                            onName={shelve}/>
        </YStack>
    );
}
