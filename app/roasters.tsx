import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import {AlertDot, CatalogueStatus} from "@/components/CatalogueParts";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import router from "@/hooks/steadyRouter";
import {useScrollEndPadding} from "@/hooks/useBottomInset";
import {useNow} from "@/hooks/useNow";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {alertSummary, readAlerts} from "@/library/roasterAlerts";
import {readCatalogue, updatedAgo} from "@/library/roasterCatalogue";
import {parseSubscriptions} from "@/library/roasterSubscription";
import type {Settings} from "@/library/Settings";

/**
 * The roasters in the catalogue: every subscription, one row each.
 *
 * Reached from the catalogue screen. Drawn entirely from the cached feeds, so
 * opening it costs no request; the feeds are refreshed by the sync on app
 * open and by REFRESH NOW on the Roaster feeds screen, which this links to.
 */
export default function RoastersScreen({settings, now}: {
    /** Injected by tests. */
    settings?: Settings;
    now?: () => number;
} = {}) {
    const store = settings ?? sharedSettings();
    const [stored] = useSetting("roasterSubscriptions", store);
    // Subscribed so the counts follow a sync that lands while this is open.
    useSetting("roasterCatalogue", store);
    // And so the dots follow a coffee being opened or a sync flagging one.
    useSetting("roasterAlerts", store);
    const at = useNow(now);
    const scrollEnd = useScrollEndPadding(48);
    const subscriptions = parseSubscriptions(stored);

    return (
        <YStack testID="roasters-screen" flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="ROASTERS" count={subscriptions.length} onBack={() => router.back()}/>
            {subscriptions.length === 0 ? (
                <CatalogueStatus testID="roasters-empty" title="NO ROASTERS YET"
                                 body="Roasters appear here when you subscribe from a roaster's import link."/>
            ) : (
                <ScrollView testID="roasters-scroll"
                            contentContainerStyle={{paddingTop: 8, paddingBottom: scrollEnd}}>
                    {subscriptions.map((sub) => {
                        const cached = readCatalogue(store, sub.feed);
                        const count = cached?.feed.coffees.length ?? 0;
                        const onSale = cached?.feed.coffees.filter((coffee) => coffee.available).length ?? 0;
                        const detail = [
                            count === 1 ? "1 coffee" : `${count} coffees`,
                            onSale < count ? `${count - onSale} sold out` : undefined,
                            sub.lastSync > 0 ? updatedAgo(sub.lastSync, at) : undefined
                        ].filter((part) => part !== undefined).join(" · ");
                        const alerts = alertSummary(readAlerts(store, sub.feed));
                        const spoken = alerts.spoken === undefined
                            ? `${sub.roaster}, ${detail}`
                            : `${sub.roaster}, ${alerts.spoken}, ${detail}`;
                        return (
                            <Pressable key={sub.feed} testID={`roaster-${sub.roaster}`}
                                       accessibilityRole="button"
                                       accessibilityLabel={spoken}
                                       onPress={() => router.push({pathname: "/roaster",
                                                                   params: {feed: sub.feed}})}>
                                <XStack alignItems="center" gap="$3" paddingHorizontal="$4"
                                        paddingVertical="$3" minHeight={56}>
                                    <YStack flex={1} gap="$1">
                                        <Text fontSize={17} fontWeight="700" color={palette.text}>
                                            {sub.roaster}
                                        </Text>
                                        <Text fontSize={13} color={palette.dim}>{detail}</Text>
                                    </YStack>
                                    <AlertDot count={alerts.count} testID={`roaster-${sub.roaster}-dot`}/>
                                    <XStack style={{transform: [{rotate: "180deg"}]}}>
                                        <DotIcon name="back" size={14} color={palette.muted}/>
                                    </XStack>
                                </XStack>
                            </Pressable>
                        );
                    })}
                    <Pressable accessibilityRole="button" accessibilityLabel="Manage feeds"
                               testID="roasters-manage"
                               onPress={() => router.push("/subscriptions")}>
                        <XStack paddingHorizontal="$4" paddingVertical="$4">
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                           color={palette.dim}>
                                MANAGE FEEDS
                            </DotMatrixText>
                        </XStack>
                    </Pressable>
                </ScrollView>
            )}
        </YStack>
    );
}
