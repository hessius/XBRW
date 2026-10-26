import React, {createContext, useContext, useEffect, useRef} from "react";
import {Theme} from "tamagui";

import {resolveAppearance, type Appearance} from "@/constants/colors";
import {useSetting} from "@/hooks/useSetting";
import {readAppearanceChoice, type AppearanceChoice} from "@/library/appearance";
import type {Notice} from "@/library/notify";
import type {Settings} from "@/library/Settings";

type AppearanceContextValue = Appearance & {solidControlLabels: boolean};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceScope({choice, solidControlLabels = false, children}: {
    choice: AppearanceChoice;
    solidControlLabels?: boolean;
    children: React.ReactNode;
}) {
    const appearance = resolveAppearance(choice);
    return (
        <AppearanceContext.Provider value={{...appearance, solidControlLabels}}>
            <Theme name={appearance.scheme}>{children}</Theme>
        </AppearanceContext.Provider>
    );
}

export function useAppearance(): AppearanceContextValue {
    const appearance = useContext(AppearanceContext);
    if (appearance === null) throw new Error("AppearanceScope is missing");
    return appearance;
}

export function AppearanceProvider({settings, onInvalidPreferences, children}: {
    settings?: Settings;
    onInvalidPreferences: (notice: Notice) => void;
    children: React.ReactNode;
}) {
    const [appearanceTheme] = useSetting("appearanceTheme", settings);
    const [recipeColourMode] = useSetting("recipeColourMode", settings);
    const [solidControlLabels] = useSetting("solidControlLabels", settings);
    const {choice, invalidKeys} = readAppearanceChoice(appearanceTheme, recipeColourMode);
    const invalidSignature = invalidKeys.length === 0
        ? null
        : JSON.stringify([appearanceTheme, recipeColourMode, invalidKeys]);
    const reported = useRef(new Set<string>());

    useEffect(() => {
        if (invalidSignature === null) {
            reported.current.clear();
        } else if (!reported.current.has(invalidSignature)) {
            reported.current.add(invalidSignature);
            onInvalidPreferences({
                tone: "error",
                message: "Some appearance preferences could not be read. Default choices are shown."
            });
        }
    }, [invalidSignature, onInvalidPreferences]);

    return <AppearanceScope choice={choice} solidControlLabels={solidControlLabels}>{children}</AppearanceScope>;
}
