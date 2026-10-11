import {useLayoutEffect, useSyncExternalStore} from "react";

type BarGuard = {
    covered: boolean;
    requestNavigation?: (navigate: () => void) => void;
};

// Only focused Easy Mode hosts register here. This does not own or stop a brew.
const guards = new Set<BarGuard>();
const listeners = new Set<() => void>();
const covered = () => [...guards].some(guard => guard.covered);
function publish(): void {
    for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function useLiveBrewBarGuard(enabled: boolean, guard: BarGuard): void {
    const {covered, requestNavigation} = guard;
    useLayoutEffect(() => {
        if (!enabled) return;
        const entry = {covered, requestNavigation};
        guards.add(entry);
        publish();
        return () => {
            guards.delete(entry);
            publish();
        };
    }, [enabled, covered, requestNavigation]);
}

export function useLiveBrewBarCovered(): boolean {
    return useSyncExternalStore(subscribe, covered, covered);
}

export function performLiveBrewBarAction(action: () => void): void {
    if (!covered()) action();
}

export function requestLiveBrewBarNavigation(navigate: () => void): void {
    if (covered()) return;
    const guard = [...guards].find(entry => entry.requestNavigation !== undefined);
    if (guard?.requestNavigation !== undefined) guard.requestNavigation(navigate);
    else navigate();
}
