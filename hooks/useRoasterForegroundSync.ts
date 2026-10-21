import {useEffect} from "react";
import {AppState} from "react-native";

import {notify} from "@/components/XbrwToast";
import {announceBack} from "@/hooks/useRoasterSubscriptions";
import {sharedSettings} from "@/hooks/useSetting";
import {syncDue} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";

/** One root owner, independent of which screen happens to be mounted. */
export function useRoasterForegroundSync(settings?: Settings): void {
    const store = settings ?? sharedSettings();
    useEffect(() => {
        async function sync() {
            try {
                const results = await syncDue({settings: store});
                for (const result of results) announceBack(result);
            } catch {
                notify({
                    tone: "error",
                    message: "Your saved roasters could not be updated. Try Refresh in Roaster feeds."
                });
            }
        }
        void sync();
        const listener = AppState.addEventListener("change", (state) => {
            if (state === "active") void sync();
        });
        return () => listener.remove();
    }, [store]);
}
