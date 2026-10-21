import {rowLine} from "@/library/subscriptionStatus";
import type {RoasterSubscription} from "@/library/roasterSubscription";

const subscription: RoasterSubscription = {
    feed: "https://coffee.example/feed.json",
    roaster: "Coffee",
    lastSync: 0,
    lastAttempt: 0,
    paused: false
};

it.each([undefined, "network", "unreadable"] as const)(
    "shows paused updates without a cached catalogue, previous error %s", lastError => {
        expect(rowLine({...subscription, paused: true, lastError}, null, 1000))
            .toBe("Updates paused");
    }
);

it("keeps loading and failure copy for active subscriptions without a cache", () => {
    expect(rowLine(subscription, null, 1000)).toBe("Loading coffees");
    expect(rowLine({...subscription, lastError: "network"}, null, 1000)).toBe("Couldn't update");
});
