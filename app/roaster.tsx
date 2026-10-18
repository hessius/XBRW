import {useLocalSearchParams} from "expo-router";
import React, {useState} from "react";
import {FlatList} from "react-native-gesture-handler";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {YStack} from "tamagui";

import {CatalogueStatus} from "@/components/CatalogueParts";
import RoasterCoffeeRow from "@/components/RoasterCoffeeRow";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {UNCLIPPED_LIST} from "@/constants/lists";
import router from "@/hooks/steadyRouter";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {coffeeRef, readCatalogue, updatedAgo} from "@/library/roasterCatalogue";
import type {Settings} from "@/library/Settings";

/**
 * One roaster's coffees.
 *
 * The cached feed, drawn as the catalogue draws a list: photo, name, roast
 * level, tasting notes and bag sizes, on sale first and sold out after, so
 * the list leads with what can be bought and still shows what someone may
 * have a bag of. Opening a coffee is the first moment xBloom is asked
 * anything.
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
    const [at] = useState(() => (now ?? Date.now)());
    const insets = useSafeAreaInsets();
    const cached = readCatalogue(store, feed);

    if (cached === null) {
        return (
            <YStack flex={1} backgroundColor={palette.base}>
                <ScreenHeader title="ROASTER" onBack={() => router.back()}/>
                <CatalogueStatus testID="roaster-missing" title="NOT IN THE CATALOGUE"
                                 body="This roaster's coffees are not in the catalogue. Subscribe from one of its import links."/>
            </YStack>
        );
    }

    const coffees = [
        ...cached.feed.coffees.filter((coffee) => coffee.available),
        ...cached.feed.coffees.filter((coffee) => !coffee.available)
    ];

    return (
        <YStack testID="roaster-screen" flex={1} backgroundColor={palette.base}>
            <ScreenHeader title={cached.feed.roaster.name} count={coffees.length}
                          meta={updatedAgo(cached.fetchedAt, at)}
                          onBack={() => router.back()}/>
            <FlatList {...UNCLIPPED_LIST}
                testID="roaster-list"
                data={coffees}
                keyExtractor={(coffee) => coffeeRef(cached.feed, coffee)}
                contentContainerStyle={{paddingBottom: insets.bottom + 8}}
                renderItem={({item}) => (
                    <RoasterCoffeeRow
                        coffee={item}
                        testID={`roaster-coffee-${coffeeRef(cached.feed, item)}`}
                        onPress={() => router.push({
                            pathname: "/roasterCoffee",
                            params:   {feed, coffee: coffeeRef(cached.feed, item)}
                        })}/>
                )}/>
        </YStack>
    );
}
