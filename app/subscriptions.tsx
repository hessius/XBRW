import router from "@/hooks/steadyRouter";
import React, {useState} from "react";
import {ScrollView, Text, YStack} from "tamagui";

import {openLink} from "@/components/openLink";
import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import UnsubscribeSheet from "@/components/UnsubscribeSheet";
import {palette} from "@/constants/colors";
import {useScrollEndPadding} from "@/hooks/useBottomInset";
import {sharedSettings} from "@/hooks/useSetting";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRoasterSubscriptions} from "@/hooks/useRoasterSubscriptions";
import {readCatalogue, updatedAgo} from "@/library/roasterCatalogue";
import type {RoasterFeed} from "@/library/roasterFeed";
import type {RoasterSubscription, SyncError} from "@/library/roasterSubscription";
import type {Settings} from "@/library/Settings";

const ERROR_TEXT: Record<SyncError, string> = {
    network:    "no connection to the roaster",
    unreadable: "the roaster's list could not be read"
};

/** The one line that says how fresh a subscription is. */
export function statusLine(sub: RoasterSubscription, now: number): string {
    if (sub.paused) return "Updates paused.";
    if (sub.lastError !== undefined) return `Couldn't update: ${ERROR_TEXT[sub.lastError]}.`;
    if (sub.lastSync === 0) return "Not updated yet.";
    return `${updatedAgo(sub.lastSync, now)}.`;
}

/** "30 coffees · 4 sold out", from the cached catalogue. */
export function countLine(feed: RoasterFeed | null): string {
    if (feed === null) return "Not loaded yet";
    const total = feed.coffees.length;
    const soldOut = feed.coffees.filter((coffee) => !coffee.available).length;
    const coffees = total === 1 ? "1 coffee" : `${total} coffees`;
    return soldOut > 0 ? `${coffees} · ${soldOut} sold out` : coffees;
}

/** A feed key without its scheme, which is noise on a phone-width row. */
function shownKey(key: string): string {
    return key.replace(/^https:\/\//, "");
}

/**
 * Roaster subscriptions: the roasters whose coffees are in the catalogue.
 *
 * Reached from Settings and from the catalogue's roaster list. Each
 * subscription says how many coffees it holds, how fresh it is, and offers
 * what a person might want: browse it, update it now, stop for a while, stop
 * for good, and go to the roaster. Below them, the roasters the user asked
 * never to be asked about, so that answer can be taken back.
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
    const [ending, setEnding] = useState<RoasterSubscription | null>(null);
    const covered = ratingNoteOpen || ending !== null;
    const tick = () => setNow((clock ?? Date.now)());
    const scrollEnd = useScrollEndPadding(48);

    return (
        <YStack testID="subscriptions-screen" flex={1} backgroundColor={palette.base}>
            <YStack flex={1} testID="subscriptions-content"
                    accessibilityElementsHidden={covered}
                    importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title="Subscriptions" onBack={() => router.back()}/>
                <ScrollView testID="subscriptions-scroll"
                            contentContainerStyle={{padding: 16, paddingBottom: scrollEnd}}>
                    {subs.subscriptions.length === 0 && (
                        <Text testID="subscriptions-empty" fontSize={14} lineHeight={20}
                              color={palette.dim} paddingTop="$4">
                            Subscriptions appear here when you open a roaster&apos;s import link.
                        </Text>
                    )}

                    {subs.subscriptions.map((sub) => (
                        <SettingsSection key={sub.feed} title={sub.roaster}>
                            <YStack testID="subscription-status" paddingVertical="$3"
                                    paddingHorizontal="$4" gap="$1" accessible>
                                <Text fontSize={16} color={palette.text}>
                                    {countLine(readCatalogue(store, sub.feed)?.feed ?? null)}
                                </Text>
                                <Text fontSize={13} color={palette.dim}>
                                    {subs.refreshing === sub.feed ? "Updating…" : statusLine(sub, now)}
                                </Text>
                            </YStack>
                            <SettingsActionRow label="Browse coffees"
                                               onPress={() => router.push({pathname: "/roaster",
                                                                           params: {feed: sub.feed}})}/>
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
                            {sub.roasterUrl !== undefined && (
                                <SettingsActionRow label="Open roaster's site"
                                                   detail={shownKey(sub.roasterUrl)}
                                                   onPress={() => openLink(sub.roasterUrl as string)}/>
                            )}
                            <SettingsActionRow label="Unsubscribe" tone="danger"
                                               detail="Recipes in your library stay."
                                               onPress={() => setEnding(sub)}/>
                        </SettingsSection>
                    ))}

                    {subs.optOuts.length > 0 && (
                        <SettingsSection title="Not asked about">
                            {subs.optOuts.map((key) => (
                                <SettingsActionRow key={key} label={shownKey(key)}
                                                   detail="Ask again"
                                                   onPress={() => subs.askAgain(key)}/>
                            ))}
                        </SettingsSection>
                    )}
                </ScrollView>
            </YStack>

            <UnsubscribeSheet open={ending !== null}
                              roaster={ending?.roaster ?? ""}
                              onOpenChange={(next) => {
                                  if (!next) setEnding(null);
                              }}
                              onConfirm={() => {
                                  if (ending !== null) subs.unsubscribe(ending);
                                  setEnding(null);
                              }}/>
        </YStack>
    );
}
