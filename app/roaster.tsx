import {useLocalSearchParams} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {FlatList} from "react-native-gesture-handler";
import {XStack, YStack} from "tamagui";

import {CatalogueStatus} from "@/components/CatalogueParts";
import FadingRail from "@/components/FadingRail";
import HubFilterSheet from "@/components/HubFilterSheet";
import RailChip from "@/components/RailChip";
import {RailSearchChip, RailSearchField} from "@/components/RailSearch";
import RoasterCoffeeRow from "@/components/RoasterCoffeeRow";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {UNCLIPPED_LIST} from "@/constants/lists";
import router from "@/hooks/steadyRouter";
import {useScrollEndPadding} from "@/hooks/useBottomInset";
import {useRailSearch, type RailSearch} from "@/hooks/useRailSearch";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {coffeeBadge, readAlerts, recordListViewed} from "@/library/roasterAlerts";
import {coffeeRef, readCatalogue, updatedAgo} from "@/library/roasterCatalogue";
import type {FeedCoffee} from "@/library/roasterFeed";
import {
    availableFilters, countLabel, EMPTY_COFFEE_QUERY, FACETS, facetOptions, filterCoffees,
    isFiltered, rememberedQuery, rememberQuery, type CoffeeFacet, type CoffeeFilters,
    type CoffeeQuery
} from "@/library/roasterFilters";
import type {Settings} from "@/library/Settings";

/** The rail's words, in the community catalogue's register. */
const FACET_COPY: Record<CoffeeFacet, {label: string; title: string; spoken: string}> = {
    roasts:    {label: "ROAST", title: "Roast", spoken: "Roast"},
    countries: {label: "COUNTRY", title: "Country", spoken: "Country"},
    processes: {label: "PROCESS", title: "Process", spoken: "Process"}
};

const COFFEES: readonly [string, string] = ["coffee", "coffees"];

/** The rail's space before its first chip: Tamagui's `$3`, which it used as padding. */
const RAIL_INSET = 13;

function searchState(text: string): string {
    const term = text.trim();
    return term.length === 0 ? "no search term" : `term ${term} active`;
}

/**
 * Search and filters, built from the parts of the community catalogue's rail
 * (and so the library's): the search square that opens a field over the rail,
 * a chip per facet that opens a sheet of values, and a chip per yes/no filter.
 * Only the filters the feed has something to choose between are drawn.
 */
function CoffeeRail({search, query, offered, openFacet, onFacetOpen, onChange}: {
    search: RailSearch;
    query: CoffeeQuery;
    offered: CoffeeFilters;
    openFacet: CoffeeFacet | null;
    onFacetOpen: (facet: CoffeeFacet) => void;
    onChange: (query: CoffeeQuery) => void;
}) {
    const state = searchState(search.text);
    return (
        <YStack borderBottomWidth={1} borderColor={palette.line} backgroundColor={palette.base}>
            <XStack minHeight={64} alignItems="center" paddingVertical="$2">
                {/* Edge to edge, with the inset inside the scroll, so the first
                    chip is clear of the edge at rest and a clipped end fades. */}
                <FadingRail testID="roaster-rail" inset={RAIL_INSET} gap={8}>
                    {!search.expanded && <RailSearchChip state={state} onPress={search.onExpand}/>}
                    {offered.inStock && (
                        <RailChip testID="roaster-filter-in-stock" active={query.inStock}
                                  label="IN STOCK"
                                  accessibilityLabel="In stock only"
                                  onPress={() => onChange({...query, inStock: !query.inStock})}/>
                    )}
                    {FACETS.filter((facet) => offered[facet]).map((facet) => {
                        const copy = FACET_COPY[facet];
                        return (
                            <RailChip key={facet} testID={`roaster-filter-${facet}`}
                                      active={query[facet].length > 0}
                                      expanded={openFacet === facet}
                                      caretOpen={openFacet === facet}
                                      label={copy.label}
                                      accessibilityLabel={`${copy.spoken} filter`}
                                      onPress={() => onFacetOpen(facet)}/>
                        );
                    })}
                    {offered.decaf && (
                        <RailChip testID="roaster-filter-decaf" active={query.decaf}
                                  label="DECAF"
                                  accessibilityLabel="Decaf only"
                                  onPress={() => onChange({...query, decaf: !query.decaf})}/>
                    )}
                </FadingRail>
                {search.expanded && (
                    <XStack position="absolute" top={0} left={0} right={0} bottom={0}
                            alignItems="center" paddingHorizontal="$3">
                        <RailSearchField state={state} text={search.text} active={search.active}
                                         onChangeText={search.onChangeText}
                                         onBlur={search.onBlur} onClear={search.onClear}/>
                    </XStack>
                )}
            </XStack>
        </YStack>
    );
}

