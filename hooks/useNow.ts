import {useEffect, useState} from "react";
import {AppState} from "react-native";

export function useNow(clock = Date.now, enabled = true): number | null {
    const [mode, setMode] = useState({enabled, generation: 0});
    const [reading, setReading] = useState(() => ({
        generation: 0, now: enabled ? clock() : null
    }));
    if (mode.enabled !== enabled) setMode({enabled, generation: mode.generation + 1});
    const generation = mode.generation;
    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            const now = clock();
            setReading({generation, now});
            const date = new Date(now);
            const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
            timer = setTimeout(refresh, Math.max(1, next - now));
        };
        timer = setTimeout(refresh, 0);
        const listener = AppState.addEventListener("change", state => {
            if (state !== "active") return;
            if (timer !== undefined) clearTimeout(timer);
            refresh();
        });
        return () => {
            if (timer !== undefined) clearTimeout(timer);
            listener.remove();
        };
    }, [clock, enabled, generation]);
    return enabled && reading.generation === generation ? reading.now : null;
}

export default useNow;
