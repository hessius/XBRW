import {useEffect, useState} from "react";
import {AppState} from "react-native";

/**
 * The time, read once on mount and again each time the app comes back to the
 * foreground.
 *
 * For day-grained displays such as a bag's freshness, where a clock ticking
 * through render would be wasted work and `Date.now()` in render is impure.
 * Coming back to the app is when a day can have turned over, so that is when
 * it is read again. The pattern is `useRatingPrompt`'s.
 */
export function useNow(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const subscription = AppState.addEventListener("change", (next) => {
            if (next === "active") setNow(Date.now());
        });
        return () => subscription.remove();
    }, []);
    return now;
}

export default useNow;
