import {useLayoutEffect, useRef} from "react";
import {Appearance as NativeAppearance, AppState} from "react-native";
import * as SystemUI from "expo-system-ui";

import type {Appearance} from "@/constants/colors";
import {notify} from "@/components/XbrwToast";

export function useNativeAppearance({scheme, palette: {base}}: Appearance): void {
    const writes = useRef(Promise.resolve());
    const mounted = useRef(false);

    useLayoutEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useLayoutEffect(() => {
        let active = true;

        function apply() {
            if (!active) return;
            try {
                NativeAppearance.setColorScheme(scheme);
            } catch {
                notify({tone: "error", message: "The native colour scheme could not be updated."});
            }

            // Native writes cannot be cancelled. Drain an in-flight write before
            // applying a newer background, skipping superseded queued choices.
            writes.current = writes.current.then(async () => {
                if (active) await SystemUI.setBackgroundColorAsync(base);
            }).catch(() => {
                if (mounted.current) {
                    notify({tone: "error", message: "The native background could not be updated."});
                }
            });
        }

        apply();
        const subscription = AppState.addEventListener("change", state => {
            if (state === "active") apply();
        });
        return () => {
            active = false;
            subscription.remove();
        };
    }, [scheme, base]);
}