/**
 * One roaster's coffees.
 *
 * The cached feed, drawn as the catalogue draws a list: photo, name, roast
 * level, tasting notes and bag sizes, on sale first and sold out after, so
 * the list leads with what can be bought and still shows what someone may
 * have a bag of. Opening a coffee is the first moment xBloom is asked
 * anything.
 *
 * Searchable and filterable over the feed's own fields. IN STOCK is on by
 * default and hides sold-out coffees; turning it off brings them back at the
 * end of the list.
 */
export default function RoasterScreen({settings, feedUrl, now}: {
    /** Injected by tests; production reads the route. */
    settings?: Settings;
    feedUrl?: string;
    now?: () => number;
} = {}) {
    const params = useLocalSearchParams<{feed: string}>();
    const feed = feedUrl ?? params.feed ?? "";
    const store = settings ?? sharedSettings();
    // Subscribed so a refresh that lands while this is open redraws it.
    useSetting("roasterCatalogue", store);
    // And to the alerts, so a coffee opened from here loses its tag on return.
    useSetting("roasterAlerts", store);
    const [at] = useState(() => (now ?? Date.now)());
    const listEnd = useScrollEndPadding(8);
    const cached = readCatalogue(store, feed);
    const alerts = readAlerts(store, feed);

    // One visit to the list. NEW tags from the last visit go now, and the
    // ones flagged since are shown with their tag and stop counting towards
    // the dot. Once per mount: the ref holds when an effect is run twice.
    const visited = useRef(false);
    useEffect(() => {
        if (visited.current) return;
        visited.current = true;
        const listed = readCatalogue(store, feed);
        if (listed !== null) recordListViewed(store, feed, listed.feed.coffees);
        // Once per visit, by design; see the ref above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Remembered per roaster for the session, without the search term: the
    // field's own text starts empty, and a term with no field showing it
    // would narrow the list with nothing on screen to say so.
    const [query, setQueryState] = useState<CoffeeQuery>(() => rememberedQuery(feed));
    const [openFacet, setOpenFacet] = useState<CoffeeFacet | null>(null);
    const search = useRailSearch((term) => setQueryState((was) => ({...was, term})));

    function setQuery(next: CoffeeQuery) {
        setQueryState(next);
        rememberQuery(feed, {...next, term: ""});
    }

    if (cached === null) {
        return (
            <YStack flex={1} backgroundColor={palette.base}>
                <ScreenHeader title="ROASTER" onBack={() => router.back()}/>
                <CatalogueStatus testID="roaster-missing" title="NOT IN THE CATALOGUE"
                                 body="This roaster's coffees are not in the catalogue. Subscribe from one of its import links."/>
            </YStack>
        );
    }

    const catalogue = cached.feed;
    const all = catalogue.coffees;
    const offered = availableFilters(all);
    const coffees = filterCoffees(all, query);
    const filtered = isFiltered(query, offered);
    const covered = openFacet !== null;
    const ref = (coffee: FeedCoffee) => coffeeRef(catalogue, coffee);

    function clear() {
        search.onClear();
        setQuery({...EMPTY_COFFEE_QUERY, inStock: query.inStock});
    }

    return (
        <>
            <YStack testID="roaster-screen" flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={covered}
                    importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title={catalogue.roaster.name}
                              subtitle={countLabel(coffees.length, all.length, filtered)}
                              meta={updatedAgo(cached.fetchedAt, at)}
                              onBack={() => router.back()}/>
                <CoffeeRail search={search} query={query} offered={offered} openFacet={openFacet}
                            onFacetOpen={setOpenFacet} onChange={setQuery}/>
                {coffees.length === 0 ? (
                    <CatalogueStatus testID="roaster-no-matches" title="NO MATCHES"
                                     body="No coffees match."
                                     action="Clear filters" onAction={clear}/>
                ) : (
                    <FlatList {...UNCLIPPED_LIST}
                        testID="roaster-list"
                        data={coffees}
                        keyExtractor={ref}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{paddingBottom: listEnd}}
                        renderItem={({item}) => (
                            <RoasterCoffeeRow
                                coffee={item}
                                badge={coffeeBadge(alerts, item)}
                                testID={`roaster-coffee-${ref(item)}`}
                                onPress={() => router.push({
                                    pathname: "/roasterCoffee",
                                    params:   {feed, coffee: ref(item)}
                                })}/>
                        )}/>
                )}
            </YStack>

            <HubFilterSheet
                open={openFacet !== null}
                onOpenChange={(next) => {
                    if (!next) setOpenFacet(null);
                }}
                title={openFacet === null ? "Filter" : FACET_COPY[openFacet].title}
                note="Options are counted from this roaster's coffees."
                noun={COFFEES}
                options={openFacet === null ? [] : facetOptions(all, openFacet)}
                selected={openFacet === null ? [] : query[openFacet]}
                onChange={(values) => {
                    if (openFacet !== null) setQuery({...query, [openFacet]: values});
                }}/>
        </>
    );
}
