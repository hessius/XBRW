import {useLocalSearchParams} from "expo-router";
import React, {useState} from "react";
import {ScrollView, Text, YStack} from "tamagui";

import {CatalogueStatus} from "@/components/CatalogueParts";
import {openLink} from "@/components/openLink";
import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import UnsubscribeSheet from "@/components/UnsubscribeSheet";
import {palette} from "@/constants/colors";
import router from "@/hooks/steadyRouter";
import {useScrollEndPadding} from "@/hooks/useBottomInset";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRoasterSubscriptions} from "@/hooks/useRoasterSubscriptions";
import {readCatalogue} from "@/library/roasterCatalogue";
import type {RoasterFeed} from "@/library/roasterFeed";
import {pinDescription} from "@/library/roasterHome";
import {subscriptionFor} from "@/library/roasterSubscription";
import {countLine, shownKey, statusLine} from "@/library/subscriptionStatus";
import type {Settings} from "@/library/Settings";

/**
 * One roaster subscription and what can be done to it.
 *
 * Opened from a row on the subscriptions list, or straight from the roaster's
 * coffee list by MANAGE FEED. Says how many coffees the subscription
 * holds and how fresh they are, then offers what a person might want: browse
 * the coffees, go to the roaster, update now, stop for a while, stop for good,
 * and pin it to the home screen.
 *
 * Unsubscribing lands on the subscriptions list: popped back to when this was
 * opened from it, put in this screen's place when it was not, so the screen
 * never stays up for a roaster that is gone.
 */
export default function SubscriptionScreen({settings, feedUrl, fetchBody, now: clock}: {
    /** Injected by tests; production reads the route. */
    settings?: Settings;
    feedUrl?: string;
    fetchBody?: (url: string, signal?: AbortSignal) => Promise<{feed: RoasterFeed; body: string}>;
    now?: () => number;
} = {}) {
    const params = useLocalSearchParams<{feed: string}>();
    const feed = feedUrl ?? params.feed ?? "";
    const {ratingNoteOpen} = useLiveBrew();
    const store = settings ?? sharedSettings();
    const subs = useRoasterSubscriptions({settings: store, fetchBody, now: clock});
    // Read once and again after each action, as the list does.
    const [now, setNow] = useState(() => (clock ?? Date.now)());
    const [ending, setEnding] = useState(false);
    const tick = () => setNow((clock ?? Date.now)());
    const scrollEnd = useScrollEndPadding(48);
    const sub = subscriptionFor(subs.subscriptions, feed);
    const [onHome] = useSetting("showRoastersOnHome", store);
    const covered = ratingNoteOpen || ending;

    if (sub === undefined) {
        return (
            <YStack testID="subscription-missing" flex={1} backgroundColor={palette.base}>
                <ScreenHeader title="Roaster feed" onBack={() => router.back()}/>
                <CatalogueStatus title="NOT SUBSCRIBED"
                                 body="Roasters appear here when you subscribe from a roaster's import link."/>
            </YStack>
        );
    }

    return (
        <YStack testID="subscription-screen" flex={1} backgroundColor={palette.base}>
            <YStack flex={1} testID="subscription-content"
                    accessibilityElementsHidden={covered}
                    importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title={sub.roaster} titleLines={2} onBack={() => router.back()}/>
                <ScrollView testID="subscription-scroll"
                            contentContainerStyle={{padding: 16, paddingBottom: scrollEnd}}>
                    <SettingsSection>
                        <YStack testID="subscription-status" paddingVertical="$3"
                                paddingHorizontal="$4" gap="$1" accessible>
                            <Text fontSize={16} color={palette.text}>
                                {countLine(readCatalogue(store, sub.feed)?.feed ?? null)}
                            </Text>
                            <Text fontSize={13} color={palette.dim}>
                                {subs.refreshing === sub.feed ? "Updating…" : statusLine(sub, now)}
                            </Text>
                        </YStack>
                    </SettingsSection>

                    <SettingsSection>
                        <SettingsActionRow label="Browse coffees"
                                           onPress={() => router.push({pathname: "/roaster",
                                                                       params: {feed: sub.feed}})}/>
                        {sub.roasterUrl !== undefined && (
                            <SettingsActionRow label={`Open ${sub.roaster}'s site`}
                                               detail={shownKey(sub.roasterUrl)}
                                               onPress={() => openLink(sub.roasterUrl as string)}/>
                        )}
                        <SettingsActionRow label="Refresh now"
                                           detail={`Checks ${sub.roaster} for new and sold-out coffees.`}
                                           onPress={() => {
                                               if (subs.refreshing !== null) return;
                                               void subs.refresh(sub).then(tick);
                                           }}/>
                        {sub.paused ? (
                            <SettingsActionRow label="Resume updates"
                                               onPress={() => {
                                                   subs.resume(sub);
                                                   tick();
                                               }}/>
                        ) : (
                            <SettingsActionRow label="Pause updates"
                                               detail="The catalogue stays as it is until you resume."
                                               onPress={() => subs.pause(sub)}/>
                        )}
                    </SettingsSection>

                    <SettingsSection>
                        <SettingsToggleRow label="Pin to the home screen"
                                           description={pinDescription(subs.subscriptions.length, onHome)}
                                           value={sub.pinnedAt !== undefined}
                                           onChange={(next) => subs.pin(sub, next)}/>
                    </SettingsSection>

                    <SettingsSection>
                        <SettingsActionRow label="Unsubscribe" tone="danger"
                                           detail="Recipes in your library stay."
                                           onPress={() => setEnding(true)}/>
                    </SettingsSection>
                </ScrollView>
            </YStack>

            <UnsubscribeSheet open={ending}
                              roaster={sub.roaster}
                              onOpenChange={(next) => {
                                  if (!next) setEnding(false);
                              }}
                              onConfirm={() => {
                                  setEnding(false);
                                  subs.unsubscribe(sub);
                                  router.dismissTo("/subscriptions");
                              }}/>
        </YStack>
    );
}
