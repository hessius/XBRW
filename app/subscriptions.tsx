import router from "@/hooks/steadyRouter";
import React, {useState} from "react";
import {ScrollView, Text, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {palette} from "@/constants/colors";
import {useScrollEndPadding} from "@/hooks/useBottomInset";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRoasterSubscriptions} from "@/hooks/useRoasterSubscriptions";
import {readCatalogue} from "@/library/roasterCatalogue";
import type {RoasterFeed} from "@/library/roasterFeed";
import {rowLine, shownKey} from "@/library/subscriptionStatus";
import type {Settings} from "@/library/Settings";

/**
 * Roaster feeds: the roasters whose coffees are in the catalogue.
 *
 * Reached from Settings and from the catalogue's roaster list. At the top,
 * whether the roasters show on the home screen at all. Then one row per
 * roaster, saying how many coffees it holds and how fresh they are; a row
 * opens that roaster's own screen (`app/subscription.tsx`), where it can be
 * browsed, refreshed, paused or ended. REFRESH ALL updates every roaster that
 * is not paused. Below them, the roasters the user asked never to be asked
 * about, so that answer can be taken back.
 */
export default function SubscriptionsScreen({settings, fetchBody, now: clock}: {
    /** Injected by tests. */
    settings?: Settings;
    fetchBody?: (url: string, signal?: AbortSignal) => Promise<{feed: RoasterFeed; body: string}>;
    now?: () => number;
} = {}) {
    const {ratingNoteOpen} = useLiveBrew();
    const store = settings ?? sharedSettings();
    const subs = useRoasterSubscriptions({settings: store, fetchBody, now: clock});
    // Read once and again after each action, rather than on every render: a
    // render must be pure, and "2 h ago" does not need to tick.
    const [now, setNow] = useState(() => (clock ?? Date.now)());
    const tick = () => setNow((clock ?? Date.now)());
    const scrollEnd = useScrollEndPadding(48);
    const active = subs.subscriptions.filter((sub) => !sub.paused);
    const [onHome, setOnHome] = useSetting("showRoastersOnHome", store);

    return (
        <YStack testID="subscriptions-screen" flex={1} backgroundColor={palette.base}>
            <YStack flex={1} testID="subscriptions-content"
                    accessibilityElementsHidden={ratingNoteOpen}
                    importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title="Roaster feeds" onBack={() => router.back()}/>
                <ScrollView testID="subscriptions-scroll"
                            contentContainerStyle={{padding: 16, paddingBottom: scrollEnd}}>
                    {subs.subscriptions.length > 0 && (
                        <SettingsSection>
                            <SettingsToggleRow label="Show roasters on the home screen"
                                               description="Under the tiles, and a button on an empty library. Search finds their coffees either way."
                                               value={onHome}
                                               onChange={setOnHome}/>
                        </SettingsSection>
                    )}

                    {subs.subscriptions.length === 0 && (
                        <Text testID="subscriptions-empty" fontSize={14} lineHeight={20}
                              color={palette.dim} paddingTop="$4">
                            Roasters appear here when you subscribe from a roaster&apos;s import link.
                        </Text>
                    )}

                    {subs.subscriptions.length > 0 && (
                        <SettingsSection title="Your roasters">
                            {subs.subscriptions.map((sub) => (
                                <SettingsActionRow key={sub.feed} label={sub.roaster}
                                                   mark={sub.pinnedAt === undefined ? undefined : {
                                                       glyph:  <DotIcon name="favourite" size={12}
                                                                        color={palette.muted}/>,
                                                       spoken: "pinned to the home screen"
                                                   }}
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
                                                   void subs.refreshAll().then(tick);
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
