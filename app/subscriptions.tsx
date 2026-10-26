import {useAppearance} from "@/hooks/useAppearance";
import router from "@/hooks/steadyRouter";
import React from "react";
import {useCatalogueNow} from "@/hooks/useCatalogueNow";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ScrollView, Text, YStack} from "tamagui";

import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {notify} from "@/components/XbrwToast";

import {sharedSettings} from "@/hooks/useSetting";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRoasterSubscriptions} from "@/hooks/useRoasterSubscriptions";
import {BUILT_IN_FEEDS, setBuiltInOn, type BuiltInFeed} from "@/library/builtInFeeds";
import {readCatalogue, scrollEndPadding} from "@/library/roasterCatalogue";
import type {RoasterFeed} from "@/library/roasterFeed";
import {parseSubscriptions, subscriptionFor} from "@/library/roasterSubscription";
import {rowLine, shownKey} from "@/library/subscriptionStatus";
import type {Settings} from "@/library/Settings";

/**
 * Roaster feeds: the roasters whose coffees are in the catalogue.
 *
 * Reached from Settings and from the catalogue's roaster list. One row per
 * roaster, saying how many coffees it holds and how fresh they are; a row
 * opens that roaster's own screen (`app/subscription.tsx`), where it can be
 * browsed, refreshed, paused or ended. REFRESH ALL updates every roaster that
 * is not paused. Below them, the roasters the user asked never to be asked
 * about, so that answer can be taken back. Above them, the feeds the app
 * ships with (`library/builtInFeeds.ts`), each a switch: on subscribes and
 * reads it now, off unsubscribes.
 */
export default function SubscriptionsScreen({settings, fetchBody, now: clock, builtInFeeds = BUILT_IN_FEEDS}: {
    /** Injected by tests. */
    settings?: Settings;
    fetchBody?: (url: string, signal?: AbortSignal) => Promise<{feed: RoasterFeed; body: string}>;
    now?: () => number;
    builtInFeeds?: readonly BuiltInFeed[];
} = {}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const {ratingNoteOpen} = useLiveBrew();
    const store = settings ?? sharedSettings();
    const subs = useRoasterSubscriptions({settings: store, fetchBody, now: clock});
    const now = useCatalogueNow(clock);
    const insets = useSafeAreaInsets();
    const active = subs.subscriptions.filter((sub) => !sub.paused);

    return (
        <YStack testID="subscriptions-screen" flex={1} backgroundColor={palette.base}>
            <YStack flex={1} testID="subscriptions-content"
                    accessibilityElementsHidden={ratingNoteOpen}
                    importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title="Roaster feeds" onBack={() => router.back()}/>
                <ScrollView testID="subscriptions-scroll"
                            contentContainerStyle={{padding: 16, paddingBottom: scrollEndPadding(48, insets.bottom)}}>
                    {builtInFeeds.length > 0 && <SettingsSection title="Built in">
                        {builtInFeeds.map((feed) => (
                            <SettingsToggleRow key={feed.feed} label={feed.roaster}
                                               description={feed.description}
                                               value={subscriptionFor(subs.subscriptions, feed.feed) !== undefined}
                                               onChange={(on) => {
                                                   try {
                                                       setBuiltInOn(store, feed, on);
                                                   } catch {
                                                       notify({tone: "error", message: "Could not save the subscription. Please try again."});
                                                       return;
                                                   }
                                                   const sub = subscriptionFor(
                                                       parseSubscriptions(store.get("roasterSubscriptions")), feed.feed);
                                                   if (on && sub !== undefined && subs.refreshing === null) {
                                                       void subs.refresh(sub);
                                                   }
                                               }}/>
                        ))}
                    </SettingsSection>}

                    {subs.subscriptions.length === 0 && (
                        <Text testID="subscriptions-empty" fontSize={14} lineHeight={20}
                              color={palette.dim} paddingTop="$4">
                            Other roasters appear here when you subscribe from a roaster&apos;s import link.
                        </Text>
                    )}

                    {subs.subscriptions.length > 0 && (
                        <SettingsSection title="Your roasters">
                            {subs.subscriptions.map((sub) => (
                                <SettingsActionRow key={sub.feed} label={sub.roaster}
                                                   detail={subs.refreshing === sub.feed
                                                       ? "Updating…"
                                                       : rowLine(sub, readCatalogue(store, sub.feed)?.feed ?? null, now)}
                                                   onPress={() => router.push({pathname: "/subscription",
                                                                               params: {feed: sub.feed}})}/>
                            ))}
                        </SettingsSection>
                    )}

                    {active.length > 0 && (
                        <SettingsSection>
                            <SettingsActionRow label="Refresh all"
                                               detail={active.length === subs.subscriptions.length
                                                   ? "Checks every roaster for new and sold-out coffees."
                                                   : "Checks every roaster that isn't paused."}
                                               onPress={() => {
                                                   if (subs.refreshing !== null) return;
                                                   void subs.refreshAll();
                                               }}/>
                        </SettingsSection>
                    )}

                    {subs.optOuts.length > 0 && (
                        <SettingsSection title="Asked not to">
                            {subs.optOuts.map((key) => (
                                <SettingsActionRow key={key} label={shownKey(key)}
                                                   detail="Ask again"
                                                   onPress={() => subs.askAgain(key)}/>
                            ))}
                        </SettingsSection>
                    )}
                </ScrollView>
            </YStack>
        </YStack>
    );
}
