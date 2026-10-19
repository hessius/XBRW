import {useEffect, useState} from "react";
import {AppState} from "react-native";

/**
 * The time, read on mount, at local midnight and on returning to the foreground.
 *
 * For day-grained displays such as a bag's freshness, where a clock ticking
 * through render would be wasted work and `Date.now()` in render is impure.
 * Calendar midnight, not a 24-hour interval, keeps daylight-saving days correct.
 */
export function useNow(clock: () => number = Date.now): number {
    const [now, setNow] = useState(() => clock());
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        function scheduleMidnight() {
            const at = clock();
            const midnight = new Date(at);
            midnight.setHours(24, 0, 0, 0);
            timer = setTimeout(() => {
                setNow(clock());
                scheduleMidnight();
            }, midnight.getTime() - at);
        }
        scheduleMidnight();
        const subscription = AppState.addEventListener("change", (next) => {
            if (next === "active") {
                clearTimeout(timer);
                setNow(clock());
                scheduleMidnight();
            }
        });
        return () => {
            clearTimeout(timer);
            subscription.remove();
        };
    }, [clock]);
    return now;
}

export default useNow;
