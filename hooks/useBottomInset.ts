import {useLayoutEffect, useSyncExternalStore} from "react";
import {Platform} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";

/**
 * The bottom of the app, and who has to clear what is under it.
 *
 * Android 15 and later draw the app under the navigation bar. With gesture
 * navigation that is a strip of 16 to 24 points with a handle on it; with
 * three-button navigation it is a 48 point bar the system paints opaque, and
 * anything under it can be neither seen nor pressed. iOS has the same thing in
 * the home indicator, 34 points on a notched phone. Each of them is reported
 * as the bottom safe-area inset, and every surface that reaches the bottom of
 * the display has to pad by it: a scroll view so its last row can scroll clear,
 * a pinned bar so its buttons sit above, a sheet so its frame ends above.
 *
 * The one exception is the live brew bar. It is mounted beside the navigator
 * and pads itself by the inset, so while it is drawn every screen ends at its
 * top edge rather than at the bottom of the display, and has nothing to clear.
 * Read through `useBottomInset` and a screen gets that right without knowing
 * the bar exists: the inset while nothing is under it, zero while the bar is.
 */
let takers = 0;
const listeners = new Set<() => void>();

function publish(): void {
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

const taken = () => takers > 0;

/**
 * Declares that the caller is a bar beside the navigator padding itself by the
 * bottom inset, so the screens above it have none left to clear.
 *
 * A layout effect, so the screens hear about it before the frame is painted
 * rather than drawing one frame with the gap doubled.
 */
export function useTakesBottomInset(): void {
    useLayoutEffect(() => {
        takers += 1;
        publish();
        return () => {
            takers -= 1;
            publish();
        };
    }, []);
}

/**
 * The bottom inset this screen's own content has to clear, in points.
 *
 * Use this rather than `useSafeAreaInsets().bottom` anywhere inside a screen.
 * Only the bars that take the inset themselves read the raw value.
 */
export function useBottomInset(): number {
    const {bottom} = useSafeAreaInsets();
    const isTaken = useSyncExternalStore(subscribe, taken, taken);
    return isTaken ? 0 : bottom;
}

/**
 * Bottom padding for a bar pinned to the bottom of a screen.
 *
 * On iOS the bar may sink `sink` points into the home indicator's area: the
 * inset there is clearance for a swipe, the indicator is a thin line, and the
 * full inset read as the bar floating. On Android the bar gets the whole
 * inset. With three-button navigation the inset is an opaque bar, and sinking
 * into it hides the bottom of the buttons; with gesture navigation the inset is
 * already small enough that the full amount does not read as a gap.
 */
export function pinnedBarPadding(inset: number, sink: number): number {
    return Platform.OS === "ios" ? Math.max(inset - sink, 0) : inset;
}

/**
 * Bottom padding for the end of a screen's scroll view, in points.
 *
 * The last row scrolls to `clearance` points above whatever is under the
 * screen, and never to less than the `minimum` the screen was designed with.
 * A maximum rather than a sum, so a phone with a small inset (gesture
 * navigation, the home indicator) keeps the end the screen was tuned with,
 * and only an inset big enough to hide the last row moves it.
 */
export function useScrollEndPadding(minimum: number, clearance = 24): number {
    const bottomInset = useBottomInset();
    return Math.max(minimum, bottomInset + clearance);
}
