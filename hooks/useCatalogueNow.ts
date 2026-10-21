import {useEffect, useState} from "react";
import {AppState} from "react-native";

const MINUTE_MS = 60_000;

/** Relative catalogue status, refreshed independently of brew animation clocks. */
export function useCatalogueNow(clock: () => number = Date.now): number {
    const [now, setNow] = useState(clock);
    useEffect(() => {
        const refresh = () => setNow(clock());
        const timer = setInterval(refresh, MINUTE_MS);
        const listener = AppState.addEventListener("change", state => {
            if (state === "active") refresh();
        });
        return () => {
            clearInterval(timer);
            listener.remove();
        };
    }, [clock]);
    return now;
}
